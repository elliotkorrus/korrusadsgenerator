import { useEffect, useCallback } from "react";

interface ShortcutHandler {
  key: string;
  ctrl?: boolean;
  meta?: boolean; // Cmd on Mac
  shift?: boolean;
  handler: () => void;
  description: string;
}

/**
 * Global keyboard shortcuts hook.
 * Shortcuts are disabled when the user is typing in an input/textarea/select.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || tag === "select" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;

        if (keyMatch && ctrlMatch && shiftMatch) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/** All available shortcuts for the help overlay */
export const SHORTCUT_MAP = [
  { key: "a", description: "Select all concepts" },
  { key: "Escape", description: "Deselect all / close panels" },
  { key: "r", description: "Mark selected as Ready" },
  { key: "d", description: "Mark selected as Draft" },
  { key: "Delete", description: "Delete selected" },
  { key: "1", description: "Switch to Inbox view" },
  { key: "2", description: "Switch to Queue view" },
  { key: "3", description: "Switch to Live view" },
  { key: "/", description: "Focus search" },
  { key: "?", shift: true, description: "Show keyboard shortcuts" },
] as const;
