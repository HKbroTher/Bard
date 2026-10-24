import { useEffect, useState } from "react";
import { api, type Meta } from "./api";
import { DraftPage } from "./pages/DraftPage";
import { GlossaryPage } from "./pages/GlossaryPage";
import { HistoryPage } from "./pages/HistoryPage";
import { TranslatePage } from "./pages/TranslatePage";

type Tab = "draft" | "translate" | "glossary" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "draft", label: "起草" },
  { id: "translate", label: "翻译" },
  { id: "glossary", label: "术语表" },
  { id: "history", label: "历史" },
];

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("draft");
  const [handoff, setHandoff] = useState<{ text: string } | null>(null);

  useEffect(() => {
    api.meta().then(setMeta, (err) => setError(`无法连接后端服务：${err.message}`));
  }, []);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">✉</span>
          <div>
            <h1>多语言商务邮件助手</h1>
            <p>中 · 英 · 日 商务邮件起草与翻译</p>
          </div>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        {meta && <span className={`model ${meta.mock ? "mock" : ""}`}>{meta.mock ? "模拟模式" : meta.model}</span>}
      </header>

      {meta?.mock && (
        <div className="alert info banner">当前为离线模拟模式：未配置 ANTHROPIC_API_KEY，结果为示例文本。</div>
      )}
      {error && <div className="alert error banner">{error}</div>}

      {meta && (
        <main>
          <div hidden={tab !== "draft"}>
            <DraftPage
              meta={meta}
              onTranslate={(text) => {
                setHandoff({ text });
                setTab("translate");
              }}
            />
          </div>
          <div hidden={tab !== "translate"}>
            <TranslatePage meta={meta} handoff={handoff} />
          </div>
          <div hidden={tab !== "glossary"}>
            <GlossaryPage active={tab === "glossary"} />
          </div>
          <div hidden={tab !== "history"}>
            <HistoryPage meta={meta} active={tab === "history"} />
          </div>
        </main>
      )}
    </div>
  );
}
