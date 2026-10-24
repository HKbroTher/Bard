import { useState } from "react";
import type { EmailState } from "../useEmailStream";

interface Props {
  state: EmailState;
  onEdit: (patch: Partial<Pick<EmailState, "subject" | "body">>) => void;
  onStop: () => void;
  onTranslate?: (text: string) => void;
  placeholder: string;
}

export function EmailOutput({ state, onEdit, onStop, onTranslate, placeholder }: Props) {
  const [copied, setCopied] = useState(false);
  const streaming = state.status === "streaming";
  const hasContent = Boolean(state.subject || state.body);
  const full = state.subject ? `${state.subject}\n\n${state.body}` : state.body;

  async function copy() {
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const mailto = `mailto:?subject=${encodeURIComponent(state.subject)}&body=${encodeURIComponent(state.body)}`;
  const missing = state.glossary.filter((g) => !g.ok);

  return (
    <section className="panel output">
      <div className="panel-head">
        <h2>结果</h2>
        <div className="actions">
          {streaming && (
            <button type="button" className="ghost" onClick={onStop}>
              停止
            </button>
          )}
          {hasContent && !streaming && (
            <>
              <button type="button" className="ghost" onClick={copy}>
                {copied ? "已复制 ✓" : "复制"}
              </button>
              <a className="button ghost" href={mailto}>
                用邮件客户端打开
              </a>
              {onTranslate && (
                <button type="button" className="ghost" onClick={() => onTranslate(full)}>
                  翻译此邮件 →
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {state.error && <div className="alert error">{state.error}</div>}

      {!hasContent && !streaming && !state.error && <div className="empty">{placeholder}</div>}

      {(hasContent || streaming) && (
        <>
          <label className="field">
            <span>主题</span>
            <input value={state.subject} readOnly={streaming} onChange={(e) => onEdit({ subject: e.target.value })} />
          </label>
          <label className="field grow">
            <span>正文{streaming && <em className="typing"> 生成中…</em>}</span>
            <textarea
              className="email-body"
              value={state.body}
              readOnly={streaming}
              onChange={(e) => onEdit({ body: e.target.value })}
            />
          </label>
        </>
      )}

      {state.status === "done" && state.glossary.length > 0 && (
        <div className={`glossary-check ${missing.length ? "warn" : "ok"}`}>
          <strong>{missing.length ? `术语检查：${missing.length} 个术语未按术语表使用` : "术语检查：全部术语已统一 ✓"}</strong>
          <ul>
            {state.glossary.map((g) => (
              <li key={g.entryId} className={g.ok ? "ok" : "miss"}>
                {g.found} → <b>{g.expected}</b> {g.ok ? "✓" : "✗"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
