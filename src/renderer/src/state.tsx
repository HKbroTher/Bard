import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Conversation, EmailOptions, MessageAction, ProviderConfig, ProviderPreset, Settings } from "@shared/types";
import { bard } from "./bard";

export type View =
  | { type: "home" }
  | { type: "conversation"; id: number }
  | { type: "glossary" }
  | { type: "settings" };

interface Live {
  text: string;
}

interface AppState {
  settings: Settings;
  providers: ProviderConfig[];
  presets: ProviderPreset[];
  conversations: Conversation[];
  view: View;
  /** Text streaming in, per conversation. */
  live: Record<number, Live>;
  /** Last error per conversation, cleared on the next request. */
  errors: Record<number, string>;
  /** Bumped whenever a conversation's stored messages change. */
  revisions: Record<number, number>;
  navigate(view: View): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  refreshProviders(): Promise<void>;
  refreshConversations(): Promise<void>;
  startConversation(options: EmailOptions, text: string): Promise<void>;
  send(conversationId: number, text: string, action?: MessageAction | null): void;
  regenerate(conversationId: number): void;
  deleteConversation(id: number): Promise<void>;
  bump(conversationId: number): void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

const without = <T,>(map: Record<number, T>, id: number) => {
  const { [id]: _removed, ...rest } = map;
  return rest;
};

export function AppProvider({ initial, children }: { initial: { settings: Settings; providers: ProviderConfig[]; presets: ProviderPreset[] }; children: ReactNode }) {
  const [settings, setSettings] = useState(initial.settings);
  const [providers, setProviders] = useState(initial.providers);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [view, setView] = useState<View>({ type: "home" });
  const [live, setLive] = useState<Record<number, Live>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [revisions, setRevisions] = useState<Record<number, number>>({});

  const bump = useCallback((id: number) => setRevisions((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 })), []);
  const refreshConversations = useCallback(async () => setConversations(await bard.conversations.list()), []);
  const refreshProviders = useCallback(async () => {
    setProviders(await bard.providers.list());
    setSettings(await bard.settings.get());
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(
    () =>
      bard.chat.onEvent((event) => {
        const id = event.conversationId;
        switch (event.type) {
          case "start":
            setErrors((e) => without(e, id));
            setLive((l) => ({ ...l, [id]: { text: "" } }));
            bump(id);
            break;
          case "delta":
            setLive((l) => ({ ...l, [id]: { text: (l[id]?.text ?? "") + event.text } }));
            break;
          case "done":
            setLive((l) => without(l, id));
            bump(id);
            refreshConversations();
            break;
          case "error":
            setLive((l) => without(l, id));
            if (event.message !== "STOPPED") setErrors((e) => ({ ...e, [id]: event.message }));
            bump(id);
            refreshConversations();
            break;
        }
      }),
    [bump, refreshConversations],
  );

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSettings(await bard.settings.set(patch));
  }, []);

  const send = useCallback((conversationId: number, text: string, action: MessageAction | null = null) => {
    bard.chat.send(conversationId, text, action).catch((err) => setErrors((e) => ({ ...e, [conversationId]: String(err.message ?? err) })));
  }, []);

  const startConversation = useCallback(
    async (options: EmailOptions, text: string) => {
      const conversation = await bard.conversations.create(options);
      setConversations((cs) => [conversation, ...cs]);
      setView({ type: "conversation", id: conversation.id });
      send(conversation.id, text);
    },
    [send],
  );

  const regenerate = useCallback((conversationId: number) => {
    bard.chat.regenerate(conversationId);
  }, []);

  const deleteConversation = useCallback(async (id: number) => {
    await bard.conversations.remove(id);
    setConversations((cs) => cs.filter((c) => c.id !== id));
    setView((v) => (v.type === "conversation" && v.id === id ? { type: "home" } : v));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      settings,
      providers,
      presets: initial.presets,
      conversations,
      view,
      live,
      errors,
      revisions,
      navigate: setView,
      updateSettings,
      refreshProviders,
      refreshConversations,
      startConversation,
      send,
      regenerate,
      deleteConversation,
      bump,
    }),
    [settings, providers, initial.presets, conversations, view, live, errors, revisions, updateSettings, refreshProviders, refreshConversations, startConversation, send, regenerate, deleteConversation, bump],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
