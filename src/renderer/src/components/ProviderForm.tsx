import { useMemo, useState } from "react";
import type { ProviderConfig, ProviderKind, ProviderPreset, TestResult } from "@shared/types";
import { bard } from "../bard";
import { errorText, useT } from "../i18n";
import { Icon } from "./Icon";
import { ProviderAvatar } from "./ProviderAvatar";

// Models that cannot write text (embeddings, speech, images…) are hidden from the picker.
const NON_CHAT = /embed|whisper|tts|dall-e|davinci|babbage|moderation|audio|realtime|image|transcri|search|rerank|aqa|imagen|veo|lyria|computer-use|sora/i;

const OPENAI_COMPATIBLE: ProviderKind[] = ["openai", "deepseek", "qwen", "kimi", "zhipu", "custom"];

export function ProviderGrid({ presets, onPick }: { presets: ProviderPreset[]; onPick(kind: ProviderKind): void }) {
  const { t } = useT();
  return (
    <div className="provider-grid">
      {presets.map((p) => (
        <button key={p.kind} type="button" className="provider-card" onClick={() => onPick(p.kind)}>
          <ProviderAvatar kind={p.kind} presets={presets} size={36} />
          <span className="provider-card-text">
            <b>{p.kind === "custom" ? t("provider.custom") : p.name}</b>
            <small>{p.kind === "custom" ? t("provider.customDesc") : p.defaultModel || p.baseUrl.replace(/^https?:\/\//, "") || "API"}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

interface Props {
  presets: ProviderPreset[];
  kind: ProviderKind;
  existing?: ProviderConfig;
  /** Onboarding requires a successful test before continuing. */
  requireTest?: boolean;
  submitLabel: string;
  onBack?(): void;
  onSaved(config: ProviderConfig): void;
}

export function ProviderForm({ presets, kind, existing, requireTest, submitLabel, onBack, onSaved }: Props) {
  const { t } = useT();
  const preset = presets.find((p) => p.kind === kind)!;
  const [name, setName] = useState(existing?.name ?? (kind === "custom" ? t("provider.custom") : preset.name));
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? preset.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(existing?.model ?? preset.defaultModel);
  const [test, setTest] = useState<{ state: "idle" | "testing" | "done"; result?: TestResult }>({ state: "idle" });
  const [saving, setSaving] = useState(false);

  const compatible = OPENAI_COMPATIBLE.includes(kind);
  const hasKey = Boolean(apiKey.trim() || existing?.hasKey);
  const keyOk = hasKey || !preset.keyRequired;
  const tested = test.state === "done" && test.result?.ok;

  const models = useMemo(() => {
    const live = (test.result?.models ?? []).filter((m) => !NON_CHAT.test(m));
    const list = live.length ? live : preset.models;
    return [...new Set(list)];
  }, [test.result, preset.models]);

  const input = () => ({ kind, name: name.trim() || preset.name, baseUrl, model, apiKey: apiKey.trim() || undefined });

  async function runTest() {
    setTest({ state: "testing" });
    const result = await bard.providers.test(input(), existing?.id);
    setTest({ state: "done", result });
    if (result.ok && !model) {
      const first = result.models.filter((m) => !NON_CHAT.test(m));
      const suggested = preset.models.find((m) => first.includes(m)) ?? first[0];
      if (suggested) setModel(suggested);
    }
  }

  async function save() {
    setSaving(true);
    try {
      onSaved(await bard.providers.save(input(), existing?.id));
    } finally {
      setSaving(false);
    }
  }

  const invalidate = () => test.state !== "idle" && setTest({ state: "idle" });
  const canSave = Boolean(model.trim()) && keyOk && (!requireTest || tested) && !saving;

  return (
    <div className="provider-form">
      <div className="provider-form-head">
        <ProviderAvatar kind={kind} presets={presets} size={40} />
        <div>
          <b>{kind === "custom" ? t("provider.custom") : preset.name}</b>
          {preset.keyUrl && (
            <button type="button" className="link-btn" onClick={() => bard.app.openExternal(preset.keyUrl)}>
              {t("provider.getKey")}
              <Icon name="external" size={13} />
            </button>
          )}
        </div>
      </div>

      {kind === "custom" && (
        <label className="field">
          <span>{t("provider.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}

      {compatible && (
        <label className="field">
          <span>{t("provider.baseUrl")}</span>
          <input
            value={baseUrl}
            spellCheck={false}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              invalidate();
            }}
          />
        </label>
      )}

      <label className="field">
        <span>{preset.keyRequired ? t("provider.apiKey") : t("provider.keyOptional")}</span>
        <div className="key-input">
          <Icon name="key" size={16} />
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            spellCheck={false}
            autoFocus
            placeholder={existing?.hasKey ? t("provider.keySaved") : "sk-…"}
            onChange={(e) => {
              setApiKey(e.target.value);
              invalidate();
            }}
          />
          <button type="button" className="icon-btn" onClick={() => setShowKey((s) => !s)}>
            <Icon name={showKey ? "eyeOff" : "eye"} size={16} />
          </button>
        </div>
        <small className="field-hint">
          <Icon name="info" size={13} /> {t("provider.keyStored")}
        </small>
      </label>

      <div className="test-row">
        <button type="button" className="btn ghost" disabled={!keyOk || test.state === "testing" || (kind === "custom" && !baseUrl)} onClick={runTest}>
          {test.state === "testing" ? <span className="spinner" /> : <Icon name="refresh" size={15} />}
          {test.state === "testing" ? t("provider.testing") : t("provider.test")}
        </button>
        {test.state === "done" &&
          (test.result?.ok ? (
            <span className="test-ok">
              <Icon name="check" size={15} />
              {t("provider.testOk", { n: models.length || test.result.models.length })}
            </span>
          ) : (
            <span className="test-fail">{t("provider.testFail", { msg: errorText(t, test.result?.error ?? "") })}</span>
          ))}
      </div>

      <label className="field">
        <span>{t("provider.model")}</span>
        <input value={model} spellCheck={false} placeholder={t("provider.modelPlaceholder")} onChange={(e) => setModel(e.target.value)} />
        {models.length > 0 ? (
          <div className="model-chips">
            {models.slice(0, 60).map((m) => (
              <button key={m} type="button" className={`chip ${m === model ? "selected" : ""}`} onClick={() => setModel(m)}>
                {m}
              </button>
            ))}
          </div>
        ) : (
          <small className="field-hint">{t("provider.modelHint")}</small>
        )}
      </label>

      <div className="form-actions">
        {onBack && (
          <button type="button" className="btn ghost" onClick={onBack}>
            {t("provider.back")}
          </button>
        )}
        <button type="button" className="btn primary" disabled={!canSave} title={!model.trim() ? t("provider.needModel") : undefined} onClick={save}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
