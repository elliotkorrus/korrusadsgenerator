import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { ChevronDown, Search, Loader2, X } from "lucide-react";

interface AdSetPickerProps {
  value: string; // current adSetId
  displayValue?: string; // current adSetName for display
  onSelect: (adSetId: string, adSetName: string) => void;
  disabled?: boolean;
  compact?: boolean; // table-cell mode: smaller sizing
}

export default function AdSetPicker({ value, displayValue, onSelect, disabled, compact }: AdSetPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackValue, setFallbackValue] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: adSets, isLoading, isError } = trpc.meta.getAdSets.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Fall back to text input if API fails or returns empty
  useEffect(() => {
    if (isError) setFallbackMode(true);
  }, [isError]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!adSets) return [];
    if (!search.trim()) return adSets;
    const q = search.toLowerCase();
    return adSets.filter(
      (s: any) =>
        s.name.toLowerCase().includes(q) ||
        s.id.includes(q) ||
        (s.campaignName && s.campaignName.toLowerCase().includes(q))
    );
  }, [adSets, search]);

  // Resolve display name
  const currentName = useMemo(() => {
    if (displayValue) return displayValue;
    if (!value || !adSets) return "";
    const match = adSets.find((s: any) => s.id === value);
    return match?.name || "";
  }, [value, displayValue, adSets]);

  const truncateId = (id: string) => {
    if (id.length <= 8) return id;
    return id.slice(0, 4) + "..." + id.slice(-4);
  };

  if (disabled) {
    return (
      <span className={`${compact ? "text-xs" : "text-sm"} font-mono`}>
        {currentName || value || <span style={{ color: "var(--text-muted)" }}>---</span>}
      </span>
    );
  }

  // Fallback text input when API is unavailable
  if (fallbackMode) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={fallbackValue}
          onChange={(e) => setFallbackValue(e.target.value)}
          onBlur={() => {
            if (fallbackValue !== value) onSelect(fallbackValue, "");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (fallbackValue !== value) onSelect(fallbackValue, "");
            }
          }}
          placeholder="Ad Set ID..."
          className={`rounded px-1.5 py-0.5 outline-none font-mono ${compact ? "text-xs w-28" : "text-sm w-40"}`}
          style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative" style={{ minWidth: compact ? "140px" : "180px" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 w-full rounded cursor-pointer text-left ${compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"}`}
        style={{
          background: open ? "var(--surface-0)" : "transparent",
          border: open ? "1px solid rgba(0,153,198,0.4)" : "1px solid transparent",
          color: "var(--text-primary)",
          transition: "background 0.1s, border 0.1s",
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {isLoading ? (
          <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        ) : (
          <>
            <span className="truncate flex-1" style={{ maxWidth: compact ? "110px" : "160px" }}>
              {currentName || (value ? truncateId(value) : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Select ad set...</span>)}
            </span>
            <ChevronDown size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-[100] mt-1 rounded-md shadow-2xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--surface-3)",
            width: "320px",
            maxHeight: "340px",
            left: 0,
          }}
        >
          {/* Search bar */}
          <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid var(--surface-3)" }}>
            <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ad sets..."
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="p-0.5 rounded hover:bg-white/5">
                <X size={11} style={{ color: "var(--text-muted)" }} />
              </button>
            )}
          </div>

          {/* Clear selection option */}
          {value && (
            <button
              onClick={() => {
                onSelect("", "");
                setOpen(false);
                setSearch("");
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
              style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--surface-3)" }}
            >
              <X size={11} />
              Clear selection
            </button>
          )}

          {/* Options list */}
          <div className="overflow-y-auto" style={{ maxHeight: "260px" }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-6 gap-2" style={{ color: "var(--text-muted)" }}>
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Loading ad sets...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {adSets && adSets.length > 0 ? "No matching ad sets" : "No ad sets found"}
                </p>
                <button
                  onClick={() => setFallbackMode(true)}
                  className="text-[10px] mt-1.5 px-2 py-0.5 rounded transition-colors"
                  style={{ color: "#60A7C8", background: "rgba(0,153,198,0.08)" }}
                >
                  Enter ID manually
                </button>
              </div>
            ) : (
              filtered.map((adSet: any) => {
                const isActive = adSet.id === value;
                return (
                  <button
                    key={adSet.id}
                    onClick={() => {
                      onSelect(adSet.id, adSet.name);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="w-full text-left px-3 py-2 transition-colors flex flex-col gap-0.5"
                    style={{
                      background: isActive ? "rgba(0,153,198,0.1)" : "transparent",
                      borderLeft: isActive ? "2px solid #0099C6" : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>
                        {adSet.name}
                      </span>
                      <span
                        className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: adSet.status === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(161,161,170,0.1)",
                          color: adSet.status === "ACTIVE" ? "#22c55e" : "#a1a1aa",
                          border: `1px solid ${adSet.status === "ACTIVE" ? "rgba(34,197,94,0.2)" : "rgba(161,161,170,0.15)"}`,
                        }}
                      >
                        {adSet.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        {truncateId(adSet.id)}
                      </span>
                      {adSet.campaignName && (
                        <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                          {adSet.campaignName}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Manual entry fallback link */}
          <div
            className="px-3 py-1.5 flex justify-end"
            style={{ borderTop: "1px solid var(--surface-3)" }}
          >
            <button
              onClick={() => {
                setFallbackMode(true);
                setOpen(false);
              }}
              className="text-[10px] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Enter ID manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
