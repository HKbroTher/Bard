/** Per-browser conveniences (sender profile, last options). Failures are ignored. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`mail-assistant:${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`mail-assistant:${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode etc.)
  }
}
