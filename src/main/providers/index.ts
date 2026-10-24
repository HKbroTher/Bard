import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { ProviderKind } from "../../shared/types";
import { MockProvider } from "./mock";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Provider {
  /** Stream a reply, calling onDelta for each text chunk; resolves with the full text. */
  stream(system: string, turns: ChatTurn[], onDelta: (text: string) => void, signal: AbortSignal): Promise<string>;
  /** List available model ids; doubles as a connection and key check. */
  listModels(): Promise<string[]>;
}

export interface ProviderOptions {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class RefusalError extends Error {}

// Claude models that accept output_config.effort, and the subset that accepts server-side fallbacks.
const CLAUDE_EFFORT = /^claude-(opus-4-[5-9]|sonnet-4-6|(opus|sonnet|haiku|fable|mythos)-5)/;
const CLAUDE_FALLBACK = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

class AnthropicProvider implements Provider {
  private client: Anthropic;

  constructor(private opts: ProviderOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey, ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}) });
  }

  async stream(system: string, turns: ChatTurn[], onDelta: (text: string) => void, signal: AbortSignal) {
    const model = this.opts.model;
    const fallback = CLAUDE_FALLBACK.test(model);
    const stream = this.client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system,
        messages: turns,
        ...(CLAUDE_EFFORT.test(model) ? { output_config: { effort: "medium" as const } } : {}),
        // Let the API re-run a safety-classifier refusal on its recommended fallback model.
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    stream.on("text", (text) => onDelta(text));
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new RefusalError("refusal");
    return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  async listModels() {
    const ids: string[] = [];
    for await (const m of this.client.models.list()) ids.push(m.id);
    return ids;
  }
}

/** OpenAI and every OpenAI-compatible API (DeepSeek, Qwen, Kimi, GLM, Ollama…). */
class OpenAICompatibleProvider implements Provider {
  private client: OpenAI;

  constructor(private opts: ProviderOptions) {
    this.client = new OpenAI({
      // Local servers such as Ollama ignore the key, but the SDK requires one.
      apiKey: opts.apiKey || "not-needed",
      baseURL: opts.baseUrl || undefined,
    });
  }

  async stream(system: string, turns: ChatTurn[], onDelta: (text: string) => void, signal: AbortSignal) {
    const stream = await this.client.chat.completions.create(
      {
        model: this.opts.model,
        stream: true,
        messages: [{ role: "system", content: system }, ...turns],
      },
      { signal },
    );
    let text = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
    return text;
  }

  async listModels() {
    try {
      const ids: string[] = [];
      for await (const m of this.client.models.list()) ids.push(m.id);
      return ids.sort();
    } catch (err) {
      // Some compatible APIs have no /models endpoint: fall back to a one-token request.
      if (err instanceof OpenAI.APIError && (err.status === 404 || err.status === 405) && this.opts.model) {
        await this.client.chat.completions.create({
          model: this.opts.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        });
        return [this.opts.model];
      }
      throw err;
    }
  }
}

class GeminiProvider implements Provider {
  private client: GoogleGenAI;

  constructor(private opts: ProviderOptions) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey, ...(opts.baseUrl ? { httpOptions: { baseUrl: opts.baseUrl } } : {}) });
  }

  async stream(system: string, turns: ChatTurn[], onDelta: (text: string) => void, signal: AbortSignal) {
    const stream = await this.client.models.generateContentStream({
      model: this.opts.model,
      contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      config: { systemInstruction: system, abortSignal: signal },
    });
    let text = "";
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
    return text;
  }

  async listModels() {
    const ids: string[] = [];
    const pager = await this.client.models.list();
    for await (const m of pager) {
      if (m.name && (!m.supportedActions || m.supportedActions.includes("generateContent"))) {
        ids.push(m.name.replace(/^models\//, ""));
      }
    }
    return ids;
  }
}

export function createProvider(opts: ProviderOptions): Provider {
  switch (opts.kind) {
    case "anthropic":
      return new AnthropicProvider(opts);
    case "gemini":
      return new GeminiProvider(opts);
    case "mock":
      return new MockProvider();
    default:
      return new OpenAICompatibleProvider(opts);
  }
}

/** Turn SDK errors into a short message for the UI. */
export function describeError(err: unknown): string {
  if (err instanceof RefusalError) return "REFUSAL";
  const e = err as { status?: number; message?: string; error?: { message?: string } };
  const status = e?.status;
  if (status === 401 || status === 403) return "AUTH";
  if (status === 429) return "RATE_LIMIT";
  if (status === 404) return `NOT_FOUND: ${e.error?.message ?? e.message ?? ""}`.trim();
  const msg = e?.error?.message ?? e?.message ?? String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|Connection error/i.test(msg)) return "NETWORK";
  if (/API key not valid|invalid api key|incorrect api key/i.test(msg)) return "AUTH";
  return msg;
}
