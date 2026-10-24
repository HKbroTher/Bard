import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_OPTIONS,
  type Conversation,
  type EmailOptions,
  type GlossaryEntry,
  type GlossaryInput,
  type Lang,
  type Message,
  type MessageAction,
  type GlossaryCheck,
  type ProviderConfig,
  type ProviderKind,
  type Settings,
} from "../shared/types";

/** Encrypts API keys at rest. In the app this is Electron's safeStorage (OS keychain). */
export interface Secrets {
  encrypt(plain: string): Uint8Array;
  decrypt(data: Uint8Array): string;
}

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

interface ProviderRow {
  id: number;
  kind: ProviderKind;
  name: string;
  base_url: string;
  model: string;
  api_key: Uint8Array | null;
  created_at: string;
}

interface ConversationRow {
  id: number;
  title: string;
  options: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  action: string | null;
  lang: Lang | null;
  glossary: string;
  model: string;
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

const toProvider = (r: ProviderRow): ProviderConfig => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  baseUrl: r.base_url,
  model: r.model,
  hasKey: Boolean(r.api_key && r.api_key.length),
  createdAt: r.created_at,
});

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title,
  options: { ...DEFAULT_OPTIONS, ...JSON.parse(r.options) },
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role,
  content: r.content,
  action: r.action ? (JSON.parse(r.action) as MessageAction) : null,
  lang: r.lang,
  glossary: JSON.parse(r.glossary) as GlossaryCheck[],
  model: r.model,
  createdAt: r.created_at,
});

export const DEFAULT_SETTINGS: Settings = {
  uiLang: "zh",
  theme: "system",
  activeProviderId: null,
  senderName: "",
  senderCompany: "",
  defaults: DEFAULT_OPTIONS,
};

export class Store {
  private db: DatabaseSync;

  constructor(
    path: string,
    private secrets: Secrets,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        api_key BLOB,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        options TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        action TEXT,
        lang TEXT,
        glossary TEXT NOT NULL DEFAULT '[]',
        model TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS messages_conversation ON messages (conversation_id, id);
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
    `);
  }

  // -------------------------------------------------------------- settings

  getSettings(): Settings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as unknown as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored, defaults: { ...DEFAULT_OPTIONS, ...stored.defaults } };
  }

  setSettings(patch: Partial<Settings>): Settings {
    const stmt = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    );
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) stmt.run(key, JSON.stringify(value));
    }
    return this.getSettings();
  }

  // -------------------------------------------------------------- providers

  listProviders(): ProviderConfig[] {
    const rows = this.db.prepare("SELECT * FROM providers ORDER BY id").all() as unknown as ProviderRow[];
    return rows.map(toProvider);
  }

  getProvider(id: number): ProviderConfig | undefined {
    const row = this.db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as unknown as ProviderRow | undefined;
    return row && toProvider(row);
  }

  getProviderKey(id: number): string {
    const row = this.db.prepare("SELECT api_key FROM providers WHERE id = ?").get(id) as unknown as
      | { api_key: Uint8Array | null }
      | undefined;
    return row?.api_key?.length ? this.secrets.decrypt(row.api_key) : "";
  }

  saveProvider(
    input: { kind: ProviderKind; name: string; baseUrl: string; model: string; apiKey?: string },
    id?: number,
  ): ProviderConfig {
    const key = input.apiKey === undefined ? undefined : input.apiKey.trim() ? this.secrets.encrypt(input.apiKey.trim()) : null;
    if (id) {
      this.db
        .prepare("UPDATE providers SET kind = ?, name = ?, base_url = ?, model = ? WHERE id = ?")
        .run(input.kind, input.name, input.baseUrl, input.model, id);
      if (key !== undefined) this.db.prepare("UPDATE providers SET api_key = ? WHERE id = ?").run(key, id);
      return this.getProvider(id)!;
    }
    const result = this.db
      .prepare("INSERT INTO providers (kind, name, base_url, model, api_key) VALUES (?, ?, ?, ?, ?)")
      .run(input.kind, input.name, input.baseUrl, input.model, key ?? null);
    return this.getProvider(Number(result.lastInsertRowid))!;
  }

  deleteProvider(id: number): void {
    this.db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------- conversations

  listConversations(): Conversation[] {
    const rows = this.db
      .prepare("SELECT * FROM conversations ORDER BY updated_at DESC, id DESC")
      .all() as unknown as ConversationRow[];
    return rows.map(toConversation);
  }

  getConversation(id: number): Conversation | undefined {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as unknown as ConversationRow | undefined;
    return row && toConversation(row);
  }

  createConversation(options: EmailOptions, title = ""): Conversation {
    const result = this.db
      .prepare("INSERT INTO conversations (title, options) VALUES (?, ?)")
      .run(title, JSON.stringify(options));
    return this.getConversation(Number(result.lastInsertRowid))!;
  }

  updateConversation(id: number, patch: { title?: string; options?: EmailOptions }): Conversation | undefined {
    if (patch.title !== undefined) this.db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(patch.title, id);
    if (patch.options) {
      this.db.prepare("UPDATE conversations SET options = ? WHERE id = ?").run(JSON.stringify(patch.options), id);
    }
    return this.getConversation(id);
  }

  touchConversation(id: number): void {
    this.db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(id);
  }

  deleteConversation(id: number): void {
    this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }

  listMessages(conversationId: number): Message[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id")
      .all(conversationId) as unknown as MessageRow[];
    return rows.map(toMessage);
  }

  getMessage(id: number): Message | undefined {
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as MessageRow | undefined;
    return row && toMessage(row);
  }

  addMessage(m: Omit<Message, "id" | "createdAt">): Message {
    const result = this.db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content, action, lang, glossary, model) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        m.conversationId,
        m.role,
        m.content,
        m.action ? JSON.stringify(m.action) : null,
        m.lang,
        JSON.stringify(m.glossary),
        m.model,
      );
    this.touchConversation(m.conversationId);
    return this.getMessage(Number(result.lastInsertRowid))!;
  }

  updateMessageContent(id: number, content: string): Message | undefined {
    this.db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(content, id);
    return this.getMessage(id);
  }

  deleteMessage(id: number): void {
    this.db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------- glossary

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

  close(): void {
    this.db.close();
  }
}
