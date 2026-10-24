import { useState } from "react";
import type { ProviderKind, ProviderPreset, Settings, UiLang } from "@shared/types";
import { bard } from "../bard";
import { Icon } from "../components/Icon";
import { LogoMark } from "../components/Logo";
import { ProviderForm, ProviderGrid } from "../components/ProviderForm";
import { useT } from "../i18n";

interface Props {
  presets: ProviderPreset[];
  settings: Settings;
  onLang(lang: UiLang): void;
  onDone(): void;
}

type Step = { name: "welcome" } | { name: "choose" } | { name: "connect"; kind: ProviderKind } | { name: "profile" };

export function Onboarding({ presets, settings, onLang, onDone }: Props) {
  const { t, lang } = useT();
  const [step, setStep] = useState<Step>({ name: "welcome" });
  const [profile, setProfile] = useState({ senderName: settings.senderName, senderCompany: settings.senderCompany });
  const stepNumber = step.name === "choose" ? 1 : step.name === "connect" ? 2 : step.name === "profile" ? 3 : 0;

  async function finish() {
    await bard.settings.set(profile);
    onDone();
  }

  return (
    <div className={`onboarding platform-${bard.platform}`}>
      <div className="onboarding-bar drag">
        <div className="lang-switch no-drag">
          {(["zh", "en"] as UiLang[]).map((l) => (
            <button key={l} type="button" className={l === lang ? "active" : ""} onClick={() => onLang(l)}>
              {l === "zh" ? "中文" : "EN"}
            </button>
          ))}
        </div>
      </div>

      <div className="onboarding-body">
        {step.name === "welcome" && (
          <div className="welcome">
            <LogoMark size={72} />
            <h1>{t("onb.welcome")}</h1>
            <p className="lead">{t("onb.welcomeSub")}</p>
            <ul className="features">
              {(["onb.f1", "onb.f2", "onb.f3"] as const).map((k, i) => (
                <li key={k}>
                  <Icon name={(["mail", "wand", "book"] as const)[i]} size={18} />
                  {t(k)}
                </li>
              ))}
            </ul>
            <button type="button" className="btn primary large" onClick={() => setStep({ name: "choose" })}>
              {t("onb.start")}
            </button>
          </div>
        )}

        {stepNumber > 0 && (
          <div className="onboarding-card">
            <div className="steps">
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= stepNumber ? "on" : ""} />
              ))}
              <span>{t("onb.step", { n: stepNumber })}</span>
            </div>

            {step.name === "choose" && (
              <>
                <h2>{t("onb.chooseTitle")}</h2>
                <p className="sub">{t("onb.chooseSub")}</p>
                <ProviderGrid presets={presets} onPick={(kind) => setStep({ name: "connect", kind })} />
              </>
            )}

            {step.name === "connect" && (
              <>
                <h2>{t("onb.connectTitle", { name: presets.find((p) => p.kind === step.kind)?.name ?? "" })}</h2>
                <ProviderForm
                  presets={presets}
                  kind={step.kind}
                  requireTest
                  submitLabel={t("provider.continue")}
                  onBack={() => setStep({ name: "choose" })}
                  onSaved={() => setStep({ name: "profile" })}
                />
              </>
            )}

            {step.name === "profile" && (
              <>
                <h2>{t("onb.profileTitle")}</h2>
                <p className="sub">{t("onb.profileSub")}</p>
                <div className="profile-fields">
                  <label className="field">
                    <span>{t("profile.name")}</span>
                    <input autoFocus value={profile.senderName} placeholder={t("profile.namePh")} onChange={(e) => setProfile({ ...profile, senderName: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>{t("profile.company")}</span>
                    <input value={profile.senderCompany} placeholder={t("profile.companyPh")} onChange={(e) => setProfile({ ...profile, senderCompany: e.target.value })} />
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={finish}>
                    {t("onb.finish")}
                    <Icon name="arrowUp" size={16} style={{ transform: "rotate(90deg)" }} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
