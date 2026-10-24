import type {
  DraftRequest,
  GlossaryEntry,
  GlossaryInput,
  HistoryItem,
  Meta,
  StreamEvent,
  TranslateRequest,
} from "../../server/src/shared";

export type * from "../../server/src/shared";
export { parseEmail } from "../../server/src/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  meta: () => fetch("/api/meta").then(json<Meta>),
  glossary: (q = "") => fetch(`/api/glossary?q=${encodeURIComponent(q)}`).then(json<GlossaryEntry[]>),
  createGlossary: (g: GlossaryInput) => fetch("/api/glossary", send("POST", g)).then(json<GlossaryEntry>),
  updateGlossary: (id: number, g: GlossaryInput) => fetch(`/api/glossary/${id}`, send("PUT", g)).then(json<GlossaryEntry>),
  deleteGlossary: (id: number) => fetch(`/api/glossary/${id}`, send("DELETE")).then(json<void>),
  importGlossary: (csv: string) =>
    fetch("/api/glossary/import", { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv }).then(
      json<{ imported: number; errors: string[] }>,
    ),
  history: () => fetch("/api/history").then(json<HistoryItem[]>),
  deleteHistory: (id: number) => fetch(`/api/history/${id}`, send("DELETE")).then(json<void>),
};

/** POST a generation request and feed each server-sent event to onEvent. */
export async function streamEmail(
  path: "/api/draft" | "/api/translate",
  body: DraftRequest | TranslateRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, { ...send("POST", body), signal });
  if (!res.ok || !res.body) {
    await json(res);
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)));
    }
  }
}
