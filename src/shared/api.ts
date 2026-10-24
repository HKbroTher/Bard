import type {
  ChatEvent,
  Conversation,
  ConversationDetail,
  EmailOptions,
  GlossaryEntry,
  GlossaryInput,
  Message,
  MessageAction,
  ProviderConfig,
  ProviderInput,
  ProviderPreset,
  Settings,
  TestResult,
  Theme,
} from "./types";

/** The API the preload script exposes to the renderer as `window.bard`. */
export interface BardApi {
  platform: NodeJS.Platform;
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  providers: {
    presets(): Promise<ProviderPreset[]>;
    list(): Promise<ProviderConfig[]>;
    save(input: ProviderInput, id?: number): Promise<ProviderConfig>;
    remove(id: number): Promise<void>;
    /** Test unsaved input; with an id, a missing key falls back to the stored one. */
    test(input: ProviderInput, id?: number): Promise<TestResult>;
  };
  conversations: {
    list(): Promise<Conversation[]>;
    get(id: number): Promise<ConversationDetail | null>;
    create(options: EmailOptions): Promise<Conversation>;
    update(id: number, patch: { title?: string; options?: EmailOptions }): Promise<Conversation | null>;
    remove(id: number): Promise<void>;
  };
  chat: {
    send(conversationId: number, text: string, action?: MessageAction | null): Promise<void>;
    regenerate(conversationId: number): Promise<void>;
    stop(conversationId: number): Promise<void>;
    editMessage(id: number, content: string): Promise<Message | null>;
    onEvent(listener: (event: ChatEvent) => void): () => void;
  };
  glossary: {
    list(q?: string): Promise<GlossaryEntry[]>;
    create(input: GlossaryInput): Promise<GlossaryEntry>;
    update(id: number, input: GlossaryInput): Promise<GlossaryEntry | null>;
    remove(id: number): Promise<void>;
    /** Opens a file picker; null when cancelled. */
    importCsv(): Promise<{ imported: number; errors: string[] } | null>;
    /** Opens a save dialog; false when cancelled. */
    exportCsv(): Promise<boolean>;
  };
  app: {
    openMail(subject: string, body: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    setTheme(theme: Theme, colors: { background: string; symbol: string }): Promise<void>;
    version(): Promise<string>;
  };
}
