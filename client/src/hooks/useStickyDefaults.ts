import { useState, useCallback } from "react";

export interface StickyDefault {
  enabled: boolean;
  value: string;
}

export type StickyDefaults = Record<string, StickyDefault>;

const STORAGE_KEY = "korrus-sticky-defaults";
const FIELDS = ["handle", "source", "angle", "product", "date", "initiative", "variation", "copySlug", "creativeType"] as const;

function loadDefaults(): StickyDefaults {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Default: date enabled with current month
  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const defaults: StickyDefaults = {};
  for (const f of FIELDS) {
    defaults[f] = { enabled: false, value: "" };
  }
  defaults.date = { enabled: true, value: currentMonth };
  return defaults;
}

export function useStickyDefaults() {
  const [defaults, setDefaults] = useState<StickyDefaults>(loadDefaults);

  const persist = useCallback((next: StickyDefaults) => {
    setDefaults(next);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const setDefault = useCallback((field: string, value: string) => {
    persist({ ...defaults, [field]: { enabled: defaults[field]?.enabled ?? true, value } });
  }, [defaults, persist]);

  const toggleDefault = useCallback((field: string, enabled: boolean) => {
    persist({ ...defaults, [field]: { ...defaults[field], enabled, value: defaults[field]?.value ?? "" } });
  }, [defaults, persist]);

  const getActiveDefaults = useCallback((): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const [key, def] of Object.entries(defaults)) {
      if (def.enabled && def.value.trim()) {
        result[key] = def.value;
      }
    }
    return result;
  }, [defaults]);

  const reset = useCallback(() => {
    const d = new Date();
    const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const fresh: StickyDefaults = {};
    for (const f of FIELDS) {
      fresh[f] = { enabled: false, value: "" };
    }
    fresh.date = { enabled: true, value: currentMonth };
    persist(fresh);
  }, [persist]);

  return { defaults, setDefault, toggleDefault, getActiveDefaults, reset, fields: FIELDS };
}
