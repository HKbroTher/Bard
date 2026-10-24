import type { ProviderKind, ProviderPreset } from "../../shared/types";

export const PRESETS: ProviderPreset[] = [
  {
    kind: "anthropic",
    name: "Claude",
    baseUrl: "",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
    defaultModel: "claude-opus-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyRequired: true,
    color: "#C96442",
  },
  {
    kind: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: [],
    defaultModel: "",
    keyUrl: "https://platform.openai.com/api-keys",
    keyRequired: true,
    color: "#1A1A1A",
  },
  {
    kind: "gemini",
    name: "Gemini",
    baseUrl: "",
    models: [],
    defaultModel: "",
    keyUrl: "https://aistudio.google.com/apikey",
    keyRequired: true,
    color: "#3B6FE0",
  },
  {
    kind: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyRequired: true,
    color: "#4D6BFE",
  },
  {
    kind: "qwen",
    name: "通义千问 Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    defaultModel: "qwen-plus",
    keyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    keyRequired: true,
    color: "#615CED",
  },
  {
    kind: "kimi",
    name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [],
    defaultModel: "",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    keyRequired: true,
    color: "#16191E",
  },
  {
    kind: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-flash"],
    defaultModel: "glm-4-plus",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    keyRequired: true,
    color: "#2D5BFF",
  },
  {
    kind: "custom",
    name: "Custom",
    baseUrl: "http://localhost:11434/v1",
    models: [],
    defaultModel: "",
    keyUrl: "",
    keyRequired: false,
    color: "#5E6B63",
  },
];

/** Offline provider for development and automated tests (BARD_MOCK=1). */
export const MOCK_PRESET: ProviderPreset = {
  kind: "mock",
  name: "Demo",
  baseUrl: "",
  models: ["demo"],
  defaultModel: "demo",
  keyUrl: "",
  keyRequired: false,
  color: "#0B6E4F",
};

export function presetFor(kind: ProviderKind): ProviderPreset {
  return [...PRESETS, MOCK_PRESET].find((p) => p.kind === kind) ?? PRESETS[PRESETS.length - 1];
}
