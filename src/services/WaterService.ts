// ─────────────────────────────────────────────────────────────────────────────
// DietSync — WaterService
// Requirements: 14.1–14.5
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { STORAGE_KEYS, type UserSettings } from '../types/index';
import { storageRepository } from '../repositories/StorageRepository';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Schema for the per-user water record: `Record<YYYY-MM-DD, totalMl>` */
const WaterRecordSchema = z.record(z.string(), z.number());

/** Schema for user settings (only the water-relevant fields are required) */
const UserSettingsSchema = z.object({
  logPruningDays: z.number(),
  waterStepMl: z.number(),
  waterTargetMl: z.number(),
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_WATER_STEP_ML = 250;
const DEFAULT_WATER_TARGET_ML = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the full water record for a user from storage.
 * Returns an empty object when no data exists.
 */
function loadWaterRecord(userId: string): Record<string, number> {
  const key = STORAGE_KEYS.WATER(userId);
  return storageRepository.get(key, WaterRecordSchema, {});
}

/**
 * Persist the full water record for a user to storage.
 */
function saveWaterRecord(userId: string, record: Record<string, number>): void {
  const key = STORAGE_KEYS.WATER(userId);
  storageRepository.set(key, record);
}

// ---------------------------------------------------------------------------
// WaterService
// ---------------------------------------------------------------------------

/**
 * Service layer for daily water-intake tracking.
 *
 * Responsibilities:
 *  - Accumulate daily water additions per user and date.  (Req 14.5)
 *  - Keep distinct dates fully independent so a new day always starts at 0
 *    while previous days' totals are preserved.  (Req 14.4)
 *  - Read water step/target settings from `dietsync:[userId]:settings`.
 *    (Req 14.1)
 *
 * Storage layout:
 *   Key   : `dietsync:[userId]:water`
 *   Value : `Record<YYYY-MM-DD, number>` where each value is the accumulated
 *           total in millilitres for that calendar date.  (Req 14.3)
 */
export class WaterService {
  // ── addWater ─────────────────────────────────────────────────────────────

  /**
   * Adds `amountMl` to the running total for the given `date`.
   *
   * - If no entry exists for `date`, it is initialised to 0 before adding.
   * - Distinct dates never influence each other.  (Req 14.4)
   * - After N additions on the same date the total equals their arithmetic
   *   sum.  (Req 14.5)
   *
   * @param userId   - The authenticated user's ID.
   * @param date     - Calendar date in `YYYY-MM-DD` format.
   * @param amountMl - Positive amount to add in millilitres.
   * @returns        The new cumulative total for `date`.
   */
  addWater(userId: string, date: string, amountMl: number): number {
    const record = loadWaterRecord(userId);
    const current = record[date] ?? 0;
    const updated = current + amountMl;
    saveWaterRecord(userId, { ...record, [date]: updated });
    return updated;
  }

  // ── getWater ─────────────────────────────────────────────────────────────

  /**
   * Returns the current accumulated water total for `date`.
   *
   * Returns `0` when no additions have been made on that date, reflecting
   * that each new calendar day starts at zero.  (Req 14.4)
   *
   * @param userId - The authenticated user's ID.
   * @param date   - Calendar date in `YYYY-MM-DD` format.
   * @returns      Total millilitres consumed on `date`, or `0` if none.
   */
  getWater(userId: string, date: string): number {
    const record = loadWaterRecord(userId);
    return record[date] ?? 0;
  }

  // ── getSettings ──────────────────────────────────────────────────────────

  /**
   * Reads the user's water-related settings from storage.
   *
   * Falls back to defaults when settings are absent or invalid:
   *  - `waterStepMl`   → 250 ml
   *  - `waterTargetMl` → 2000 ml
   *
   * @param userId - The authenticated user's ID.
   * @returns      An object containing `waterStepMl` and `waterTargetMl`.
   *               (Req 14.1)
   */
  getSettings(userId: string): Pick<UserSettings, 'waterStepMl' | 'waterTargetMl'> {
    const key = STORAGE_KEYS.SETTINGS(userId);
    const settings = storageRepository.get<UserSettings | null>(
      key,
      UserSettingsSchema as z.ZodType<UserSettings | null>,
      null,
    );

    return {
      waterStepMl: settings?.waterStepMl ?? DEFAULT_WATER_STEP_ML,
      waterTargetMl: settings?.waterTargetMl ?? DEFAULT_WATER_TARGET_ML,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton instance — use this throughout the app
// ---------------------------------------------------------------------------

export const waterService = new WaterService();
