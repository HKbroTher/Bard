import { useState } from "react";
import { LANGS, parseEmail, type Lang, type Message } from "@shared/types";
import { bard } from "../bard";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import { MenuItem, Popover } from "./Popover";
import { useToast } from "./Toast";

interface Props {
  /** Raw "SUBJECT: …\n---\n…" text. */
  content: string;
  version?: number;
  message?: Message;
  streaming?: boolean;
  latest?: boolean;
  onTranslate?(lang: Lang): void;
  onRegenerate?(): void;
  onSaved?(): void;
}

export function EmailCard({ content, version, message, streaming, latest, onTranslate, onRegenerate, onSaved }: Props) {
  const { t } = useT();
  const toast = useToast();
  const { subject, body } = parseEmail(content);
  const [editing, setEditing] = useState<{ subject: string; body: string } | null>(null);
  const lang = message?.lang;
  const missing = message?.glossary.filter((g) => !g.ok) ?? [];

  async function copy() {
    await navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body);
    toast(t("email.copied"));
  }

  async function save() {
    if (!message || !editing) return;
    await bard.chat.editMessage(message.id, `SUBJECT: ${editing.subject}\n---\n${editing.body}`);
    setEditing(null);
    onSaved?.();
  }

  return (
    <article className={`email-card ${streaming ? "streaming" : ""}`}>
      <header className="email-meta">
        <span className="email-version">
          {version !== undefined && t("email.version", { n: version })}
          {lang && <span className="lang-tag">{t(`lang.${lang}`)}</span>}
        </span>
        {message?.model && <span className="email-model">{message.model}</span>}
      </header>

      {editing ? (
        <div className="email-edit">
          <label>
            <span>{t("email.subject")}</span>
            <input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
          </label>
          <textarea value={editing.body} rows={Math.min(24, editing.body.split("\n").length + 2)} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          <div className="email-edit-actions">
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              {t("email.cancel")}
            </button>
            <button type="button" className="btn primary" onClick={save}>
              {t("email.save")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {subject || !streaming ? (
            <h3 className="email-subject">{subject}</h3>
          ) : (
            <div className="email-writing">
              <span className="shimmer">{t("email.writing")}</span>
            </div>
          )}
          {(body || subject) && <div className="email-body">{body}{streaming && <span className="caret" />}</div>}
        </>
      )}

      {!streaming && !editing && message && (
        <footer className="email-footer">
          {message.glossary.length > 0 && (
            <div className={`glossary-badge ${missing.length ? "warn" : "ok"}`} title={message.glossary.map((g) => `${g.found} → ${g.expected} ${g.ok ? "✓" : "✗"}`).join("\n")}>
              <Icon name={missing.length ? "alert" : "check"} size={14} />
              {missing.length ? t("email.glossaryMiss", { n: missing.length }) : t("email.glossaryOk")}
              {missing.length > 0 && <span className="glossary-miss">{missing.map((g) => g.expected).join("、")}</span>}
            </div>
          )}
          <div className="email-actions">
            <button type="button" className="icon-btn" onClick={copy} title={t("email.copy")}>
              <Icon name="copy" size={16} />
              <span>{t("email.copy")}</span>
            </button>
            <button type="button" className="icon-btn" onClick={() => setEditing({ subject, body })} title={t("email.edit")}>
              <Icon name="pencil" size={16} />
              <span>{t("email.edit")}</span>
            </button>
            {latest && onTranslate && (
              <Popover
                placement="top"
                trigger={() => (
                  <span className="icon-btn">
                    <Icon name="languages" size={16} />
                    <span>{t("email.translateTo")}</span>
                  </span>
                )}
              >
                {(close) =>
                  LANGS.filter((l) => l !== lang).map((l) => (
                    <MenuItem key={l} onClick={() => (onTranslate(l), close())}>
                      {t(`lang.${l}`)}
                    </MenuItem>
                  ))
                }
              </Popover>
            )}
            <button type="button" className="icon-btn" onClick={() => bard.app.openMail(subject, body)} title={t("email.openMail")}>
              <Icon name="mail" size={16} />
              <span>{t("email.openMail")}</span>
            </button>
            {latest && onRegenerate && (
              <button type="button" className="icon-btn" onClick={onRegenerate} title={t("email.regenerate")}>
                <Icon name="refresh" size={16} />
              </button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}
