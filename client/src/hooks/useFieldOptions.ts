import { trpc } from "../lib/trpc";
import { useMemo } from "react";

export function useFieldOptions() {
  const { data: options = [], ...rest } = trpc.fieldOptions.list.useQuery();

  const grouped = useMemo(() => {
    const map: Record<string, { value: string; label: string }[]> = {};
    for (const o of options) {
      if (!o.isActive) continue;
      if (!map[o.field]) map[o.field] = [];
      map[o.field].push({ value: o.value, label: o.label || o.value });
    }
    return map;
  }, [options]);

  return { options, grouped, ...rest };
}
