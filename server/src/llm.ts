import Anthropic from "@anthropic-ai/sdk";

export interface Prompt {
  system: string;
  user: string;
}

export interface LlmClient {
  readonly mock: boolean;
  readonly model: string;
  /** Stream the completion, calling onDelta for each text chunk; resolves with the full text. */
  stream(prompt: Prompt, onDelta: (text: string) => void, signal?: AbortSignal): Promise<string>;
}

export class RefusalError extends Error {}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class AnthropicClient implements LlmClient {
  readonly mock = false;
  private client = new Anthropic();

  constructor(
    readonly model: string,
    private effort: Effort,
  ) {}

  async stream(prompt: Prompt, onDelta: (text: string) => void, signal?: AbortSignal): Promise<string> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 64000,
        output_config: { effort: this.effort },
        // Let the API re-run a safety-classifier refusal on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal },
    );
    stream.on("text", (text) => onDelta(text));
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new RefusalError("模型拒绝了此请求，请调整内容后重试。");
    }
    return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
}

/**
 * Offline stand-in used when no API key is configured, so the UI can be
 * tried end to end. It echoes the request and honours glossary terms.
 */
export class MockClient implements LlmClient {
  readonly mock = true;
  readonly model = "mock";

  async stream(prompt: Prompt, onDelta: (text: string) => void, signal?: AbortSignal): Promise<string> {
    const lang = /into (\w+)|in (\w+)[^\n]* only/.exec(prompt.system);
    const target = (lang?.[1] ?? lang?.[2] ?? "English").toLowerCase();
    const terms = [...prompt.system.matchAll(/→ use "([^"]+)"/g)].map((m) => m[1]);
    const section = /<(key_points|source_email)>\n?([\s\S]*?)\n?<\/\1>/.exec(prompt.user);
    const content = (section?.[2] ?? prompt.user).trim();

    const templates: Record<string, { subject: string; greet: string; intro: string; terms: string; close: string }> = {
      simplified: {
        subject: "【示例】商务邮件草稿",
        greet: "尊敬的[收件人]：\n\n您好！",
        intro: "这是离线模拟模式生成的示例邮件。配置 ANTHROPIC_API_KEY 后将由大模型生成真实内容。以下是您提供的内容：",
        terms: "术语表词条：",
        close: "此致\n敬礼\n\n[发件人]",
      },
      japanese: {
        subject: "【サンプル】ビジネスメール下書き",
        greet: "[宛先]様\n\nいつもお世話になっております。",
        intro: "これはオフラインのモックモードで生成されたサンプルです。ANTHROPIC_API_KEY を設定すると実際の内容が生成されます。入力内容：",
        terms: "用語集：",
        close: "何卒よろしくお願い申し上げます。\n\n[差出人]",
      },
      english: {
        subject: "[Sample] Business email draft",
        greet: "Dear [Recipient],",
        intro: "This sample was produced in offline mock mode. Set ANTHROPIC_API_KEY to generate real content. Your input:",
        terms: "Glossary terms:",
        close: "Best regards,\n[Sender]",
      },
    };
    const t = templates[target] ?? templates.english;
    const text = [
      `SUBJECT: ${t.subject}`,
      "---",
      t.greet,
      "",
      t.intro,
      "",
      content,
      ...(terms.length ? ["", `${t.terms} ${terms.join("、")}`] : []),
      "",
      t.close,
    ].join("\n");

    let out = "";
    for (const chunk of text.match(/[\s\S]{1,12}/g) ?? []) {
      if (signal?.aborted) throw new Error("aborted");
      await new Promise((r) => setTimeout(r, 15));
      out += chunk;
      onDelta(chunk);
    }
    return out;
  }
}

export function createLlmClient(): LlmClient {
  const forced = process.env.LLM_MOCK;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const useMock = forced === "1" || (forced !== "0" && !hasKey);
  if (useMock) return new MockClient();
  const effort = (process.env.LLM_EFFORT || "medium") as Effort;
  return new AnthropicClient(process.env.LLM_MODEL || "claude-opus-5-5", effort);
}
