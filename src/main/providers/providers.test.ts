import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProvider, describeError } from "./index";

interface Seen {
  path: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
}

let server: Server;
let base: string;
const seen: Seen[] = [];

const sse = (events: [string | null, unknown][]) =>
  events.map(([event, data]) => (event ? `event: ${event}\n` : "") + `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`).join("");

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = req.url ?? "";
      seen.push({ path, headers: req.headers, body: raw ? JSON.parse(raw) : {} });
      if (req.headers.authorization === "Bearer bad" || req.headers["x-api-key"] === "bad") {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }));
      }
      if (path.startsWith("/anthropic/v1/messages")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } };
        return res.end(
          sse([
            ["message_start", { type: "message_start", message }],
            ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
            ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "SUBJECT: Hi\n---\n" } }],
            ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Dear Ann," } }],
            ["content_block_stop", { type: "content_block_stop", index: 0 }],
            ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } }],
            ["message_stop", { type: "message_stop" }],
          ]),
        );
      }
      if (path.startsWith("/anthropic/v1/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "claude-opus-5-5", type: "model" }], has_more: false, first_id: null, last_id: null }));
      }
      if (path === "/oai/chat/completions") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (content: string) => ({ id: "c1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { content }, finish_reason: null }] });
        return res.end(sse([[null, chunk("SUBJECT: 你好\n---\n")], [null, chunk("王经理")], [null, "[DONE]"]]));
      }
      if (path === "/oai/models") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ object: "list", data: [{ id: "deepseek-chat", object: "model" }, { id: "text-embedding-3", object: "model" }] }));
      }
      if (path === "/nomodels/models") {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "not found" } }));
      }
      if (path === "/nomodels/chat/completions") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ id: "c", object: "chat.completion", created: 0, model: "glm-4-plus", choices: [{ index: 0, message: { role: "assistant", content: "p" }, finish_reason: "length" }] }));
      }
      if (path.startsWith("/gemini/") && path.includes(":streamGenerateContent")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const part = (text: string) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, index: 0 }] });
        return res.end(sse([[null, part("SUBJECT: こんにちは\n---\n")], [null, part("田中様")]]));
      }
      if (path.startsWith("/gemini/") && path.includes("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ models: [
          { name: "models/gemini-pro-x", supportedGenerationMethods: ["generateContent"] },
          { name: "models/embedding-x", supportedGenerationMethods: ["embedContent"] },
        ] }));
      }
      res.writeHead(404).end();
    });
  }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const turns = [{ role: "user" as const, content: "notes" }];

describe("Anthropic provider", () => {
  it("streams text and sends effort plus server-side fallbacks for Claude 5 models", async () => {
    const p = createProvider({ kind: "anthropic", baseUrl: `${base}/anthropic`, model: "claude-opus-5-5", apiKey: "k" });
    const deltas: string[] = [];
    const text = await p.stream("sys", turns, (d) => deltas.push(d), new AbortController().signal);
    expect(text).toBe("SUBJECT: Hi\n---\nDear Ann,");
    expect(deltas.join("")).toBe(text);
    const req = seen.find((s) => s.path.startsWith("/anthropic/v1/messages"))!;
    expect(req.body).toMatchObject({ model: "claude-opus-5-5", system: "sys", fallbacks: "default", output_config: { effort: "medium" }, stream: true });
    expect(req.body).not.toHaveProperty("temperature");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(await p.listModels()).toEqual(["claude-opus-5-5"]);
  });

  it("omits fallbacks for models that do not support them", async () => {
    seen.length = 0;
    const p = createProvider({ kind: "anthropic", baseUrl: `${base}/anthropic`, model: "claude-haiku-5-5", apiKey: "k" });
    await p.stream("sys", turns, () => {}, new AbortController().signal);
    const req = seen.find((s) => s.path.startsWith("/anthropic/v1/messages"))!;
    expect(req.body).not.toHaveProperty("fallbacks");
    expect(req.headers["anthropic-beta"]).toBeUndefined();
  });

  it("maps a bad key to AUTH", async () => {
    const p = createProvider({ kind: "anthropic", baseUrl: `${base}/anthropic`, model: "claude-opus-5-5", apiKey: "bad" });
    const err = await p.listModels().catch((e) => e);
    expect(describeError(err)).toBe("AUTH");
  });
});

describe("OpenAI-compatible provider", () => {
  it("streams chat completions with the system prompt first", async () => {
    seen.length = 0;
    const p = createProvider({ kind: "deepseek", baseUrl: `${base}/oai`, model: "deepseek-chat", apiKey: "k" });
    const text = await p.stream("sys", turns, () => {}, new AbortController().signal);
    expect(text).toBe("SUBJECT: 你好\n---\n王经理");
    expect(seen[0].body).toMatchObject({ model: "deepseek-chat", stream: true, messages: [{ role: "system", content: "sys" }, { role: "user", content: "notes" }] });
    expect(seen[0].headers.authorization).toBe("Bearer k");
    expect(await p.listModels()).toEqual(["deepseek-chat", "text-embedding-3"]);
  });

  it("falls back to a one-token request when /models is missing", async () => {
    const p = createProvider({ kind: "zhipu", baseUrl: `${base}/nomodels`, model: "glm-4-plus", apiKey: "k" });
    expect(await p.listModels()).toEqual(["glm-4-plus"]);
  });

  it("works without a key for local servers", async () => {
    const p = createProvider({ kind: "custom", baseUrl: `${base}/oai`, model: "llama", apiKey: "" });
    await expect(p.listModels()).resolves.toContain("deepseek-chat");
  });
});

describe("Gemini provider", () => {
  it("streams generateContent with a system instruction and model role mapping", async () => {
    seen.length = 0;
    const p = createProvider({ kind: "gemini", baseUrl: `${base}/gemini`, model: "gemini-pro-x", apiKey: "k" });
    const text = await p.stream("sys", [...turns, { role: "assistant", content: "a" }, { role: "user", content: "b" }], () => {}, new AbortController().signal);
    expect(text).toBe("SUBJECT: こんにちは\n---\n田中様");
    const body = seen[0].body as { contents: { role: string }[]; systemInstruction: unknown };
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(JSON.stringify(body.systemInstruction)).toContain("sys");
    expect(await p.listModels()).toEqual(["gemini-pro-x"]);
  });
});
