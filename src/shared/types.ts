// Types and pure helpers shared by the main process, preload and renderer.

export type Lang = "zh" | "en" | "ja";
export type UiLang = "zh" | "en";
export type Theme = "system" | "light" | "dark";

export type ScenarioId =
  | "cold_outreach"
  | "follow_up"
  | "inquiry"
  | "quotation_reply"
  | "meeting_request"
  | "thank_you"
  | "apology"
  | "translate"
  | "custom";

export type ToneId = "polite" | "friendly" | "confident" | "concise" | "apologetic" | "urgent";

/** 1 = casual, 2 = standard business, 3 = highly formal */
export type Formality = 1 | 2 | 3;

export const SCENARIO_IDS: ScenarioId[] = [
  "cold_outreach",
  "follow_up",
  "inquiry",
  "quotation_reply",
  "meeting_request",
  "thank_you",
  "apology",
  "translate",
  "custom",
];
export const TONE_IDS: ToneId[] = ["polite", "friendly", "confident", "concise", "apologetic", "urgent"];
export const LANGS: Lang[] = ["zh", "en", "ja"];

export interface EmailOptions {
  scenario: ScenarioId;
  /** Language the email is written in (for translate: the target language). */
  lang: Lang;
  tone: ToneId;
  formality: Formality;
  /** Translate scenario: rewrite natively (true) or stay close to the source (false). */
  localize: boolean;
  useGlossary: boolean;
}

export const DEFAULT_OPTIONS: EmailOptions = {
  scenario: "cold_outreach",
  lang: "en",
  tone: "polite",
  formality: 2,
  localize: true,
  useGlossary: true,
};

// ---------------------------------------------------------------- providers

export type ProviderKind = "anthropic" | "openai" | "gemini" | "deepseek" | "qwen" | "kimi" | "zhipu" | "custom" | "mock";

export interface ProviderPreset {
  kind: ProviderKind;
  name: string;
  /** Default API base URL for OpenAI-compatible providers. */
  baseUrl: string;
  /** Suggested models, shown before the live list has been fetched. */
  models: string[];
  defaultModel: string;
  /** Where to create an API key. */
  keyUrl: string;
  keyRequired: boolean;
  /** Monogram colour for the provider avatar. */
  color: string;
}

export interface ProviderConfig {
  id: number;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  createdAt: string;
}

export interface ProviderInput {
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  /** New key; omit to keep the stored one when editing. */
  apiKey?: string;
}

export interface TestResult {
  ok: boolean;
  models: string[];
  error?: string;
}

// ---------------------------------------------------------------- settings

export interface Settings {
  uiLang: UiLang;
  theme: Theme;
  activeProviderId: number | null;
  senderName: string;
  senderCompany: string;
  /** Options used for new conversations. */
  defaults: EmailOptions;
}

// ---------------------------------------------------------------- conversations

export interface Conversation {
  id: number;
  title: string;
  options: EmailOptions;
  createdAt: string;
  updatedAt: string;
}

export type MessageAction = { type: "translate"; lang: Lang } | { type: "revise"; preset: RevisePreset };

export type RevisePreset = "formal" | "casual" | "shorter" | "warmer" | "cta";

export interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  /** User text, or the raw assistant email ("SUBJECT: …\n---\n…"). */
  content: string;
  action: MessageAction | null;
  /** Assistant only: language detected in the email. */
  lang: Lang | null;
  glossary: GlossaryCheck[];
  /** Assistant only: "Provider · model" that wrote it. */
  model: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

/** Events pushed from main to renderer while a reply streams. */
export type ChatEvent =
  | { type: "start"; conversationId: number; userMessage: Message | null }
  | { type: "delta"; conversationId: number; text: string }
  | { type: "done"; conversationId: number; message: Message; conversation: Conversation }
  | { type: "error"; conversationId: number; message: string };

// ---------------------------------------------------------------- glossary

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

export type GlossaryInput = Pick<GlossaryEntry, "zh" | "en" | "ja"> & Partial<Pick<GlossaryEntry, "note" | "caseSensitive">>;

export interface GlossaryCheck {
  entryId: number;
  /** The term the source text contained. */
  found: string;
  /** The term the output was required to use. */
  expected: string;
  ok: boolean;
}

// ---------------------------------------------------------------- helpers

/** Split model output into subject and body. Tolerates partial (streaming) output. */
export function parseEmail(raw: string): { subject: string; body: string } {
  const text = raw.replace(/^﻿/, "").trimStart();
  const match = text.match(/^SUBJECT:[ \t]*(.*)\r?\n(?:-{3,}[ \t]*\r?\n)?([\s\S]*)$/i);
  if (!match) {
    // Subject line still streaming, or the model skipped the format.
    if (/^SUBJECT:/i.test(text)) return { subject: text.replace(/^SUBJECT:[ \t]*/i, ""), body: "" };
    return { subject: "", body: text.trim() };
  }
  return { subject: match[1].trim(), body: match[2].replace(/^\s*\n/, "").trimEnd() };
}

export function formatEmail(subject: string, body: string): string {
  return `SUBJECT: ${subject.trim()}\n---\n${body.trim()}`;
}

/** Best-effort language of a text: kana → Japanese, other CJK → Chinese, else English. */
export function detectLang(text: string): Lang {
  if (/[぀-ヿ]/.test(text)) return "ja";
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return cjk > latin / 4 ? "zh" : "en";
}
