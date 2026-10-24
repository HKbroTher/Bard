import { useEffect, useMemo, useState } from "react";
import type { ProviderConfig, ProviderPreset, Settings, UiLang } from "@shared/types";
import { bard } from "./bard";
import { Icon } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider } from "./components/Toast";
import { I18nContext, makeT, useT } from "./i18n";
import { AppProvider, useApp } from "./state";
import { ConversationView } from "./views/ConversationView";
import { GlossaryView } from "./views/GlossaryView";
import { HomeView } from "./views/HomeView";
import { Onboarding } from "./views/Onboarding";
import { SettingsView } from "./views/SettingsView";

interface Boot {
  settings: Settings;
  providers: ProviderConfig[];
  presets: ProviderPreset[];
}

/** Apply the theme to the page and to the native title bar. */
function useTheme(theme: Settings["theme"]) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      const css = getComputedStyle(document.documentElement);
      bard.app.setTheme(theme, { background: css.getPropertyValue("--bg").trim(), symbol: css.getPropertyValue("--text").trim() });
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  async function load() {
    const [settings, providers, presets] = await Promise.all([bard.settings.get(), bard.providers.list(), bard.providers.presets()]);
    setBoot({ settings, providers, presets });
    setOnboarding(providers.length === 0);
  }

  useEffect(() => {
    load();
  }, []);

  if (!boot) return null;

  if (onboarding) {
    return (
      <Shell lang={boot.settings.uiLang} theme={boot.settings.theme}>
        <Onboarding
          presets={boot.presets}
          settings={boot.settings}
          onLang={async (uiLang: UiLang) => setBoot({ ...boot, settings: await bard.settings.set({ uiLang }) })}
          onDone={load}
        />
      </Shell>
    );
  }

  return (
    <AppProvider initial={boot}>
      <Connected />
    </AppProvider>
  );
}

function Connected() {
  const { settings } = useApp();
  return (
    <Shell lang={settings.uiLang} theme={settings.theme}>
      <Main />
    </Shell>
  );
}

function Shell({ lang, theme, children }: { lang: UiLang; theme: Settings["theme"]; children: React.ReactNode }) {
  useTheme(theme);
  const i18n = useMemo(() => ({ t: makeT(lang), lang }), [lang]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return (
    <I18nContext.Provider value={i18n}>
      <ToastProvider>{children}</ToastProvider>
    </I18nContext.Provider>
  );
}

function Main() {
  const { t } = useT();
  const { view, navigate, conversations } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const title = view.type === "conversation" ? conversations.find((c) => c.id === view.id)?.title || t("nav.untitled") : "";

  // ⌘/Ctrl+N starts a new email, ⌘/Ctrl+\ toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "n") (e.preventDefault(), navigate({ type: "home" }));
      if (e.key === "\\") (e.preventDefault(), setCollapsed((c) => !c));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className={`layout platform-${bard.platform} ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(true)} />
      <main className="main">
        <div className="topbar drag">
          {collapsed && (
            <div className="topbar-left no-drag">
              <button type="button" className="icon-btn" title={t("nav.expand")} onClick={() => setCollapsed(false)}>
                <Icon name="sidebar" size={18} />
              </button>
              <button type="button" className="icon-btn" title={t("nav.new")} onClick={() => navigate({ type: "home" })}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          )}
          <span className="topbar-title">{title}</span>
        </div>
        <div className="view">
          {view.type === "home" && <HomeView />}
          {view.type === "conversation" && <ConversationView id={view.id} />}
          {view.type === "glossary" && <GlossaryView />}
          {view.type === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}
