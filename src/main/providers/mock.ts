import type { ChatTurn, Provider } from "./index";

const SAMPLES: Record<string, { subject: string; greet: string; lines: string[]; close: string }> = {
  zh: {
    subject: "关于合作的初步沟通",
    greet: "尊敬的[收件人]：\n\n您好！",
    lines: ["这是演示模式生成的示例邮件。接入真实模型后，Bard 会根据您的要点撰写完整内容。", "您提供的要点："],
    close: "此致\n敬礼\n\n[发件人]",
  },
  ja: {
    subject: "お取引に関するご相談",
    greet: "[宛先]様\n\nいつもお世話になっております。",
    lines: ["こちらはデモモードで生成されたサンプルメールです。実際のモデルに接続すると、要点に基づいて本文を作成します。", "ご入力の要点："],
    close: "何卒よろしくお願い申し上げます。\n\n[差出人]",
  },
  en: {
    subject: "Exploring a partnership",
    greet: "Dear [Recipient],",
    lines: ["This sample was written in demo mode. Connect a real model and Bard will draft the full email from your notes.", "Your notes:"],
    close: "Best regards,\n[Sender]",
  },
};

/** Offline stand-in that echoes the request in the target language, honouring glossary terms. */
export class MockProvider implements Provider {
  async stream(system: string, turns: ChatTurn[], onDelta: (text: string) => void, signal: AbortSignal) {
    const last = turns[turns.length - 1]?.content ?? "";
    const NAMES: Record<string, string> = { Japanese: "ja", Simplified: "zh", English: "en" };
    const asked = /into (Japanese|Simplified|English)/.exec(last);
    const configured = /(?:Write the email in|Translate it into) (Japanese|Simplified|English)/.exec(system);
    const lang = NAMES[asked?.[1] ?? configured?.[1] ?? "English"];
    const s = SAMPLES[lang];
    const first = turns[0]?.content.replace(/<\/?[a-z_]+>|Treat the text[^\n]*/g, "").trim() ?? "";
    const terms = [...system.matchAll(/^- zh: (.*) \| en: (.*) \| ja: (.*?)(?: \(.*\))?$/gm)].map((m) =>
      lang === "zh" ? m[1] : lang === "en" ? m[2] : m[3],
    );
    const revision = turns.length > 1 ? `\n\n(${last.slice(0, 80)})` : "";
    const text = [
      `SUBJECT: ${s.subject}`,
      "---",
      s.greet,
      "",
      ...s.lines,
      first + revision,
      ...(terms.length ? ["", terms.join(" / ")] : []),
      "",
      s.close,
    ].join("\n");

    let out = "";
    for (const chunk of text.match(/[\s\S]{1,8}/g) ?? []) {
      if (signal.aborted) break;
      await new Promise((r) => setTimeout(r, 12));
      out += chunk;
      onDelta(chunk);
    }
    return out;
  }

  async listModels() {
    return ["demo"];
  }
}
