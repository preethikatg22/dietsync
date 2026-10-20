import { z } from 'zod';

// ---------------------------------------------------------------------------
// Storage key constants (Req 11.5)
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  USERS: 'dietsync:users',
  AUTH: 'dietsync:auth',
  SESSION: 'dietsync:session',
  LOGS: (userId: string) => `dietsync:${userId}:logs` as const,
  WEIGHT: (userId: string) => `dietsync:${userId}:weight` as const,
  WATER: (userId: string) => `dietsync:${userId}:water` as const,
  CUSTOM_FOODS: (userId: string) => `dietsync:${userId}:customFoods` as const,
  GOALS: (userId: string) => `dietsync:${userId}:goals` as const,
  SETTINGS: (userId: string) => `dietsync:${userId}:settings` as const,
  RECENT_FOODS: (userId: string) => `dietsync:${userId}:recentFoods` as const,
} as const;

// ---------------------------------------------------------------------------
// 4 MB warning threshold (Req 11.4)
// ---------------------------------------------------------------------------

const USAGE_WARNING_BYTES = 4 * 1024 * 1024; // 4 MB

// ---------------------------------------------------------------------------
// StorageRepository
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around `localStorage` that provides typed get/set with Zod
 * validation. All methods are safe — they never throw.
 */
export class StorageRepository {
  /**
   * Reads the value at `key`, parses it as JSON, and validates it with
   * `schema`. Returns `fallback` (and logs a `console.error`) on any failure:
   * key missing, invalid JSON, or schema validation failure. (Req 11.1, 11.2)
   */
  get<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return fallback;
      }

      const parsed: unknown = JSON.parse(raw);
      const result = schema.safeParse(parsed);

      if (!result.success) {
        console.error(
          `[StorageRepository] Schema validation failed for key "${key}":`,
          result.error,
        );
        return fallback;
      }

      return result.data;
    } catch (err) {
      console.error(
        `[StorageRepository] Failed to read key "${key}":`,
        err,
      );
      return fallback;
    }
  }

  /**
   * Serialises `value` to JSON and writes it to `localStorage` under `key`.
   * Catches `QuotaExceededError` and logs a warning instead of throwing.
   * After a successful write it checks usage and warns if > 4 MB. (Req 11.4)
   */
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));

      // Warn when storage usage exceeds the 4 MB threshold (Req 11.4)
      const usage = this.estimatedUsageBytes();
      if (usage > USAGE_WARNING_BYTES) {
        console.warn(
          `[StorageRepository] Estimated LocalStorage usage is ${(usage / (1024 * 1024)).toFixed(2)} MB, which exceeds the 4 MB threshold.`,
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.warn(
          `[StorageRepository] QuotaExceededError while writing key "${key}". Storage is full.`,
        );
      } else {
        console.error(
          `[StorageRepository] Unexpected error writing key "${key}":`,
          err,
        );
      }
    }
  }

  /**
   * Removes `key` from `localStorage`. No-op if the key is absent.
   */
  remove(key: string): void {
    localStorage.removeItem(key);
  }

  /**
   * Sums the UTF-8 byte lengths of all `localStorage` keys **and** their
   * values whose key starts with `"dietsync:"`. (Req 11.4, 11.5)
   */
  estimatedUsageBytes(): number {
    const encoder = new TextEncoder();
    let total = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith('dietsync:')) {
        continue;
      }

      total += encoder.encode(key).byteLength;

      const value = localStorage.getItem(key);
      if (value !== null) {
        total += encoder.encode(value).byteLength;
      }
    }

    return total;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance — use this throughout the app
// ---------------------------------------------------------------------------

export const storageRepository = new StorageRepository();
