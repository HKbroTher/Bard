import { useEffect, useState } from "react";
import { LANGS, TONE_IDS, type Formality, type ProviderConfig, type ProviderKind, type Theme, type UiLang } from "@shared/types";
import { bard } from "../bard";
import { Modal } from "../components/Modal";
import { ProviderAvatar } from "../components/ProviderAvatar";
import { ProviderForm, ProviderGrid } from "../components/ProviderForm";
import { Segmented } from "../components/Segmented";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { useApp } from "../state";

type Editing = { mode: "pick" } | { mode: "new"; kind: ProviderKind } | { mode: "edit"; provider: ProviderConfig } | null;

export function SettingsView() {
  const { t } = useT();
  const toast = useToast();
  const { settings, providers, presets, updateSettings, refreshProviders } = useApp();
  const [editing, setEditing] = useState<Editing>(null);
  const [profile, setProfile] = useState({ senderName: settings.senderName, senderCompany: settings.senderCompany });
  const [version, setVersion] = useState("");

  useEffect(() => {
    bard.app.version().then(setVersion);
  }, []);

  async function remove(p: ProviderConfig) {
    if (!confirm(t("settings.confirmRemove", { name: p.name }))) return;
    await bard.providers.remove(p.id);
    refreshProviders();
  }

  const defaults = settings.defaults;
  const setDefault = <K extends keyof typeof defaults>(key: K, value: (typeof defaults)[K]) =>
    updateSettings({ defaults: { ...defaults, [key]: value } });

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">{t("settings.title")}</h1>

        <section className="settings-section">
          <div className="section-head">
            <div>
              <h2>{t("settings.providers")}</h2>
              <p>{t("settings.providersSub")}</p>
            </div>
            <button type="button" className="btn primary" onClick={() => setEditing({ mode: "pick" })}>
              {t("settings.add")}
            </button>
          </div>
          <div className="provider-list">
            {providers.map((p) => {
              const active = p.id === settings.activeProviderId;
              return (
                <div key={p.id} className={`provider-row ${active ? "active" : ""}`}>
                  <ProviderAvatar kind={p.kind} presets={presets} size={34} />
                  <div className="provider-row-text">
                    <b>
                      {p.name}
                      {active && <span className="badge">{t("settings.active")}</span>}
                    </b>
                    <small>{p.model}</small>
                  </div>
                  <div className="row-actions">
                    {!active && (
                      <button type="button" className="btn ghost small" onClick={() => updateSettings({ activeProviderId: p.id })}>
                        {t("settings.use")}
                      </button>
                    )}
                    <button type="button" className="btn ghost small" onClick={() => setEditing({ mode: "edit", provider: p })}>
                      {t("settings.edit")}
                    </button>
                    <button type="button" className="btn ghost small danger" onClick={() => remove(p)}>
                      {t("settings.remove")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <h2>{t("settings.profile")}</h2>
          <div className="grid-2">
            <label className="field">
              <span>{t("profile.name")}</span>
              <input value={profile.senderName} placeholder={t("profile.namePh")} onChange={(e) => setProfile({ ...profile, senderName: e.target.value })} />
            </label>
            <label className="field">
              <span>{t("profile.company")}</span>
              <input value={profile.senderCompany} placeholder={t("profile.companyPh")} onChange={(e) => setProfile({ ...profile, senderCompany: e.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn primary"
              disabled={profile.senderName === settings.senderName && profile.senderCompany === settings.senderCompany}
              onClick={async () => {
                await updateSettings(profile);
                toast(t("settings.saved"));
              }}
            >
              {t("provider.save")}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2>{t("settings.defaults")}</h2>
          <div className="settings-rows">
            <SettingRow label={t("composer.lang")}>
              <Segmented value={defaults.lang} options={LANGS.map((l) => ({ id: l, label: t(`lang.${l}`) }))} onChange={(v) => setDefault("lang", v)} />
            </SettingRow>
            <SettingRow label={t("composer.tone")}>
              <Segmented value={defaults.tone} options={TONE_IDS.map((id) => ({ id, label: t(`tone.${id}`) }))} onChange={(v) => setDefault("tone", v)} />
            </SettingRow>
            <SettingRow label={t("composer.formality")}>
              <Segmented
                value={defaults.formality}
                options={([1, 2, 3] as Formality[]).map((f) => ({ id: f, label: t(`formality.${f}`) }))}
                onChange={(v) => setDefault("formality", v)}
              />
            </SettingRow>
          </div>
        </section>

        <section className="settings-section">
          <h2>{t("settings.appearance")}</h2>
          <div className="settings-rows">
            <SettingRow label={t("settings.theme")}>
              <Segmented<Theme>
                value={settings.theme}
                options={[
                  { id: "system", label: t("settings.themeSystem") },
                  { id: "light", label: t("settings.themeLight") },
                  { id: "dark", label: t("settings.themeDark") },
                ]}
                onChange={(v) => updateSettings({ theme: v })}
              />
            </SettingRow>
            <SettingRow label={t("settings.uiLang")}>
              <Segmented<UiLang>
                value={settings.uiLang}
                options={[
                  { id: "zh", label: "中文" },
                  { id: "en", label: "English" },
                ]}
                onChange={(v) => updateSettings({ uiLang: v })}
              />
            </SettingRow>
          </div>
        </section>

        <section className="settings-section about">
          <h2>{t("settings.about")}</h2>
          <p>{t("settings.aboutText", { v: version })}</p>
        </section>
      </div>

      {editing && (
        <Modal
          title={editing.mode === "edit" ? t("settings.editTitle", { name: editing.provider.name }) : t("settings.addTitle")}
          onClose={() => setEditing(null)}
        >
          {editing.mode === "pick" && <ProviderGrid presets={presets} onPick={(kind) => setEditing({ mode: "new", kind })} />}
          {editing.mode !== "pick" && (
            <ProviderForm
              presets={presets}
              kind={editing.mode === "edit" ? editing.provider.kind : editing.kind}
              existing={editing.mode === "edit" ? editing.provider : undefined}
              submitLabel={t("provider.save")}
              onBack={editing.mode === "new" ? () => setEditing({ mode: "pick" }) : undefined}
              onSaved={() => {
                setEditing(null);
                refreshProviders();
                toast(t("settings.saved"));
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      {children}
    </div>
  );
}
