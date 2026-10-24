import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { Store } from "./db.js";
import { MockClient } from "./llm.js";
import type { StreamEvent } from "./shared.js";

let server: Server;
let base: string;
const store = new Store(":memory:");

beforeAll(async () => {
  server = createApp(store, new MockClient()).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  store.close();
});

async function readEvents(res: Response): Promise<StreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((c) => c.startsWith("data: "))
    .map((c) => JSON.parse(c.slice(6)));
}

describe("API", () => {
  it("validates glossary entries", async () => {
    const res = await fetch(`${base}/api/glossary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zh: "只有中文" }),
    });
    expect(res.status).toBe(400);
  });

  it("imports CSV and applies the glossary to drafts", async () => {
    const csv = "zh,en,ja,note,case_sensitive\n智能网关,Smart Gateway,スマートゲートウェイ,产品名,1\n交货期,lead time,納期,,0\n";
    const imp = await fetch(`${base}/api/glossary/import`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv });
    expect(await imp.json()).toEqual({ imported: 2, errors: [] });

    const res = await fetch(`${base}/api/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "inquiry", lang: "ja", tone: "polite", formality: 2, keyPoints: "询问智能网关的价格" }),
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readEvents(res);
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({ type: "done", glossary: [{ expected: "スマートゲートウェイ", ok: true }] });
    expect(events.some((e) => e.type === "delta")).toBe(true);

    const history = await (await fetch(`${base}/api/history`)).json();
    expect(history[0]).toMatchObject({ kind: "draft", lang: "ja", scenario: "inquiry" });
  });

  it("rejects an empty translation", async () => {
    const res = await fetch(`${base}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: " ", sourceLang: "auto", targetLang: "en", formality: 2 }),
    });
    expect(res.status).toBe(400);
  });
});
