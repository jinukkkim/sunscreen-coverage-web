import { normalizeProfile, validateProfile } from './product.js';

export const STORAGE_KEY = 'sunguard.product.v1';

// `storage` is injected (window.localStorage in the app, a Map-like fake in tests).
export function loadProfile(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizeProfile(JSON.parse(raw));
    return validateProfile(normalized).ok ? normalized : null;
  } catch {
    return null;
  }
}

export function saveProfile(storage, profile) {
  const normalized = normalizeProfile(profile);
  const result = validateProfile(normalized);
  if (!result.ok) throw new Error(Object.values(result.errors)[0]);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearProfile(storage) {
  storage.removeItem(STORAGE_KEY);
}
