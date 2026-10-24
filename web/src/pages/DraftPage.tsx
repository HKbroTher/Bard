import { useEffect, useState, type FormEvent } from "react";
import type { DraftRequest, Meta } from "../api";
import { EmailOutput } from "../components/EmailOutput";
import { Segmented } from "../components/Segmented";
import { load, save } from "../storage";
import { useEmailStream } from "../useEmailStream";

const EXAMPLES: Partial<Record<DraftRequest["scenario"], string>> = {
  cold_outreach: "我们是深圳的物联网硬件厂商，主打产品是智能网关，支持多协议接入，已出口 30 多个国家。希望约 15 分钟线上会议介绍产品，可提供免费样品。",
  follow_up: "上周二发送了智能网关的报价单，还没有回复。想确认是否收到，并告知本月下单可享受 5% 折扣。",
  inquiry: "需要采购 500 台工业级智能网关，要求支持 Modbus 和 MQTT，需 CE 认证，6 月底前交货到汉堡港，请报 FOB 价、MOQ、交货期和付款方式，下周五前回复。",
  quotation_reply: "感谢询价。智能网关 GW-200 单价 USD 85，500 台以上 USD 79，FOB 深圳，交货期 25 天，T/T 30% 预付，报价有效期 30 天。",
  meeting_request: "希望下周与对方采购团队开一个 30 分钟的线上会议，讨论年度框架协议。可选时间：周二或周三下午 2-4 点（北京时间）。",
  thank_you: "感谢对方昨天来工厂参观，确认了样品测试计划，下周寄出 3 台样机。",
  apology: "因芯片供应紧张，订单 PO-2318 的交货将延迟 10 天。已安排加急生产，并承担空运差价。",
};

export function DraftPage({ meta, onTranslate }: { meta: Meta; onTranslate: (text: string) => void }) {
  const [form, setForm] = useState<DraftRequest>(() =>
    load<DraftRequest>("draft", {
      scenario: "cold_outreach",
      lang: "en",
      tone: "polite",
      formality: 2,
      senderName: "",
      senderCompany: "",
      recipientName: "",
      recipientCompany: "",
      keyPoints: "",
      previousEmail: "",
      useGlossary: true,
    }),
  );
  const { state, run, stop, edit } = useEmailStream();
  const set = <K extends keyof DraftRequest>(key: K, value: DraftRequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    // Remember options and the sender profile, but not per-email content.
    const { keyPoints: _k, previousEmail: _p, recipientName: _r, recipientCompany: _c, ...keep } = form;
    save("draft", keep);
  }, [form]);

  function submit(e: FormEvent) {
    e.preventDefault();
    run("/api/draft", form);
  }

  const showPrevious = form.scenario === "follow_up" || form.scenario === "quotation_reply" || form.scenario === "apology" || Boolean(form.previousEmail);

  return (
    <div className="workspace">
      <form className="panel" onSubmit={submit}>
        <h2>邮件场景</h2>
        <div className="scenarios">
          {meta.scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`scenario ${form.scenario === s.id ? "active" : ""}`}
              onClick={() => set("scenario", s.id)}
            >
              <b>{s.label}</b>
              <small>{s.description}</small>
            </button>
          ))}
        </div>

        <div className="row">
          <div className="field">
            <span>邮件语言</span>
            <Segmented name="邮件语言" value={form.lang} options={meta.languages} onChange={(v) => set("lang", v)} />
          </div>
          <div className="field">
            <span>正式程度</span>
            <Segmented name="正式程度" value={form.formality} options={meta.formality} onChange={(v) => set("formality", v)} />
          </div>
        </div>

        <div className="field">
          <span>语气</span>
          <Segmented name="语气" value={form.tone} options={meta.tones} onChange={(v) => set("tone", v)} />
        </div>

        <div className="grid-2">
          <label className="field">
            <span>发件人</span>
            <input value={form.senderName} placeholder="张伟" onChange={(e) => set("senderName", e.target.value)} />
          </label>
          <label className="field">
            <span>发件公司</span>
            <input value={form.senderCompany} placeholder="深圳某某科技有限公司" onChange={(e) => set("senderCompany", e.target.value)} />
          </label>
          <label className="field">
            <span>收件人</span>
            <input value={form.recipientName} placeholder="John Smith / 田中様" onChange={(e) => set("recipientName", e.target.value)} />
          </label>
          <label className="field">
            <span>收件公司</span>
            <input value={form.recipientCompany} onChange={(e) => set("recipientCompany", e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>
            邮件要点 <small>（任意语言均可）</small>
            {EXAMPLES[form.scenario] && (
              <button type="button" className="link" onClick={() => set("keyPoints", EXAMPLES[form.scenario]!)}>
                填入示例
              </button>
            )}
          </span>
          <textarea
            rows={6}
            value={form.keyPoints}
            placeholder="写下邮件需要包含的信息：目的、产品、价格、时间、希望对方做什么……"
            onChange={(e) => set("keyPoints", e.target.value)}
          />
        </label>

        {showPrevious && (
          <label className="field">
            <span>
              之前的邮件 <small>（可选，用于跟进或回复）</small>
            </span>
            <textarea rows={4} value={form.previousEmail} onChange={(e) => set("previousEmail", e.target.value)} />
          </label>
        )}

        <div className="submit-row">
          <label className="check">
            <input type="checkbox" checked={form.useGlossary} onChange={(e) => set("useGlossary", e.target.checked)} />
            应用术语表
          </label>
          <button type="submit" className="primary" disabled={!form.keyPoints.trim() || state.status === "streaming"}>
            {state.status === "streaming" ? "生成中…" : "生成邮件"}
          </button>
        </div>
      </form>

      <EmailOutput
        state={state}
        onEdit={edit}
        onStop={stop}
        onTranslate={onTranslate}
        placeholder="选择场景、填写要点后点击「生成邮件」。"
      />
    </div>
  );
}
