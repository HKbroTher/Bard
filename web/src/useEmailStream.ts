import { useCallback, useRef, useState } from "react";
import { parseEmail, streamEmail, type DraftRequest, type GlossaryCheck, type TranslateRequest } from "./api";

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export interface EmailState {
  status: StreamStatus;
  subject: string;
  body: string;
  glossary: GlossaryCheck[];
  error: string;
}

const initial: EmailState = { status: "idle", subject: "", body: "", glossary: [], error: "" };

export function useEmailStream() {
  const [state, setState] = useState<EmailState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (path: "/api/draft" | "/api/translate", body: DraftRequest | TranslateRequest) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    let raw = "";
    setState({ ...initial, status: "streaming" });
    try {
      await streamEmail(
        path,
        body,
        (event) => {
          if (event.type === "delta") {
            raw += event.text;
            setState((s) => ({ ...s, ...parseEmail(raw) }));
          } else if (event.type === "done") {
            setState({ status: "done", subject: event.subject, body: event.body, glossary: event.glossary, error: "" });
          } else {
            setState((s) => ({ ...s, status: "error", error: event.message }));
          }
        },
        abort.signal,
      );
      setState((s) => (s.status === "streaming" ? { ...s, status: "done" } : s));
    } catch (err) {
      if (abort.signal.aborted) {
        setState((s) => ({ ...s, status: "done" }));
      } else {
        setState((s) => ({ ...s, status: "error", error: (err as Error).message }));
      }
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const edit = useCallback((patch: Partial<Pick<EmailState, "subject" | "body">>) => setState((s) => ({ ...s, ...patch })), []);

  return { state, run, stop, edit };
}
