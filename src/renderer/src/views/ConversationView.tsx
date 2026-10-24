import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ConversationDetail, EmailOptions, Message, RevisePreset } from "@shared/types";
import { bard } from "../bard";
import { Composer } from "../components/Composer";
import { EmailCard } from "../components/EmailCard";
import { Icon } from "../components/Icon";
import { errorText, useT } from "../i18n";
import { useApp } from "../state";

const REVISIONS: RevisePreset[] = ["formal", "casual", "shorter", "warmer", "cta"];

export function ConversationView({ id }: { id: number }) {
  const { t } = useT();
  const { live, errors, revisions, send, regenerate, bump, refreshConversations } = useApp();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    let cancelled = false;
    bard.conversations.get(id).then((d) => !cancelled && setDetail(d));
    return () => {
      cancelled = true;
    };
  }, [id, revisions[id]]);

  useEffect(() => {
    setText("");
    pinned.current = true;
  }, [id]);

  const streaming = live[id];
  const error = errors[id];

  // Follow the stream while the user is at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [detail, streaming?.text, error]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const setOptions = useCallback(
    async (options: EmailOptions) => {
      setDetail((d) => (d ? { ...d, conversation: { ...d.conversation, options } } : d));
      await bard.conversations.update(id, { options });
    },
    [id],
  );

  if (!detail) return <div className="conversation" />;
  const { conversation, messages } = detail;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastIsUser = messages[messages.length - 1]?.role === "user";
  let version = 0;

  function submit() {
    if (!text.trim()) return;
    pinned.current = true;
    send(id, text);
    setText("");
  }

  return (
    <div className="conversation">
      <div className="conversation-scroll" ref={scroller} onScroll={onScroll}>
        <div className="thread">
          {messages.map((m) =>
            m.role === "user" ? (
              <UserTurn key={m.id} message={m} first={m === messages[0]} />
            ) : (
              <EmailCard
                key={m.id}
                content={m.content}
                message={m}
                version={++version}
                latest={m === lastAssistant && !streaming && !lastIsUser}
                onTranslate={(lang) => {
                  pinned.current = true;
                  send(id, "", { type: "translate", lang });
                }}
                onRegenerate={() => {
                  pinned.current = true;
                  regenerate(id);
                }}
                onSaved={() => bump(id)}
              />
            ),
          )}
          {streaming && <EmailCard content={streaming.text} version={version + 1} streaming />}
          {error && !streaming && (
            <div className="error-card">
              <Icon name="alert" size={18} />
              <span>{errorText(t, error)}</span>
              {lastIsUser && (
                <button type="button" className="btn ghost small" onClick={() => regenerate(id)}>
                  {t("email.retry")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="dock">
        {lastAssistant && !streaming && !lastIsUser && (
          <div className="revise-chips">
            {REVISIONS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="chip"
                onClick={() => {
                  pinned.current = true;
                  send(id, "", { type: "revise", preset });
                }}
              >
                <Icon name="wand" size={14} />
                {t(`revise.${preset}`)}
              </button>
            ))}
          </div>
        )}
        <Composer
          text={text}
          onText={setText}
          options={conversation.options}
          onOptions={(o) => {
            setOptions(o);
            refreshConversations();
          }}
          onSubmit={submit}
          onStop={() => bard.chat.stop(id)}
          streaming={Boolean(streaming)}
          placeholder={t("placeholder.follow")}
          placement="top"
          lockScenario
          autoFocus
        />
      </div>
    </div>
  );
}

function UserTurn({ message, first }: { message: Message; first: boolean }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  if (message.action) {
    const label =
      message.action.type === "translate"
        ? t("action.translate", { lang: t(`lang.${message.action.lang}`) })
        : t(`revise.${message.action.preset}`);
    return (
      <div className="user-turn">
        <span className="action-pill">
          <Icon name={message.action.type === "translate" ? "languages" : "wand"} size={14} />
          {label}
        </span>
      </div>
    );
  }
  const long = message.content.length > 420;
  return (
    <div className="user-turn">
      <div className={`user-bubble ${first ? "first" : ""} ${long && !expanded ? "clamped" : ""}`} onClick={() => long && setExpanded((e) => !e)}>
        {message.content}
      </div>
    </div>
  );
}
