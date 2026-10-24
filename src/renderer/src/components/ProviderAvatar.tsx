import type { ProviderKind, ProviderPreset } from "@shared/types";

/** A monogram tile standing in for a provider (no third-party logos). */
export function ProviderAvatar({ kind, presets, size = 32 }: { kind: ProviderKind; presets: ProviderPreset[]; size?: number }) {
  const preset = presets.find((p) => p.kind === kind);
  const label = kind === "custom" ? "{}" : (preset?.name ?? kind).replace(/^[^A-Za-z]*/, "").slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className="provider-avatar"
      style={{ width: size, height: size, background: preset?.color ?? "#5E6B63", fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
