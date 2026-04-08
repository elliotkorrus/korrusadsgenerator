import { useState, useEffect, useRef } from "react";

export interface UploadProgress {
  conceptKey: string;
  adName: string;
  stage: "uploading_asset" | "processing_video" | "creating_creative" | "creating_ad" | "done" | "error";
  currentAsset: number;
  totalAssets: number;
  chunkProgress: number;
  message: string;
}

const STAGE_LABELS: Record<string, string> = {
  uploading_asset: "Uploading",
  processing_video: "Processing Video",
  creating_creative: "Creating Creative",
  creating_ad: "Creating Ad",
  done: "Complete",
  error: "Error",
};

export function stageName(stage: string): string {
  return STAGE_LABELS[stage] || stage;
}

export function useUploadProgress(enabled: boolean): UploadProgress[] {
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setProgress([]);
      return;
    }

    // Pass auth token as query param since EventSource can't set custom headers
    const token = localStorage.getItem("app-token");
    const url = token ? `/api/upload-progress?token=${encodeURIComponent(token)}` : "/api/upload-progress";
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as UploadProgress[];
        setProgress(data);
      } catch {}
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [enabled]);

  return progress;
}
