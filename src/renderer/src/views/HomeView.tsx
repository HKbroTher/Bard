import { useState } from "react";
import { SCENARIO_IDS, type EmailOptions, type ScenarioId } from "@shared/types";
import { Composer } from "../components/Composer";
import { Icon, type IconName } from "../components/Icon";
import { LogoMark } from "../components/Logo";
import { EXAMPLES, useT } from "../i18n";
import { useApp } from "../state";

const SCENARIO_ICONS: Record<ScenarioId, IconName> = {
  cold_outreach: "sparkle",
  follow_up: "refresh",
  inquiry: "search",
  quotation_reply: "mail",
  meeting_request: "user",
  thank_you: "check",
  apology: "info",
  translate: "languages",
  custom: "pencil",
};

export function HomeView() {
  const { t, lang } = useT();
  const { settings, startConversation, updateSettings } = useApp();
  const [options, setOptions] = useState<EmailOptions>(settings.defaults);
  const [text, setText] = useState("");

  const hour = new Date().getHours();
  const greeting = hour < 11 ? t("home.morning") : hour < 18 ? t("home.afternoon") : t("home.evening");
  const name = settings.senderName.trim();

  function changeOptions(next: EmailOptions) {
    setOptions(next);
    // Remember the last choices as the defaults for the next new email.
    updateSettings({ defaults: next });
  }

  function submit() {
    if (!text.trim()) return;
    startConversation(options, text);
    setText("");
  }

  const example = EXAMPLES[lang][options.scenario];

  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="greeting">
          <LogoMark size={34} />
          <span>
            {greeting}
            {name && (lang === "zh" ? `，${name}` : `, ${name}`)}
          </span>
        </h1>
        <p className="greeting-sub">{t("home.sub")}</p>

        <Composer
          text={text}
          onText={setText}
          options={options}
          onOptions={changeOptions}
          onSubmit={submit}
          placeholder={options.scenario === "translate" ? t("placeholder.translate") : t("placeholder.draft")}
          placement="bottom"
          autoFocus
        />

        <div className="scenario-grid">
          {SCENARIO_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`scenario-card ${options.scenario === id ? "active" : ""}`}
              onClick={() => changeOptions({ ...options, scenario: id })}
            >
              <Icon name={SCENARIO_ICONS[id]} size={16} />
              <span className="scenario-text">
                <b>{t(`scenario.${id}`)}</b>
                <small>{t(`scenario.${id}.desc`)}</small>
              </span>
            </button>
          ))}
        </div>

        {example && !text && (
          <button type="button" className="example-link" onClick={() => setText(example)}>
            <Icon name="sparkle" size={14} />
            {t("home.example")} · {t(`scenario.${options.scenario}`)}
          </button>
        )}
      </div>
    </div>
  );
}
