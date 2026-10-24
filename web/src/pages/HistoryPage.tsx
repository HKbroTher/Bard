import { useEffect, useState } from "react";
import { api, type HistoryItem, type Meta } from "../api";

export function HistoryPage({ meta, active }: { meta: Meta; active: boolean }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (active) api.history().then(setItems);
  }, [active]);

  const label = (list: { id: unknown; label: string }[], id: unknown) => list.find((x) => x.id === id)?.label ?? "";

  async function remove(id: number) {
    await api.deleteHistory(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <section className="panel wide">
      <h2>历史记录</h2>
      {items.length === 0 && <div className="empty">生成或翻译的邮件会保存在这里。</div>}
      <ul className="history">
        {items.map((h) => (
          <li key={h.id} className={open === h.id ? "open" : ""}>
            <button type="button" className="history-head" onClick={() => setOpen(open === h.id ? null : h.id)}>
              <span className={`tag ${h.kind}`}>{h.kind === "draft" ? label(meta.scenarios, h.scenario) || "起草" : "翻译"}</span>
              <span className="tag lang">{label(meta.languages, h.lang)}</span>
              <span className="subject">{h.subject || h.body.slice(0, 60)}</span>
              <time>{new Date(h.createdAt.replace(" ", "T") + "Z").toLocaleString()}</time>
            </button>
            {open === h.id && (
              <div className="history-body">
                <div className="cols">
                  <div>
                    <h3>输入</h3>
                    <pre>{h.input}</pre>
                  </div>
                  <div>
                    <h3>{h.subject}</h3>
                    <pre>{h.body}</pre>
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="ghost small" onClick={() => navigator.clipboard.writeText(`${h.subject}\n\n${h.body}`)}>复制</button>
                  <button type="button" className="ghost small danger" onClick={() => remove(h.id)}>删除</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
