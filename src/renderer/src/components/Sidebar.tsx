import type { Conversation } from "@shared/types";
import { bard } from "../bard";
import { useT, type MessageKey } from "../i18n";
import { useApp } from "../state";
import { Icon } from "./Icon";
import { Wordmark } from "./Logo";

function groupKey(iso: string): MessageKey {
  const date = new Date(iso.replace(" ", "T") + "Z");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = (start.getTime() - date.getTime()) / 86_400_000;
  if (days <= 0) return "nav.today";
  if (days <= 1) return "nav.yesterday";
  if (days <= 7) return "nav.week";
  return "nav.older";
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle(): void }) {
  const { t } = useT();
  const { conversations, view, navigate, deleteConversation, live } = useApp();

  const groups: { key: MessageKey; items: Conversation[] }[] = [];
  for (const c of conversations) {
    const key = groupKey(c.updatedAt);
    const group = groups.find((g) => g.key === key);
    if (group) group.items.push(c);
    else groups.push({ key, items: [c] });
  }

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""} platform-${bard.platform}`}>
      <div className="sidebar-top drag">
        <Wordmark />
        <button type="button" className="icon-btn no-drag" title={t("nav.collapse")} onClick={onToggle}>
          <Icon name="sidebar" size={18} />
        </button>
      </div>

      <button type="button" className={`new-button ${view.type === "home" ? "active" : ""}`} onClick={() => navigate({ type: "home" })}>
        <span className="new-icon">
          <Icon name="plus" size={16} strokeWidth={2.25} />
        </span>
        {t("nav.new")}
      </button>

      <nav className="history-list">
        {conversations.length === 0 && <p className="history-empty">{t("nav.empty")}</p>}
        {groups.map((g) => (
          <section key={g.key}>
            <h4>{t(g.key)}</h4>
            {g.items.map((c) => {
              const active = view.type === "conversation" && view.id === c.id;
              return (
                <div key={c.id} className={`history-item ${active ? "active" : ""}`}>
                  <button type="button" className="history-title" onClick={() => navigate({ type: "conversation", id: c.id })}>
                    {live[c.id] && <span className="live-dot" />}
                    <span>{c.title || t("nav.untitled")}</span>
                  </button>
                  <button
                    type="button"
                    className="history-delete"
                    title={t("nav.delete")}
                    onClick={() => confirm(t("nav.confirmDelete")) && deleteConversation(c.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })}
          </section>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button type="button" className={`nav-item ${view.type === "glossary" ? "active" : ""}`} onClick={() => navigate({ type: "glossary" })}>
          <Icon name="book" size={17} />
          {t("nav.glossary")}
        </button>
        <button type="button" className={`nav-item ${view.type === "settings" ? "active" : ""}`} onClick={() => navigate({ type: "settings" })}>
          <Icon name="gear" size={17} />
          {t("nav.settings")}
        </button>
      </div>
    </aside>
  );
}
