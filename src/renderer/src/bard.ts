import type { BardApi } from "@shared/api";

declare global {
  interface Window {
    bard: BardApi;
  }
}

export const bard = window.bard;
