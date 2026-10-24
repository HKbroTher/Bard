import type { GlossaryCheck, GlossaryEntry, Lang } from "./shared.js";

const LANGS: Lang[] = ["zh", "en", "ja"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `term` occurs in `text`. Latin-script terms must sit on word
 * boundaries ("API" should not match "rapid"); CJK terms match as substrings.
 */
export function containsTerm(text: string, term: string, caseSensitive = false): boolean {
  const t = term.trim();
  if (!t) return false;
  const latin = /^[\p{Script=Latin}\d]/u.test(t) || /[\p{Script=Latin}\d]$/u.test(t);
  if (!latin) return text.includes(t);
  const pattern = `(?<![\\p{Script=Latin}\\d])${escapeRegExp(t)}(?![\\p{Script=Latin}\\d])`;
  return new RegExp(pattern, caseSensitive ? "u" : "iu").test(text);
}

export interface GlossaryMatch {
  entry: GlossaryEntry;
  found: string;
}

/** Glossary entries whose term in any language appears in the input text. */
export function matchGlossary(text: string, entries: GlossaryEntry[]): GlossaryMatch[] {
  const matches: GlossaryMatch[] = [];
  for (const entry of entries) {
    for (const lang of LANGS) {
      const term = entry[lang];
      const caseSensitive = lang === "en" && entry.caseSensitive;
      if (term && containsTerm(text, term, caseSensitive)) {
        matches.push({ entry, found: term });
        break;
      }
    }
  }
  return matches;
}

/** Verify the output uses the required target-language term for each match. */
export function checkGlossary(output: string, matches: GlossaryMatch[], target: Lang): GlossaryCheck[] {
  return matches
    .filter((m) => m.entry[target].trim())
    .map(({ entry, found }) => ({
      entryId: entry.id,
      found,
      expected: entry[target],
      ok: containsTerm(output, entry[target], target === "en" && entry.caseSensitive),
    }));
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = input.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export function toCsv(rows: (string | number | boolean)[][]): string {
  const cell = (v: string | number | boolean) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
