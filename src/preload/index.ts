import { contextBridge, ipcRenderer } from "electron";
import type { BardApi } from "../shared/api";
import type { ChatEvent } from "../shared/types";

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: BardApi = {
  platform: process.platform,
  settings: { get: invoke("settings:get"), set: invoke("settings:set") },
  providers: {
    presets: invoke("providers:presets"),
    list: invoke("providers:list"),
    save: invoke("providers:save"),
    remove: invoke("providers:remove"),
    test: invoke("providers:test"),
  },
  conversations: {
    list: invoke("conversations:list"),
    get: invoke("conversations:get"),
    create: invoke("conversations:create"),
    update: invoke("conversations:update"),
    remove: invoke("conversations:remove"),
  },
  chat: {
    send: invoke("chat:send"),
    regenerate: invoke("chat:regenerate"),
    stop: invoke("chat:stop"),
    editMessage: invoke("chat:editMessage"),
    onEvent(listener) {
      const handler = (_: unknown, event: ChatEvent) => listener(event);
      ipcRenderer.on("chat:event", handler);
      return () => ipcRenderer.removeListener("chat:event", handler);
    },
  },
  glossary: {
    list: invoke("glossary:list"),
    create: invoke("glossary:create"),
    update: invoke("glossary:update"),
    remove: invoke("glossary:remove"),
    importCsv: invoke("glossary:import"),
    exportCsv: invoke("glossary:export"),
  },
  app: {
    openMail: invoke("app:openMail"),
    openExternal: invoke("app:openExternal"),
    setTheme: invoke("app:setTheme"),
    version: invoke("app:version"),
  },
};

contextBridge.exposeInMainWorld("bard", api);
