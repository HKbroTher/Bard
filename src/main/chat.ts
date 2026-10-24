import { detectLang, parseEmail, type ChatEvent, type Lang, type MessageAction } from "../shared/types";
import type { Store } from "./db";
import { checkGlossary, matchGlossary } from "./glossary";
import { buildSystemPrompt, settingsChangedNote, userTurnText } from "./prompts";
import { describeError, type ChatTurn, type Provider } from "./providers";

export interface ActiveProvider {
  provider: Provider;
  /** "Claude · claude-opus-5-5", stored on each reply. */
  label: string;
}

/** Runs conversations: stores turns, builds prompts and streams replies as ChatEvents. */
export class ChatService {
  private running = new Map<number, AbortController>();

  constructor(
    private store: Store,
    private emit: (event: ChatEvent) => void,
    private resolveProvider: () => ActiveProvider | null,
  ) {}

  isRunning(conversationId: number): boolean {
    return this.running.has(conversationId);
  }

  /** Append a user turn (text and/or a quick action) and generate the reply. */
  async send(conversationId: number, text: string, action: MessageAction | null = null): Promise<void> {
    if (this.running.has(conversationId)) return;
    const conversation = this.store.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    if (action?.type === "translate") {
      // Keep the conversation's language in step with what it now contains.
      this.store.updateConversation(conversationId, { options: { ...conversation.options, lang: action.lang } });
    }
    const userMessage = this.store.addMessage({
      conversationId,
      role: "user",
      content: text.trim(),
      action,
      lang: null,
      glossary: [],
      model: "",
    });
    await this.generate(conversationId, userMessage);
  }

  /** Drop the latest reply and write it again. */
  async regenerate(conversationId: number): Promise<void> {
    if (this.running.has(conversationId)) return;
    const messages = this.store.listMessages(conversationId);
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") this.store.deleteMessage(last.id);
    await this.generate(conversationId, null);
  }

  stop(conversationId: number): void {
    this.running.get(conversationId)?.abort();
  }

  private async generate(conversationId: number, userMessage: ReturnType<Store["addMessage"]> | null) {
    const abort = new AbortController();
    this.running.set(conversationId, abort);
    this.emit({ type: "start", conversationId, userMessage });

    try {
      const active = this.resolveProvider();
      if (!active) throw new Error("NO_PROVIDER");

      const conversation = this.store.getConversation(conversationId)!;
      const { options } = conversation;
      const messages = this.store.listMessages(conversationId);
      if (messages[messages.length - 1]?.role !== "user") throw new Error("Nothing to reply to");

      const sourceText = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const matches = options.useGlossary ? matchGlossary(sourceText, this.store.listGlossary()) : [];
      const settings = this.store.getSettings();
      const system = buildSystemPrompt(options, settings, matches.map((m) => m.entry));

      const turns: ChatTurn[] = messages.map((m, i) => {
        if (m.role === "assistant") return { role: "assistant", content: m.content };
        let content = userTurnText(m.content, m.action, i === 0, options.scenario);
        if (i > 0 && i === messages.length - 1) content += `\n\n${settingsChangedNote(options)}`;
        return { role: "user", content };
      });

      let streamed = "";
      let output = "";
      try {
        output = await active.provider.stream(
          system,
          turns,
          (text) => {
            streamed += text;
            this.emit({ type: "delta", conversationId, text });
          },
          abort.signal,
        );
      } catch (err) {
        // Stopped by the user: keep whatever was written so far.
        if (!abort.signal.aborted) throw err;
      }
      const content = (output || streamed).trim();
      if (!content) {
        if (abort.signal.aborted) return this.emit({ type: "error", conversationId, message: "STOPPED" });
        throw new Error("EMPTY");
      }

      const email = parseEmail(content);
      const lang: Lang = detectLang(email.body || content);
      const message = this.store.addMessage({
        conversationId,
        role: "assistant",
        content,
        action: null,
        lang,
        glossary: checkGlossary(content, matches, lang),
        model: active.label,
      });
      const updated =
        !conversation.title && email.subject
          ? this.store.updateConversation(conversationId, { title: email.subject.slice(0, 80) })!
          : this.store.getConversation(conversationId)!;
      this.emit({ type: "done", conversationId, message, conversation: updated });
    } catch (err) {
      // Known conditions carry an UPPER_CASE code the UI translates; anything else is logged.
      const coded = err instanceof Error && /^[A-Z_]+$/.test(err.message);
      if (!coded) console.error(err);
      const message = coded ? (err as Error).message : describeError(err);
      this.emit({ type: "error", conversationId, message });
    } finally {
      this.running.delete(conversationId);
    }
  }
}
