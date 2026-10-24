import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import type { EmailOptions, GlossaryInput, MessageAction, ProviderInput, Settings, Theme } from "../shared/types";
import { formatEmail, parseEmail } from "../shared/types";
import type { ChatService } from "./chat";
import type { Store } from "./db";
import { parseCsv, toCsv } from "./glossary";
import { createProvider, describeError } from "./providers";
import { MOCK_PRESET, PRESETS } from "./providers/presets";

const mock = process.env.BARD_MOCK === "1";

function validateGlossary(g: GlossaryInput): GlossaryInput {
  const clean = {
    zh: String(g.zh ?? "").trim().slice(0, 200),
    en: String(g.en ?? "").trim().slice(0, 200),
    ja: String(g.ja ?? "").trim().slice(0, 200),
    note: String(g.note ?? "").trim().slice(0, 500),
    caseSensitive: Boolean(g.caseSensitive),
  };
  if ([clean.zh, clean.en, clean.ja].filter(Boolean).length < 2) throw new Error("GLOSSARY_TWO_LANGS");
  return clean;
}

function cleanProvider(input: ProviderInput): ProviderInput {
  return {
    kind: input.kind,
    name: String(input.name ?? "").trim() || input.kind,
    baseUrl: String(input.baseUrl ?? "").trim().replace(/\/+$/, ""),
    model: String(input.model ?? "").trim(),
    apiKey: input.apiKey === undefined ? undefined : String(input.apiKey).trim(),
  };
}

export function registerIpc(store: Store, chat: ChatService, getWindow: () => BrowserWindow | null) {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R) =>
    ipcMain.handle(channel, (_event, ...args) => fn(...(args as A)));

  handle("settings:get", () => store.getSettings());
  handle("settings:set", (patch: Partial<Settings>) => store.setSettings(patch));

  handle("providers:presets", () => (mock ? [...PRESETS, MOCK_PRESET] : PRESETS));
  handle("providers:list", () => store.listProviders());
  handle("providers:save", (input: ProviderInput, id?: number) => {
    const saved = store.saveProvider(cleanProvider(input), id);
    if (!store.getSettings().activeProviderId) store.setSettings({ activeProviderId: saved.id });
    return saved;
  });
  handle("providers:remove", (id: number) => {
    store.deleteProvider(id);
    const settings = store.getSettings();
    if (settings.activeProviderId === id) store.setSettings({ activeProviderId: store.listProviders()[0]?.id ?? null });
  });
  handle("providers:test", async (input: ProviderInput, id?: number) => {
    const p = cleanProvider(input);
    const apiKey = p.apiKey || (id ? store.getProviderKey(id) : "");
    try {
      const models = await createProvider({ kind: p.kind, baseUrl: p.baseUrl, model: p.model, apiKey }).listModels();
      return { ok: true, models };
    } catch (err) {
      return { ok: false, models: [], error: describeError(err) };
    }
  });

  handle("conversations:list", () => store.listConversations());
  handle("conversations:get", (id: number) => {
    const conversation = store.getConversation(id);
    return conversation ? { conversation, messages: store.listMessages(id) } : null;
  });
  handle("conversations:create", (options: EmailOptions) => store.createConversation(options));
  handle("conversations:update", (id: number, patch: { title?: string; options?: EmailOptions }) => store.updateConversation(id, patch) ?? null);
  handle("conversations:remove", (id: number) => {
    chat.stop(id);
    store.deleteConversation(id);
  });

  // Replies stream through events, so these resolve once generation has finished.
  handle("chat:send", (id: number, text: string, action?: MessageAction | null) => chat.send(id, String(text ?? ""), action ?? null));
  handle("chat:regenerate", (id: number) => chat.regenerate(id));
  handle("chat:stop", (id: number) => chat.stop(id));
  handle("chat:editMessage", (id: number, content: string) => {
    const { subject, body } = parseEmail(String(content));
    return store.updateMessageContent(id, formatEmail(subject, body)) ?? null;
  });

  handle("glossary:list", (q?: string) => store.listGlossary(q));
  handle("glossary:create", (input: GlossaryInput) => store.createGlossary(validateGlossary(input)));
  handle("glossary:update", (id: number, input: GlossaryInput) => store.updateGlossary(id, validateGlossary(input)) ?? null);
  handle("glossary:remove", (id: number) => void store.deleteGlossary(id));
  handle("glossary:import", async () => {
    const win = getWindow();
    const options = { properties: ["openFile" as const], filters: [{ name: "CSV", extensions: ["csv", "txt"] }] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;

    const rows = parseCsv(await readFile(result.filePaths[0], "utf8"));
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const hasHeader = header.includes("zh") || header.includes("en") || header.includes("ja");
    const col = (name: string, fallback: number) => (hasHeader ? header.indexOf(name) : fallback);
    const idx = { zh: col("zh", 0), en: col("en", 1), ja: col("ja", 2), note: col("note", 3), cs: col("case_sensitive", 4) };
    const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

    const entries: GlossaryInput[] = [];
    const errors: string[] = [];
    for (const [n, r] of (hasHeader ? rows.slice(1) : rows).entries()) {
      try {
        entries.push(
          validateGlossary({
            zh: get(r, idx.zh),
            en: get(r, idx.en),
            ja: get(r, idx.ja),
            note: get(r, idx.note),
            caseSensitive: ["1", "true", "yes"].includes(get(r, idx.cs).toLowerCase()),
          }),
        );
      } catch {
        errors.push(String(n + (hasHeader ? 2 : 1)));
      }
    }
    return { imported: store.importGlossary(entries), errors };
  });
  handle("glossary:export", async () => {
    const win = getWindow();
    const options = { defaultPath: "bard-glossary.csv", filters: [{ name: "CSV", extensions: ["csv"] }] };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    const rows = store.listGlossary().map((e) => [e.zh, e.en, e.ja, e.note, e.caseSensitive ? 1 : 0]);
    await writeFile(result.filePath, toCsv([["zh", "en", "ja", "note", "case_sensitive"], ...rows]), "utf8");
    return true;
  });

  handle("app:openMail", (subject: string, body: string) =>
    shell.openExternal(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`),
  );
  handle("app:openExternal", (url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
  });
  handle("app:setTheme", (theme: Theme, colors: { background: string; symbol: string }) => {
    nativeTheme.themeSource = theme;
    const win = getWindow();
    if (win && process.platform !== "darwin") {
      win.setTitleBarOverlay?.({ color: colors.background, symbolColor: colors.symbol, height: 44 });
    }
    win?.setBackgroundColor(colors.background);
  });
  handle("app:version", () => app.getVersion());
}
