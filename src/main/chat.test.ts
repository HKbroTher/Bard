import { describe, expect, it } from "vitest";
import type { ChatEvent } from "../shared/types";
import { DEFAULT_OPTIONS } from "../shared/types";
import { ChatService } from "./chat";
import { Store } from "./db";
import type { ChatTurn, Provider } from "./providers";

const secrets = {
  encrypt: (s: string) => new TextEncoder().encode(`enc:${s}`),
  decrypt: (d: Uint8Array) => new TextDecoder().decode(d).replace(/^enc:/, ""),
};

class FakeProvider implements Provider {
  calls: { system: string; turns: ChatTurn[] }[] = [];
  constructor(private replies: string[]) {}
  async stream(system: string, turns: ChatTurn[], onDelta: (t: string) => void) {
    this.calls.push({ system, turns });
    const reply = this.replies.shift() ?? "";
    for (const part of reply.match(/[\s\S]{1,5}/g) ?? []) onDelta(part);
    return reply;
  }
  async listModels() {
    return [];
  }
}

function setup(replies: string[]) {
  const store = new Store(":memory:", secrets);
  const events: ChatEvent[] = [];
  const provider = new FakeProvider(replies);
  const chat = new ChatService(store, (e) => events.push(e), () => ({ provider, label: "Fake · m1" }));
  return { store, events, provider, chat };
}

describe("ChatService", () => {
  it("drafts, applies the glossary, titles the conversation and revises with full history", async () => {
    const { store, events, provider, chat } = setup([
      "SUBJECT: スマートゲートウェイのお見積り\n---\n田中様\n\nスマートゲートウェイについて…",
      "SUBJECT: Quote for Smart Gateway\n---\nDear Mr. Tanaka,\n\nRegarding the gateway…",
    ]);
    store.createGlossary({ zh: "智能网关", en: "Smart Gateway", ja: "スマートゲートウェイ" });
    const conv = store.createConversation({ ...DEFAULT_OPTIONS, scenario: "inquiry", lang: "ja" });

    await chat.send(conv.id, "询问智能网关的价格");
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({
      message: { role: "assistant", lang: "ja", model: "Fake · m1", glossary: [{ expected: "スマートゲートウェイ", ok: true }] },
      conversation: { title: "スマートゲートウェイのお見積り" },
    });
    expect(provider.calls[0].system).toContain("Write the email in Japanese");
    expect(provider.calls[0].turns).toEqual([{ role: "user", content: "<key_points>\n询问智能网关的价格\n</key_points>" }]);

    await chat.send(conv.id, "", { type: "translate", lang: "en" });
    const second = provider.calls[1];
    expect(second.turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(second.turns[2].content).toContain("into English");
    expect(second.system).toContain("Write the email in English");
    expect(store.getConversation(conv.id)!.options.lang).toBe("en");

    const last = store.listMessages(conv.id).at(-1)!;
    expect(last).toMatchObject({ lang: "en", glossary: [{ expected: "Smart Gateway", ok: true }] });
  });

  it("regenerates the latest reply and reports a missing provider", async () => {
    const { store, chat, provider } = setup(["SUBJECT: A\n---\nfirst", "SUBJECT: B\n---\nsecond"]);
    const conv = store.createConversation(DEFAULT_OPTIONS);
    await chat.send(conv.id, "hello");
    await chat.regenerate(conv.id);
    const messages = store.listMessages(conv.id);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].content).toContain("second");
    expect(provider.calls[1].turns).toHaveLength(1);

    const events: ChatEvent[] = [];
    const none = new ChatService(store, (e) => events.push(e), () => null);
    await none.send(conv.id, "again");
    expect(events.at(-1)).toEqual({ type: "error", conversationId: conv.id, message: "NO_PROVIDER" });
  });

  it("keeps partial output when stopped", async () => {
    const store = new Store(":memory:", secrets);
    const events: ChatEvent[] = [];
    let chat!: ChatService;
    const conv = store.createConversation(DEFAULT_OPTIONS);
    const slow: Provider = {
      async stream(_s, _t, onDelta, signal) {
        onDelta("SUBJECT: Hi\n---\nDear");
        chat.stop(conv.id);
        if (signal.aborted) throw new Error("Request was aborted.");
        return "";
      },
      async listModels() {
        return [];
      },
    };
    chat = new ChatService(store, (e) => events.push(e), () => ({ provider: slow, label: "x" }));
    await chat.send(conv.id, "notes");
    expect(store.listMessages(conv.id).at(-1)?.content).toBe("SUBJECT: Hi\n---\nDear");
    expect(chat.isRunning(conv.id)).toBe(false);
  });
});

describe("Store", () => {
  it("encrypts provider keys and merges settings", () => {
    const store = new Store(":memory:", secrets);
    const p = store.saveProvider({ kind: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "sk-1" });
    expect(p.hasKey).toBe(true);
    expect(store.getProviderKey(p.id)).toBe("sk-1");
    store.saveProvider({ kind: "deepseek", name: "DS", baseUrl: "", model: "deepseek-reasoner" }, p.id);
    expect(store.getProviderKey(p.id)).toBe("sk-1");
    expect(store.getProvider(p.id)!.model).toBe("deepseek-reasoner");

    expect(store.setSettings({ senderName: "Wei" })).toMatchObject({ senderName: "Wei", uiLang: "zh", defaults: DEFAULT_OPTIONS });
  });
});
