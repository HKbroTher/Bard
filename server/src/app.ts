import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { Store } from "./db.js";
import { checkGlossary, matchGlossary, parseCsv, toCsv } from "./glossary.js";
import { RefusalError, type LlmClient, type Prompt } from "./llm.js";
import { buildDraftPrompt, buildTranslatePrompt, FORMALITY, LANGUAGES, parseEmail, SCENARIOS, TONES } from "./prompts.js";
import type { Formality, Lang, Meta, ScenarioId, StreamEvent, ToneId } from "./shared.js";

const lang = z.enum(["zh", "en", "ja"]);
const tone = z.enum(TONES.map((t) => t.id) as [ToneId, ...ToneId[]]);
const scenario = z.enum(SCENARIOS.map((s) => s.id) as [ScenarioId, ...ScenarioId[]]);
const formality = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const short = z.string().trim().max(200).optional();

const draftSchema = z.object({
  scenario,
  lang,
  tone,
  formality,
  senderName: short,
  senderCompany: short,
  recipientName: short,
  recipientCompany: short,
  keyPoints: z.string().trim().min(1, "请填写邮件要点").max(10000),
  previousEmail: z.string().max(20000).optional(),
  useGlossary: z.boolean().default(true),
});

const translateSchema = z.object({
  text: z.string().trim().min(1, "请输入要翻译的邮件").max(20000),
  sourceLang: z.union([lang, z.literal("auto")]),
  targetLang: lang,
  tone: tone.optional(),
  formality,
  localize: z.boolean().default(false),
  useGlossary: z.boolean().default(true),
});

const glossarySchema = z
  .object({
    zh: z.string().max(200).default(""),
    en: z.string().max(200).default(""),
    ja: z.string().max(200).default(""),
    note: z.string().max(500).default(""),
    caseSensitive: z.boolean().default(false),
  })
  .refine((g) => [g.zh, g.en, g.ja].filter((t) => t.trim()).length >= 2, "至少填写两种语言的术语");

function badRequest(res: Response, error: z.ZodError) {
  res.status(400).json({ error: error.issues.map((i) => i.message).join("; ") });
}

function parseId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createApp(store: Store, llm: LlmClient, staticDir?: string) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/meta", (_req, res) => {
    const meta: Meta = {
      languages: LANGUAGES,
      scenarios: SCENARIOS.map(({ id, label, description }) => ({ id, label, description })),
      tones: TONES.map(({ id, label }) => ({ id, label })),
      formality: FORMALITY.map(({ id, label, description }) => ({ id, label, description })),
      mock: llm.mock,
      model: llm.model,
    };
    res.json(meta);
  });

  /** Run a prompt and stream it to the client as server-sent events. */
  async function streamCompletion(
    res: Response,
    prompt: Prompt,
    finish: (output: string) => Omit<Extract<StreamEvent, { type: "done" }>, "type">,
  ) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: StreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      const output = await llm.stream(prompt, (text) => send({ type: "delta", text }), abort.signal);
      send({ type: "done", ...finish(output) });
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error(err);
        const message = err instanceof RefusalError ? err.message : `生成失败：${(err as Error).message}`;
        send({ type: "error", message });
      }
    } finally {
      res.end();
    }
  }

  app.post("/api/draft", async (req, res) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const body = parsed.data;

    const source = [body.keyPoints, body.previousEmail ?? ""].join("\n");
    const matches = body.useGlossary ? matchGlossary(source, store.listGlossary()) : [];
    const prompt = buildDraftPrompt(body, matches.map((m) => m.entry));

    await streamCompletion(res, prompt, (output) => {
      const email = parseEmail(output);
      const historyId = store.addHistory({
        kind: "draft",
        lang: body.lang,
        scenario: body.scenario,
        tone: body.tone,
        formality: body.formality as Formality,
        input: body.keyPoints,
        ...email,
      });
      return { ...email, glossary: checkGlossary(output, matches, body.lang), historyId };
    });
  });

  app.post("/api/translate", async (req, res) => {
    const parsed = translateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const body = parsed.data;

    const matches = body.useGlossary ? matchGlossary(body.text, store.listGlossary()) : [];
    const prompt = buildTranslatePrompt(body, matches.map((m) => m.entry));

    await streamCompletion(res, prompt, (output) => {
      const email = parseEmail(output);
      const historyId = store.addHistory({
        kind: "translate",
        lang: body.targetLang as Lang,
        scenario: null,
        tone: body.tone ?? null,
        formality: body.formality as Formality,
        input: body.text,
        ...email,
      });
      return { ...email, glossary: checkGlossary(output, matches, body.targetLang), historyId };
    });
  });

  app.get("/api/glossary", (req, res) => {
    res.json(store.listGlossary(typeof req.query.q === "string" ? req.query.q : undefined));
  });

  app.post("/api/glossary", (req, res) => {
    const parsed = glossarySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    res.status(201).json(store.createGlossary(parsed.data));
  });

  app.put("/api/glossary/:id", (req, res) => {
    const id = parseId(req);
    const parsed = glossarySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const entry = id && store.updateGlossary(id, parsed.data);
    if (!entry) return void res.status(404).json({ error: "词条不存在" });
    res.json(entry);
  });

  app.delete("/api/glossary/:id", (req, res) => {
    const id = parseId(req);
    if (!id || !store.deleteGlossary(id)) return void res.status(404).json({ error: "词条不存在" });
    res.status(204).end();
  });

  app.get("/api/glossary/export.csv", (_req, res) => {
    const rows = store.listGlossary().map((e) => [e.zh, e.en, e.ja, e.note, e.caseSensitive ? 1 : 0]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="glossary.csv"');
    res.send(toCsv([["zh", "en", "ja", "note", "case_sensitive"], ...rows]));
  });

  app.post("/api/glossary/import", express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }), (req, res) => {
    if (typeof req.body !== "string") return void res.status(400).json({ error: "请上传 CSV 文本" });
    const rows = parseCsv(req.body);
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const hasHeader = header.includes("zh") || header.includes("en") || header.includes("ja");
    const col = (name: string, fallback: number) => (hasHeader ? header.indexOf(name) : fallback);
    const idx = { zh: col("zh", 0), en: col("en", 1), ja: col("ja", 2), note: col("note", 3), cs: col("case_sensitive", 4) };
    const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

    const entries = [];
    const errors: string[] = [];
    for (const [n, r] of (hasHeader ? rows.slice(1) : rows).entries()) {
      const parsed = glossarySchema.safeParse({
        zh: get(r, idx.zh),
        en: get(r, idx.en),
        ja: get(r, idx.ja),
        note: get(r, idx.note),
        caseSensitive: ["1", "true", "yes"].includes(get(r, idx.cs).toLowerCase()),
      });
      if (parsed.success) entries.push(parsed.data);
      else errors.push(`第 ${n + (hasHeader ? 2 : 1)} 行：${parsed.error.issues[0].message}`);
    }
    res.json({ imported: store.importGlossary(entries), errors });
  });

  app.get("/api/history", (_req, res) => {
    res.json(store.listHistory());
  });

  app.delete("/api/history/:id", (req, res) => {
    const id = parseId(req);
    if (!id || !store.deleteHistory(id)) return void res.status(404).json({ error: "记录不存在" });
    res.status(204).end();
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile("index.html", { root: staticDir }));
  }

  return app;
}
