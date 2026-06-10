/**
 * Safe wrappers for localStorage and sessionStorage.
 * iOS Safari in private mode throws QuotaExceededError on any storage access,
 * which would otherwise crash the entire auth flow.
 */

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // ignore — e.g. private mode on iOS Safari
  }
}

function safeRemove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // ignore
  }
}

export const ls = {
  get: (key: string) => safeGet(localStorage, key),
  set: (key: string, value: string) => safeSet(localStorage, key, value),
  remove: (key: string) => safeRemove(localStorage, key),
};

export const ss = {
  get: (key: string) => safeGet(sessionStorage, key),
  set: (key: string, value: string) => safeSet(sessionStorage, key, value),
  remove: (key: string) => safeRemove(sessionStorage, key),
};
