import { useEffect, useLayoutEffect, useRef } from "react";
import { LANGS, SCENARIO_IDS, TONE_IDS, type EmailOptions, type Formality } from "@shared/types";
import { useT } from "../i18n";
import { useApp } from "../state";
import { Icon } from "./Icon";
import { MenuItem, Popover } from "./Popover";
import { ProviderAvatar } from "./ProviderAvatar";

interface Props {
  text: string;
  onText(text: string): void;
  options: EmailOptions;
  onOptions(options: EmailOptions): void;
  onSubmit(): void;
  onStop?(): void;
  streaming?: boolean;
  placeholder: string;
  /** Where menus open: below on the home screen, above when docked at the bottom. */
  placement: "top" | "bottom";
  /** The scenario can only be chosen before the first message. */
  lockScenario?: boolean;
  autoFocus?: boolean;
}

export function Composer({ text, onText, options, onOptions, onSubmit, onStop, streaming, placeholder, placement, lockScenario, autoFocus }: Props) {
  const { t } = useT();
  const { providers, presets, settings, updateSettings, navigate } = useApp();
  const ref = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof EmailOptions>(key: K, value: EmailOptions[K]) => onOptions({ ...options, [key]: value });
  const active = providers.find((p) => p.id === settings.activeProviderId);
  const canSend = text.trim().length > 0 && !streaming && Boolean(active);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, options.scenario]);

  const translate = options.scenario === "translate";

  return (
    <div className="composer">
      <textarea
        ref={ref}
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
      />
      <div className="composer-bar">
        <div className="composer-options">
          {!lockScenario && (
            <Popover
              placement={placement}
              trigger={() => (
                <span className="pill">
                  {t(`scenario.${options.scenario}`)}
                  <Icon name="chevronDown" size={14} />
                </span>
              )}
            >
              {(close) =>
                SCENARIO_IDS.map((id) => (
                  <MenuItem key={id} selected={id === options.scenario} hint={t(`scenario.${id}.desc`)} onClick={() => (set("scenario", id), close())}>
                    {t(`scenario.${id}`)}
                  </MenuItem>
                ))
              }
            </Popover>
          )}

          <Popover
            placement={placement}
            trigger={() => (
              <span className="pill">
                <Icon name="languages" size={15} />
                {translate && <span className="pill-label">{t("composer.langTarget")}</span>}
                {t(`lang.${options.lang}`)}
              </span>
            )}
          >
            {(close) =>
              LANGS.map((l) => (
                <MenuItem key={l} selected={l === options.lang} onClick={() => (set("lang", l), close())}>
                  {t(`lang.${l}`)}
                </MenuItem>
              ))
            }
          </Popover>

          <Popover
            placement={placement}
            trigger={() => (
              <span className="pill">
                <span className="pill-label">{t("composer.tone")}</span>
                {t(`tone.${options.tone}`)}
              </span>
            )}
          >
            {(close) =>
              TONE_IDS.map((id) => (
                <MenuItem key={id} selected={id === options.tone} onClick={() => (set("tone", id), close())}>
                  {t(`tone.${id}`)}
                </MenuItem>
              ))
            }
          </Popover>

          <Popover
            placement={placement}
            trigger={() => (
              <span className="pill">
                <FormalityDots level={options.formality} />
                {t(`formality.${options.formality}`)}
              </span>
            )}
          >
            {(close) =>
              ([1, 2, 3] as Formality[]).map((f) => (
                <MenuItem key={f} selected={f === options.formality} hint={t(`formality.${f}.desc`)} onClick={() => (set("formality", f), close())}>
                  <span className="formality-row">
                    <FormalityDots level={f} />
                    {t(`formality.${f}`)}
                  </span>
                </MenuItem>
              ))
            }
          </Popover>

          {translate && !lockScenario && (
            <button type="button" className="pill" onClick={() => set("localize", !options.localize)}>
              {options.localize ? t("composer.localize") : t("composer.faithful")}
            </button>
          )}

          <button
            type="button"
            className={`pill icon-pill ${options.useGlossary ? "on" : ""}`}
            title={options.useGlossary ? t("composer.glossaryOn") : t("composer.glossaryOff")}
            aria-pressed={options.useGlossary}
            onClick={() => set("useGlossary", !options.useGlossary)}
          >
            <Icon name="book" size={15} />
          </button>
        </div>

        <div className="composer-actions">
          <Popover
            placement={placement}
            align="end"
            className="model-popover"
            trigger={() => (
              <span className="model-pill">
                {active ? (
                  <>
                    <ProviderAvatar kind={active.kind} presets={presets} size={18} />
                    <span className="model-name">{active.model}</span>
                  </>
                ) : (
                  <span className="model-name warn">{t("composer.noModel")}</span>
                )}
                <Icon name="chevronDown" size={14} />
              </span>
            )}
          >
            {(close) => (
              <>
                {providers.map((p) => (
                  <MenuItem key={p.id} selected={p.id === settings.activeProviderId} hint={p.model} onClick={() => (updateSettings({ activeProviderId: p.id }), close())}>
                    <span className="formality-row">
                      <ProviderAvatar kind={p.kind} presets={presets} size={20} />
                      {p.name}
                    </span>
                  </MenuItem>
                ))}
                <div className="menu-sep" />
                <MenuItem onClick={() => (navigate({ type: "settings" }), close())}>{t("composer.manageModels")}</MenuItem>
              </>
            )}
          </Popover>

          {streaming ? (
            <button type="button" className="send-button stop" title={t("composer.stop")} onClick={onStop}>
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button type="button" className="send-button" title={t("composer.send")} disabled={!canSend} onClick={onSubmit}>
              <Icon name="arrowUp" size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormalityDots({ level }: { level: Formality }) {
  return (
    <span className="formality-dots" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? "on" : ""} />
      ))}
    </span>
  );
}

