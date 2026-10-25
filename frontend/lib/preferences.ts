"use client";

import { useSyncExternalStore } from "react";

// Per-browser UI preferences (sidebar, theme). Storage may be unavailable
// (private mode, blocked site data), so every access is guarded.

const EVENT = "siger:preferences";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered, but still applied for this page view below.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A stored preference; null on the server and when nothing is saved. */
export function usePreference(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
}

const THEME_KEY = "siger.theme";

/** The theme actually applied to <html> (set before paint by the layout script). */
export function useTheme(): "light" | "dark" | null {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => null,
  );
}

export function setTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  setPreference(THEME_KEY, theme);
}
