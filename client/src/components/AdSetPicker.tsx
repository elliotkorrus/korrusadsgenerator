import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { ChevronDown, Search, Loader2, X, AlertTriangle, RefreshCw, Plus, ArrowLeft } from "lucide-react";

interface AdSetPickerProps {
  value: string; // current adSetId
  displayValue?: string; // current adSetName for display
  onSelect: (adSetId: string, adSetName: string) => void;
  disabled?: boolean;
  compact?: boolean; // table-cell mode: smaller sizing
  // When set, fetch ad sets from this specific account instead of the
  // configured primary one. Used by the "Re-upload to new account" dialog.
  accountId?: string;
}

export default function AdSetPicker({ value, displayValue, onSelect, disabled, compact, accountId }: AdSetPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackValue, setFallbackValue] = useState(value || "");
  // Create-new-ad-set sub-flow state. When createMode is true, the picker
  // body switches to a small form instead of the ad set list.
  const [createMode, setCreateMode] = useState(false);
  const [createCampaignId, setCreateCampaignId] = useState("");
  const [createSourceId, setCreateSourceId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Primary path: pull from meta_settings.ad_account_id (cached 5 min).
  // Override path: pull from an explicit account when `accountId` is set.
  const primary = trpc.meta.getAdSets.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !accountId,
  });
  const override = trpc.meta.getAdSetsForAccount.useQuery(
    { accountId: accountId || "" },
    {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      enabled: !!accountId,
    }
  );
  const adSets = accountId ? override.data : primary.data;
  const isLoading = accountId ? override.isLoading : primary.isLoading;
  const isError = accountId ? override.isError : primary.isError;
  const errorMsg = accountId ? (override.error as any)?.message : (primary.error as any)?.message;
  const refetch = accountId ? override.refetch : primary.refetch;

  // Lets us invalidate the cache after a duplicate so the new ad set
  // shows up immediately in the list.
  const utils = trpc.useUtils();
  const duplicateMut = trpc.meta.duplicateAdSet.useMutation({
    onSuccess: async (result) => {
      await utils.meta.getAdSets.invalidate();
      // Auto-select the newly created ad set on the row we were editing.
      onSelect(result.adSetId, result.adSetName);
      setCreateMode(false);
      setCreateCampaignId("");
      setCreateSourceId("");
      setCreateName("");
      setCreateError(null);
      setOpen(false);
    },
    onError: (err) => {
      setCreateError(err.message || "Couldn't create ad set");
    },
  });

  // Unique campaigns derived from the loaded ad set list (we only show
  // ACTIVE campaigns in getAdSets so this list is already scoped).
  const campaigns = useMemo(() => {
    if (!adSets) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const s of adSets as any[]) {
      if (s.campaignId && !map.has(s.campaignId)) {
        map.set(s.campaignId, s.campaignName || s.campaignId);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [adSets]);

  // Ad sets within the campaign currently chosen in the Create form.
  const adSetsInCreateCampaign = useMemo(() => {
    if (!adSets || !createCampaignId) return [] as any[];
    return (adSets as any[]).filter((s) => s.campaignId === createCampaignId);
  }, [adSets, createCampaignId]);

  // When the user picks a campaign, default the source ad set to the
  // first ACTIVE one in that campaign and pre-fill the name field.
  useEffect(() => {
    if (!createMode || !createCampaignId) return;
    if (!createSourceId) {
      const firstActive = adSetsInCreateCampaign.find((s) => s.status === "ACTIVE") || adSetsInCreateCampaign[0];
      if (firstActive) {
        setCreateSourceId(firstActive.id);
        if (!createName) setCreateName(`${firstActive.name} - copy`);
      }
    }
  }, [createMode, createCampaignId, createSourceId, createName, adSetsInCreateCampaign]);

  // Keep the name in sync when the user switches source ad set, unless
  // they've already typed something custom.
  const lastSourceRef = useRef<string>("");
  useEffect(() => {
    if (!createMode || !createSourceId) return;
    if (lastSourceRef.current === createSourceId) return;
    const src = adSetsInCreateCampaign.find((s) => s.id === createSourceId);
    if (src && (!createName || createName.endsWith(" - copy"))) {
      setCreateName(`${src.name} - copy`);
    }
    lastSourceRef.current = createSourceId;
  }, [createMode, createSourceId, adSetsInCreateCampaign, createName]);

  // NOTE: previously we auto-flipped to fallback (bare text input) on isError.
  // That hid the real problem — a stale Meta token, a 5xx, etc. — behind a
  // mute UI that asks for a hard-coded ID. Now the error is shown inside the
  // dropdown with a retry button, and fallback is only entered when the user
  // explicitly clicks "Enter ID manually".

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
      {open && createMode && (
        <div
          className="absolute z-[100] mt-1 rounded-md shadow-2xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--surface-3)",
            width: "360px",
            left: 0,
          }}
        >
          <div className="flex items-center gap-2 px-2.5 py-2" style={{ borderBottom: "1px solid var(--surface-3)" }}>
            <button
              onClick={() => { setCreateMode(false); setCreateError(null); }}
              className="p-0.5 rounded hover:bg-white/5"
              title="Back to ad set list"
            >
              <ArrowLeft size={12} style={{ color: "var(--text-muted)" }} />
            </button>
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              Create new ad set
            </span>
          </div>
          <div className="px-3 py-3 space-y-2.5">
            {/* Campaign */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                Campaign
              </label>
              <select
                value={createCampaignId}
                onChange={(e) => {
                  setCreateCampaignId(e.target.value);
                  setCreateSourceId("");
                  setCreateName("");
                  setCreateError(null);
                }}
                className="w-full text-xs px-2 py-1.5 rounded outline-none"
                style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
              >
                <option value="">Select a campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Source ad set */}
            {createCampaignId && (
              <div>
                <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                  Copy settings from
                </label>
                <select
                  value={createSourceId}
                  onChange={(e) => setCreateSourceId(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 rounded outline-none"
                  style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                >
                  {adSetsInCreateCampaign.length === 0 && <option value="">No ad sets in campaign</option>}
                  {adSetsInCreateCampaign.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Targeting, optimization, schedule, and DSA fields are cloned exactly.
                </p>
              </div>
            )}

            {/* New name */}
            {createSourceId && (
              <div>
                <label className="block text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                  New ad set name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ad set name"
                  className="w-full text-xs px-2 py-1.5 rounded outline-none"
                  style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                />
              </div>
            )}

            {createError && (
              <div className="text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded" style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.3)", color: "#fca5a5" }}>
                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <button
              onClick={() => {
                if (!createSourceId || !createName.trim()) return;
                setCreateError(null);
                duplicateMut.mutate({
                  sourceAdSetId: createSourceId,
                  newName: createName.trim(),
                  status: "ACTIVE",
                });
              }}
              disabled={!createSourceId || !createName.trim() || duplicateMut.isPending}
              className="w-full text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{ background: duplicateMut.isPending ? "rgba(0,153,198,0.4)" : "linear-gradient(135deg, #0099C6, #255C9E)", color: "white", border: "none" }}
            >
              {duplicateMut.isPending ? (
                <>
                  <Loader2 size={11} className="animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <Plus size={11} /> Create ad set (ACTIVE)
                </>
              )}
            </button>
            <p className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>
              Starts ACTIVE in Meta — will deliver as soon as ads land in it.
            </p>
          </div>
        </div>
      )}

      {open && !createMode && (
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
            ) : isError ? (
              <div className="py-4 px-3 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={13} style={{ color: "#f59e0b" }} />
                  <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>Couldn't load ad sets</p>
                </div>
                <p className="text-[10px] text-center leading-snug" style={{ color: "var(--text-muted)", maxWidth: 280 }}>
                  {errorMsg ? errorMsg.slice(0, 180) : "Meta API call failed. Most often this is an expired token — check Meta Settings."}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    onClick={() => refetch()}
                    className="text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors"
                    style={{ color: "#60A7C8", background: "rgba(0,153,198,0.10)", border: "1px solid rgba(0,153,198,0.25)" }}
                  >
                    <RefreshCw size={10} /> Retry
                  </button>
                  <button
                    onClick={() => setFallbackMode(true)}
                    className="text-[10px] px-2 py-1 rounded transition-colors"
                    style={{ color: "var(--text-muted)", background: "transparent", border: "1px solid var(--surface-3)" }}
                  >
                    Enter ID manually
                  </button>
                </div>
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

          {/* Footer: create new ad set + manual entry fallback */}
          <div
            className="px-3 py-1.5 flex items-center justify-between gap-2"
            style={{ borderTop: "1px solid var(--surface-3)" }}
          >
            <button
              onClick={() => {
                setCreateMode(true);
                setCreateError(null);
                setSearch("");
              }}
              className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors"
              style={{ color: "#60A7C8", background: "rgba(0,153,198,0.08)", border: "1px solid rgba(0,153,198,0.20)" }}
              title="Duplicate an existing ad set in a campaign to create a new one without leaving the dashboard"
            >
              <Plus size={10} /> Create new ad set
            </button>
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
