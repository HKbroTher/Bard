import { describe, expect, it } from "vitest";
import { checkGlossary, containsTerm, matchGlossary, parseCsv, toCsv } from "./glossary";
import type { GlossaryEntry } from "../shared/types";

const entry = (id: number, zh: string, en: string, ja: string, caseSensitive = false): GlossaryEntry => ({
  id, zh, en, ja, note: "", caseSensitive, createdAt: "", updatedAt: "",
});

describe("containsTerm", () => {
  it("matches Latin terms on word boundaries only", () => {
    expect(containsTerm("Our API is fast", "API")).toBe(true);
    expect(containsTerm("rapid growth", "API")).toBe(false);
    expect(containsTerm("使用API接口", "API")).toBe(true);
  });
  it("respects case sensitivity", () => {
    expect(containsTerm("the icore chip", "iCore", true)).toBe(false);
    expect(containsTerm("the icore chip", "iCore", false)).toBe(true);
  });
  it("matches CJK terms as substrings", () => {
    expect(containsTerm("我们的智能网关很好", "智能网关")).toBe(true);
    expect(containsTerm("スマートゲートウェイを導入", "スマートゲートウェイ")).toBe(true);
  });
});

describe("matchGlossary / checkGlossary", () => {
  const entries = [
    entry(1, "智能网关", "Smart Gateway", "スマートゲートウェイ"),
    entry(2, "交货期", "lead time", "納期"),
    entry(3, "芯片", "chip", ""),
  ];

  it("finds entries mentioned in any language", () => {
    const m = matchGlossary("Please quote the Smart Gateway and 交货期", entries);
    expect(m.map((x) => x.entry.id)).toEqual([1, 2]);
  });

  it("reports which target terms the output used", () => {
    const m = matchGlossary("智能网关 交货期 芯片", entries);
    const checks = checkGlossary("スマートゲートウェイの価格についてご連絡します。", m, "ja");
    expect(checks).toEqual([
      { entryId: 1, found: "智能网关", expected: "スマートゲートウェイ", ok: true },
      { entryId: 2, found: "交货期", expected: "納期", ok: false },
    ]);
  });
});

describe("CSV", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [["zh", "en"], ['含"引号"', "a, b"], ["多\n行", "x"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
