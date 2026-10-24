import { app, BrowserWindow, nativeTheme, safeStorage, shell } from "electron";
import { join } from "node:path";
import { ChatService } from "./chat";
import { Store } from "./db";
import { registerIpc } from "./ipc";
import { createProvider } from "./providers";
import { presetFor } from "./providers/presets";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  const background = dark ? "#1F1E1B" : "#FAF8F3";
  const isMac = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: "Bard",
    backgroundColor: background,
    titleBarStyle: "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 16 } }
      : { titleBarOverlay: { color: background, symbolColor: dark ? "#ECEAE4" : "#2B2A26", height: 44 } }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => (mainWindow = null));

  // Links open in the default browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const store = new Store(process.env.BARD_DB || join(app.getPath("userData"), "bard.db"), {
    // API keys are encrypted with the OS keychain (Keychain / DPAPI / libsecret).
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(Buffer.from(data)),
  });

  // First launch: follow the system language.
  const settings = store.getSettings();
  if (!store.listProviders().length && !settings.senderName) {
    store.setSettings({ uiLang: app.getLocale().toLowerCase().startsWith("zh") ? "zh" : "en" });
  }
  nativeTheme.themeSource = store.getSettings().theme;

  const chat = new ChatService(
    store,
    (event) => mainWindow?.webContents.send("chat:event", event),
    () => {
      const id = store.getSettings().activeProviderId;
      const config = id ? store.getProvider(id) : undefined;
      if (!config) return null;
      return {
        provider: createProvider({ ...config, apiKey: store.getProviderKey(config.id) }),
        label: `${config.name || presetFor(config.kind).name} · ${config.model}`,
      };
    },
  );

  registerIpc(store, chat, () => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
