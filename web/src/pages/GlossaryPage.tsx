import { useCallback, useEffect, useRef, useState } from "react";
import { api, type GlossaryEntry, type GlossaryInput } from "../api";

const blank: GlossaryInput = { zh: "", en: "", ja: "", note: "", caseSensitive: false };

function EntryForm({ initial, onSave, onCancel }: { initial: GlossaryInput; onSave: (g: GlossaryInput) => Promise<void>; onCancel?: () => void }) {
  const [g, setG] = useState(initial);
  const [error, setError] = useState("");
  const set = (patch: Partial<GlossaryInput>) => setG((x) => ({ ...x, ...patch }));

  async function save() {
    try {
      setError("");
      await onSave(g);
      if (!onCancel) setG(blank);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <tr className="editing">
      <td><input value={g.zh} placeholder="中文" onChange={(e) => set({ zh: e.target.value })} /></td>
      <td><input value={g.en} placeholder="English" onChange={(e) => set({ en: e.target.value })} /></td>
      <td><input value={g.ja} placeholder="日本語" onChange={(e) => set({ ja: e.target.value })} /></td>
      <td><input value={g.note} placeholder="备注（可选）" onChange={(e) => set({ note: e.target.value })} /></td>
      <td className="center">
        <input type="checkbox" checked={g.caseSensitive} title="英文区分大小写" onChange={(e) => set({ caseSensitive: e.target.checked })} />
      </td>
      <td className="actions">
        <button type="button" className="primary small" onClick={save}>{onCancel ? "保存" : "添加"}</button>
        {onCancel && <button type="button" className="ghost small" onClick={onCancel}>取消</button>}
        {error && <div className="inline-error">{error}</div>}
      </td>
    </tr>
  );
}

export function GlossaryPage({ active }: { active: boolean }) {
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => api.glossary(q).then(setEntries), [q]);
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  async function importFile(file: File) {
    const result = await api.importGlossary(await file.text());
    setNotice(`已导入 ${result.imported} 条${result.errors.length ? `，跳过 ${result.errors.length} 行：${result.errors.slice(0, 3).join("；")}` : ""}`);
    refresh();
  }

  async function remove(e: GlossaryEntry) {
    if (!confirm(`删除词条「${e.zh || e.en || e.ja}」？`)) return;
    await api.deleteGlossary(e.id);
    refresh();
  }

  return (
    <section className="panel wide">
      <div className="panel-head">
        <div>
          <h2>术语表</h2>
          <p className="hint">
            生成和翻译时，系统会自动找出原文中出现的词条，要求模型使用对应语言的标准译法，并在结果中检查是否统一。
          </p>
        </div>
        <div className="actions">
          <input className="search" value={q} placeholder="搜索术语…" onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>导入 CSV</button>
          <a className="button ghost" href="/api/glossary/export.csv">导出 CSV</a>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f).catch((err) => setNotice(err.message));
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {notice && <div className="alert info" onClick={() => setNotice("")}>{notice}</div>}

      <div className="table-wrap">
        <table className="glossary">
          <thead>
            <tr>
              <th>中文</th>
              <th>English</th>
              <th>日本語</th>
              <th>备注</th>
              <th title="英文区分大小写，适用于 iPhone、eSIM 等产品名">Aa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <EntryForm initial={blank} onSave={async (g) => { await api.createGlossary(g); refresh(); }} />
            {entries.map((e) =>
              editing === e.id ? (
                <EntryForm
                  key={e.id}
                  initial={e}
                  onCancel={() => setEditing(null)}
                  onSave={async (g) => { await api.updateGlossary(e.id, g); setEditing(null); refresh(); }}
                />
              ) : (
                <tr key={e.id}>
                  <td>{e.zh}</td>
                  <td>{e.en}</td>
                  <td>{e.ja}</td>
                  <td className="muted">{e.note}</td>
                  <td className="center">{e.caseSensitive ? "✓" : ""}</td>
                  <td className="actions">
                    <button type="button" className="ghost small" onClick={() => setEditing(e.id)}>编辑</button>
                    <button type="button" className="ghost small danger" onClick={() => remove(e)}>删除</button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {entries.length === 0 && <div className="empty">{q ? "没有匹配的词条" : "还没有词条。在上方添加，或导入 CSV（列：zh,en,ja,note,case_sensitive）。"}</div>}
      </div>
    </section>
  );
}
