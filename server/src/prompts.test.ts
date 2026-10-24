import { describe, expect, it } from "vitest";
import { buildDraftPrompt, buildTranslatePrompt, parseEmail } from "./prompts.js";
import type { GlossaryEntry } from "./shared.js";

const gateway: GlossaryEntry = {
  id: 1, zh: "智能网关", en: "Smart Gateway", ja: "スマートゲートウェイ", note: "产品名", caseSensitive: true, createdAt: "", updatedAt: "",
};

describe("buildDraftPrompt", () => {
  it("includes scenario, formality for the target language and glossary", () => {
    const { system, user } = buildDraftPrompt(
      { scenario: "inquiry", lang: "ja", tone: "polite", formality: 3, keyPoints: "询问智能网关价格", senderCompany: "ACME" },
      [gateway],
    );
    expect(system).toContain("request for quotation");
    expect(system).toContain("Japanese");
    expect(system).toContain("最も改まった文体");
    expect(system).toContain('→ use "スマートゲートウェイ" (产品名)');
    expect(user).toContain("Sender company: ACME");
    expect(user).toContain("询问智能网关价格");
  });

  it("omits the glossary block when nothing matched", () => {
    const { system } = buildDraftPrompt({ scenario: "custom", lang: "en", tone: "concise", formality: 2, keyPoints: "hi" }, []);
    expect(system).not.toContain("<glossary>");
  });
});

describe("buildTranslatePrompt", () => {
  it("switches between faithful and localised translation", () => {
    const base = { text: "Hello", sourceLang: "en" as const, targetLang: "zh" as const, formality: 2 as const };
    expect(buildTranslatePrompt({ ...base, localize: true }, []).system).toContain("Localise");
    expect(buildTranslatePrompt({ ...base, localize: false }, []).system).toContain("Translate faithfully");
  });
});

describe("parseEmail", () => {
  it("splits subject and body", () => {
    expect(parseEmail("SUBJECT: 报价请求\n---\n尊敬的王经理：\n\n您好！\n")).toEqual({
      subject: "报价请求",
      body: "尊敬的王经理：\n\n您好！",
    });
  });
  it("handles partial streaming output", () => {
    expect(parseEmail("SUBJECT: Quot")).toEqual({ subject: "Quot", body: "" });
    expect(parseEmail("SUBJECT: Quote\n---\nDe")).toEqual({ subject: "Quote", body: "De" });
  });
  it("falls back to body-only text", () => {
    expect(parseEmail("Dear John,\nThanks")).toEqual({ subject: "", body: "Dear John,\nThanks" });
  });
});
