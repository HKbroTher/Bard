import { useEffect, useState, type FormEvent } from "react";
import type { Lang, Meta, ToneId, TranslateRequest } from "../api";
import { EmailOutput } from "../components/EmailOutput";
import { Segmented } from "../components/Segmented";
import { load, save } from "../storage";
import { useEmailStream } from "../useEmailStream";

export function TranslatePage({ meta, handoff }: { meta: Meta; handoff: { text: string } | null }) {
  const [form, setForm] = useState<TranslateRequest>(() => ({
    ...load<TranslateRequest>("translate", {
      text: "",
      sourceLang: "auto",
      targetLang: "ja",
      formality: 2,
      localize: true,
      useGlossary: true,
    }),
    text: "",
  }));
  const { state, run, stop, edit } = useEmailStream();
  const set = <K extends keyof TranslateRequest>(key: K, value: TranslateRequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (handoff) setForm((f) => ({ ...f, text: handoff.text }));
  }, [handoff]);

  useEffect(() => {
    const { text: _t, ...keep } = form;
    save("translate", keep);
  }, [form]);

  function submit(e: FormEvent) {
    e.preventDefault();
    run("/api/translate", form);
  }

  function swap() {
    if (form.sourceLang === "auto") return;
    setForm((f) => ({ ...f, sourceLang: f.targetLang, targetLang: f.sourceLang as Lang, text: state.body ? `${state.subject}\n\n${state.body}` : f.text }));
  }

  const sourceOptions = [{ id: "auto" as const, label: "自动检测" }, ...meta.languages];
  const toneOptions = [{ id: "" as const, label: "保持原文" }, ...meta.tones];

  return (
    <div className="workspace">
      <form className="panel" onSubmit={submit}>
        <h2>翻译 / 本地化</h2>
        <div className="row lang-row">
          <div className="field">
            <span>源语言</span>
            <Segmented name="源语言" value={form.sourceLang} options={sourceOptions} onChange={(v) => set("sourceLang", v)} />
          </div>
          <button type="button" className="ghost swap" onClick={swap} disabled={form.sourceLang === "auto"} title="互换语言">
            ⇄
          </button>
          <div className="field">
            <span>目标语言</span>
            <Segmented name="目标语言" value={form.targetLang} options={meta.languages} onChange={(v) => set("targetLang", v)} />
          </div>
        </div>

        <label className="field grow">
          <span>原文邮件</span>
          <textarea
            rows={12}
            value={form.text}
            placeholder="粘贴需要翻译的邮件（可包含主题行）"
            onChange={(e) => set("text", e.target.value)}
          />
        </label>

        <div className="row">
          <div className="field">
            <span>正式程度</span>
            <Segmented name="正式程度" value={form.formality} options={meta.formality} onChange={(v) => set("formality", v)} />
          </div>
          <div className="field">
            <span>翻译方式</span>
            <Segmented
              name="翻译方式"
              value={form.localize ? "localize" : "faithful"}
              options={[
                { id: "localize", label: "地道本地化", description: "按目标语言的商务习惯改写" },
                { id: "faithful", label: "忠实直译", description: "尽量贴近原文结构" },
              ]}
              onChange={(v) => set("localize", v === "localize")}
            />
          </div>
        </div>

        <div className="field">
          <span>语气调整</span>
          <Segmented
            name="语气调整"
            value={form.tone ?? ""}
            options={toneOptions}
            onChange={(v) => set("tone", (v || undefined) as ToneId | undefined)}
          />
        </div>

        <div className="submit-row">
          <label className="check">
            <input type="checkbox" checked={form.useGlossary} onChange={(e) => set("useGlossary", e.target.checked)} />
            应用术语表
          </label>
          <button type="submit" className="primary" disabled={!form.text.trim() || state.status === "streaming"}>
            {state.status === "streaming" ? "翻译中…" : "翻译"}
          </button>
        </div>
      </form>

      <EmailOutput state={state} onEdit={edit} onStop={stop} placeholder="译文将显示在这里。" />
    </div>
  );
}
