import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, parseEmail, detectLang, type GlossaryEntry } from "../shared/types";
import { buildSystemPrompt, userTurnText } from "./prompts";

const gateway: GlossaryEntry = {
  id: 1, zh: "智能网关", en: "Smart Gateway", ja: "スマートゲートウェイ", note: "产品名", caseSensitive: true, createdAt: "", updatedAt: "",
};
const profile = { senderName: "张伟", senderCompany: "ACME" };

describe("buildSystemPrompt", () => {
  it("includes scenario, target language, formality rules, signature and glossary", () => {
    const system = buildSystemPrompt({ ...DEFAULT_OPTIONS, scenario: "inquiry", lang: "ja", formality: 3 }, profile, [gateway]);
    expect(system).toContain("request for quotation");
    expect(system).toContain("Write the email in Japanese");
    expect(system).toContain("最も改まった文体");
    expect(system).toContain("Sign off as: 张伟, ACME.");
    expect(system).toContain("- zh: 智能网关 | en: Smart Gateway | ja: スマートゲートウェイ (产品名)");
    expect(system).toContain("<revisions>");
  });

  it("uses translation instructions for the translate scenario", () => {
    const base = { ...DEFAULT_OPTIONS, scenario: "translate" as const, lang: "zh" as const };
    expect(buildSystemPrompt({ ...base, localize: true }, profile, [])).toContain("Localise");
    expect(buildSystemPrompt({ ...base, localize: false }, profile, [])).toContain("Translate faithfully");
    expect(buildSystemPrompt(base, profile, [])).not.toContain("<glossary>");
  });
});

describe("userTurnText", () => {
  it("wraps the first message and expands quick actions", () => {
    expect(userTurnText("要点", null, true, "inquiry")).toBe("<key_points>\n要点\n</key_points>");
    expect(userTurnText("Hi", null, true, "translate")).toContain("<source_email>");
    expect(userTurnText("", { type: "translate", lang: "en" }, false, "inquiry")).toContain("into English");
    expect(userTurnText("", { type: "revise", preset: "shorter" }, false, "inquiry")).toContain("half");
    expect(userTurnText("再正式一点", null, false, "inquiry")).toBe("再正式一点");
  });
});

describe("parseEmail", () => {
  it("splits subject and body", () => {
    expect(parseEmail("SUBJECT: 报价请求\n---\n尊敬的王经理：\n\n您好！\n")).toEqual({ subject: "报价请求", body: "尊敬的王经理：\n\n您好！" });
  });
  it("handles partial streaming output", () => {
    expect(parseEmail("SUBJECT: Quot")).toEqual({ subject: "Quot", body: "" });
    expect(parseEmail("SUBJECT: Quote\n---\nDe")).toEqual({ subject: "Quote", body: "De" });
  });
  it("falls back to body-only text", () => {
    expect(parseEmail("Dear John,\nThanks")).toEqual({ subject: "", body: "Dear John,\nThanks" });
  });
});

describe("detectLang", () => {
  it("tells Chinese, Japanese and English apart", () => {
    expect(detectLang("尊敬的王经理：关于 Smart Gateway 的报价")).toBe("zh");
    expect(detectLang("いつもお世話になっております。見積書を送付します。")).toBe("ja");
    expect(detectLang("Dear Mr. Tanaka, thank you for the 智能网关 inquiry.")).toBe("en");
  });
});
