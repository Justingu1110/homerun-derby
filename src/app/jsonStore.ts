/**
 * One JSON value in localStorage under one key. Never throws: when storage is
 * blocked (private browsing, disabled cookies, quota) or holds something that
 * isn't JSON, read() gives undefined and write() is dropped, so the game plays
 * on and the value lasts only this session. Callers validate what they read.
 */
export interface JsonStore {
  /** The stored value, or undefined when there is none or it can't be read. */
  read(): unknown;
  write(value: unknown): void;
}

export function localJsonStore(key: string): JsonStore {
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage unavailable: keep playing without it.
      }
    },
  };
}
