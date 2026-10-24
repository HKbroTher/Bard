import { useCallback, useEffect, useState } from "react";
import type { GlossaryEntry, GlossaryInput } from "@shared/types";
import { bard } from "../bard";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { errorText, useT } from "../i18n";

const blank: GlossaryInput = { zh: "", en: "", ja: "", note: "", caseSensitive: false };

function EntryRow({ initial, onSave, onCancel }: { initial: GlossaryInput; onSave(g: GlossaryInput): Promise<void>; onCancel(): void }) {
  const { t } = useT();
  const [g, setG] = useState(initial);
  const [error, setError] = useState("");
  const set = (patch: Partial<GlossaryInput>) => setG((x) => ({ ...x, ...patch }));

  async function save() {
    try {
      setError("");
      await onSave(g);
    } catch (err) {
      setError(errorText(t, String((err as Error).message).replace(/^.*Error: /, "")));
    }
  }

  return (
    <tr className="editing" onKeyDown={(e) => (e.key === "Enter" ? save() : e.key === "Escape" && onCancel())}>
      <td>
        <input autoFocus value={g.zh} placeholder="中文" onChange={(e) => set({ zh: e.target.value })} />
      </td>
      <td>
        <input value={g.en} placeholder="English" onChange={(e) => set({ en: e.target.value })} />
      </td>
      <td>
        <input value={g.ja} placeholder="日本語" onChange={(e) => set({ ja: e.target.value })} />
      </td>
      <td>
        <input value={g.note} placeholder={t("glossary.note")} onChange={(e) => set({ note: e.target.value })} />
      </td>
      <td className="center">
        <input type="checkbox" checked={g.caseSensitive} title={t("glossary.caseHint")} onChange={(e) => set({ caseSensitive: e.target.checked })} />
      </td>
      <td className="row-actions">
        <button type="button" className="btn primary small" onClick={save}>
          {t("email.save")}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          {t("email.cancel")}
        </button>
        {error && <div className="inline-error">{error}</div>}
      </td>
    </tr>
  );
}

export function GlossaryView() {
  const { t } = useT();
  const toast = useToast();
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const refresh = useCallback(() => bard.glossary.list(q).then(setEntries), [q]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function importCsv() {
    const result = await bard.glossary.importCsv();
    if (!result) return;
    toast(t("glossary.imported", { n: result.imported }) + (result.errors.length ? t("glossary.skipped", { rows: result.errors.slice(0, 5).join(", ") }) : ""));
    refresh();
  }

  async function remove(e: GlossaryEntry) {
    if (!confirm(t("glossary.confirmDelete", { term: e.zh || e.en || e.ja }))) return;
    await bard.glossary.remove(e.id);
    refresh();
  }

  return (
    <div className="page">
      <div className="page-inner wide">
        <h1 className="page-title">{t("glossary.title")}</h1>
        <p className="page-sub">{t("glossary.sub")}</p>

        <div className="toolbar">
          <div className="search-input">
            <Icon name="search" size={16} />
            <input value={q} placeholder={t("glossary.search")} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="toolbar-actions">
            <button type="button" className="btn ghost" title={t("glossary.csvHint")} onClick={importCsv}>
              <Icon name="upload" size={15} />
              {t("glossary.import")}
            </button>
            <button type="button" className="btn ghost" onClick={async () => (await bard.glossary.exportCsv()) && toast(t("glossary.exported"))}>
              <Icon name="download" size={15} />
              {t("glossary.export")}
            </button>
            <button type="button" className="btn primary" onClick={() => setEditing("new")}>
              <Icon name="plus" size={15} />
              {t("glossary.add")}
            </button>
          </div>
        </div>

        <div className="table-card">
          <table className="glossary-table">
            <thead>
              <tr>
                <th>中文</th>
                <th>English</th>
                <th>日本語</th>
                <th>{t("glossary.note")}</th>
                <th className="center" title={t("glossary.caseHint")}>
                  Aa
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {editing === "new" && (
                <EntryRow
                  initial={blank}
                  onCancel={() => setEditing(null)}
                  onSave={async (g) => {
                    await bard.glossary.create(g);
                    setEditing(null);
                    refresh();
                  }}
                />
              )}
              {entries.map((e) =>
                editing === e.id ? (
                  <EntryRow
                    key={e.id}
                    initial={e}
                    onCancel={() => setEditing(null)}
                    onSave={async (g) => {
                      await bard.glossary.update(e.id, g);
                      setEditing(null);
                      refresh();
                    }}
                  />
                ) : (
                  <tr key={e.id} onDoubleClick={() => setEditing(e.id)}>
                    <td>{e.zh}</td>
                    <td>{e.en}</td>
                    <td>{e.ja}</td>
                    <td className="muted">{e.note}</td>
                    <td className="center">{e.caseSensitive && <Icon name="check" size={15} />}</td>
                    <td className="row-actions">
                      <button type="button" className="icon-btn" title={t("settings.edit")} onClick={() => setEditing(e.id)}>
                        <Icon name="pencil" size={15} />
                      </button>
                      <button type="button" className="icon-btn danger" title={t("nav.delete")} onClick={() => remove(e)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {entries.length === 0 && editing !== "new" && (
            <div className="table-empty">
              <Icon name="book" size={28} />
              <p>{q ? t("glossary.noMatch") : t("glossary.empty")}</p>
              {!q && (
                <button type="button" className="btn primary" onClick={() => setEditing("new")}>
                  {t("glossary.add")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
