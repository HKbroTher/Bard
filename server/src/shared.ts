// Types and pure helpers shared between the server and the web client.

export type Lang = "zh" | "en" | "ja";

export type ScenarioId =
  | "cold_outreach"
  | "follow_up"
  | "inquiry"
  | "quotation_reply"
  | "meeting_request"
  | "thank_you"
  | "apology"
  | "custom";

export type ToneId = "polite" | "friendly" | "confident" | "concise" | "apologetic" | "urgent";

/** 1 = casual, 2 = standard business, 3 = highly formal */
export type Formality = 1 | 2 | 3;

export interface DraftRequest {
  scenario: ScenarioId;
  lang: Lang;
  tone: ToneId;
  formality: Formality;
  senderName?: string;
  senderCompany?: string;
  recipientName?: string;
  recipientCompany?: string;
  /** Key points the email must cover, in any language. */
  keyPoints: string;
  /** Previous email in the thread, for follow-ups and replies. */
  previousEmail?: string;
  useGlossary?: boolean;
}

export interface TranslateRequest {
  text: string;
  sourceLang: Lang | "auto";
  targetLang: Lang;
  tone?: ToneId;
  formality: Formality;
  /** Rewrite to read natively (true) or stay close to the source (false). */
  localize?: boolean;
  useGlossary?: boolean;
}

export interface GlossaryEntry {
  id: number;
  zh: string;
  en: string;
  ja: string;
  note: string;
  /** Case-sensitive match for English, e.g. product names like "iCore". */
  caseSensitive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GlossaryInput = Pick<GlossaryEntry, "zh" | "en" | "ja"> &
  Partial<Pick<GlossaryEntry, "note" | "caseSensitive">>;

export interface GlossaryCheck {
  entryId: number;
  /** The term the source text contained. */
  found: string;
  /** The term the output was required to use. */
  expected: string;
  ok: boolean;
}

export interface HistoryItem {
  id: number;
  kind: "draft" | "translate";
  lang: Lang;
  scenario: ScenarioId | null;
  tone: ToneId | null;
  formality: Formality;
  input: string;
  subject: string;
  body: string;
  createdAt: string;
}

export interface Option<T extends string | number> {
  id: T;
  label: string;
  description?: string;
}

export interface Meta {
  languages: Option<Lang>[];
  scenarios: Option<ScenarioId>[];
  tones: Option<ToneId>[];
  formality: Option<Formality>[];
  mock: boolean;
  model: string;
}

/** Server-sent events emitted by /api/draft and /api/translate. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; subject: string; body: string; glossary: GlossaryCheck[]; historyId: number }
  | { type: "error"; message: string };

/** Split model output into subject and body. Tolerates partial (streaming) output. */
export function parseEmail(raw: string): { subject: string; body: string } {
  const text = raw.replace(/^\uFEFF/, "").trimStart();
  const match = text.match(/^SUBJECT:[ \t]*(.*)\r?\n(?:-{3,}[ \t]*\r?\n)?([\s\S]*)$/i);
  if (!match) {
    // Subject line still streaming, or the model skipped the format.
    if (/^SUBJECT:/i.test(text)) return { subject: text.replace(/^SUBJECT:[ \t]*/i, ""), body: "" };
    return { subject: "", body: text.trim() };
  }
  return { subject: match[1].trim(), body: match[2].replace(/^\s*\n/, "").trimEnd() };
}
