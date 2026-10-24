import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Formality, GlossaryEntry, GlossaryInput, HistoryItem, Lang, ScenarioId, ToneId } from "./shared.js";

interface GlossaryRow {
  id: number;
  zh: string;
  en: string;
  ja: string;
  note: string;
  case_sensitive: number;
  created_at: string;
  updated_at: string;
}

interface HistoryRow {
  id: number;
  kind: "draft" | "translate";
  lang: Lang;
  scenario: ScenarioId | null;
  tone: ToneId | null;
  formality: Formality;
  input: string;
  subject: string;
  body: string;
  created_at: string;
}

const toEntry = (r: GlossaryRow): GlossaryEntry => ({
  id: r.id,
  zh: r.zh,
  en: r.en,
  ja: r.ja,
  note: r.note,
  caseSensitive: r.case_sensitive === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toHistory = (r: HistoryRow): HistoryItem => ({
  id: r.id,
  kind: r.kind,
  lang: r.lang,
  scenario: r.scenario,
  tone: r.tone,
  formality: r.formality,
  input: r.input,
  subject: r.subject,
  body: r.body,
  createdAt: r.created_at,
});

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS glossary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zh TEXT NOT NULL DEFAULT '',
        en TEXT NOT NULL DEFAULT '',
        ja TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        case_sensitive INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('draft', 'translate')),
        lang TEXT NOT NULL,
        scenario TEXT,
        tone TEXT,
        formality INTEGER NOT NULL,
        input TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS history_created ON history (created_at DESC);
    `);
  }

  listGlossary(q?: string): GlossaryEntry[] {
    if (q?.trim()) {
      const like = `%${q.trim()}%`;
      const rows = this.db
        .prepare("SELECT * FROM glossary WHERE zh LIKE ? OR en LIKE ? OR ja LIKE ? OR note LIKE ? ORDER BY id DESC")
        .all(like, like, like, like) as unknown as GlossaryRow[];
      return rows.map(toEntry);
    }
    const rows = this.db.prepare("SELECT * FROM glossary ORDER BY id DESC").all() as unknown as GlossaryRow[];
    return rows.map(toEntry);
  }

  getGlossary(id: number): GlossaryEntry | undefined {
    const row = this.db.prepare("SELECT * FROM glossary WHERE id = ?").get(id) as unknown as GlossaryRow | undefined;
    return row && toEntry(row);
  }

  createGlossary(input: GlossaryInput): GlossaryEntry {
    const result = this.db
      .prepare("INSERT INTO glossary (zh, en, ja, note, case_sensitive) VALUES (?, ?, ?, ?, ?)")
      .run(input.zh.trim(), input.en.trim(), input.ja.trim(), (input.note ?? "").trim(), input.caseSensitive ? 1 : 0);
    return this.getGlossary(Number(result.lastInsertRowid))!;
  }

  updateGlossary(id: number, input: GlossaryInput): GlossaryEntry | undefined {
    const result = this.db
      .prepare(
        "UPDATE glossary SET zh = ?, en = ?, ja = ?, note = ?, case_sensitive = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(input.zh.trim(), input.en.trim(), input.ja.trim(), (input.note ?? "").trim(), input.caseSensitive ? 1 : 0, id);
    return result.changes ? this.getGlossary(id) : undefined;
  }

  deleteGlossary(id: number): boolean {
    return this.db.prepare("DELETE FROM glossary WHERE id = ?").run(id).changes > 0;
  }

  /** Insert many entries in one transaction; returns how many were inserted. */
  importGlossary(inputs: GlossaryInput[]): number {
    this.db.exec("BEGIN");
    try {
      for (const input of inputs) this.createGlossary(input);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return inputs.length;
  }

  addHistory(item: Omit<HistoryItem, "id" | "createdAt">): number {
    const result = this.db
      .prepare(
        "INSERT INTO history (kind, lang, scenario, tone, formality, input, subject, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(item.kind, item.lang, item.scenario, item.tone, item.formality, item.input, item.subject, item.body);
    return Number(result.lastInsertRowid);
  }

  listHistory(limit = 50): HistoryItem[] {
    const rows = this.db
      .prepare("SELECT * FROM history ORDER BY id DESC LIMIT ?")
      .all(limit) as unknown as HistoryRow[];
    return rows.map(toHistory);
  }

  deleteHistory(id: number): boolean {
    return this.db.prepare("DELETE FROM history WHERE id = ?").run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
