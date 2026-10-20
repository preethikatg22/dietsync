// ─────────────────────────────────────────────────────────────────────────────
// DietSync — ProgressService
// Requirements: 8.1-8.4, 9.1-9.8
// ─────────────────────────────────────────────────────────────────────────────
//
// Wraps the pure `NutritionCalculator` progress functions with actual data
// loading from `StorageRepository`. The pure functions remain free of I/O and
// fully unit/property-testable; this service owns the read/write side effects
// and overlays persisted context (e.g. the user's calorie target) that the
// pure functions cannot access on their own.

import { z } from 'zod';
import {
  STORAGE_KEYS,
  type DailyAdherence,
  type DayLog,
  type NutritionGoals,
  type WeightEntry,
  type WeeklyStats,
} from '../types/index';
import { storageRepository } from '../repositories/StorageRepository';
import {
  computeMonthlyAdherence,
  computeStreak,
  computeWeeklyAverage,
  sortWeightLog,
} from './NutritionCalculator';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
//
// These mirror the shapes persisted by other services so that every read
// boundary is validated. A validation failure falls back to a safe default
// (empty object / array / null) and is logged by `StorageRepository` — never
// thrown. (Req 11.1, 11.2)

const LogEntrySchema = z.object({
  id: z.string(),
  foodId: z.string(),
  foodName: z.string(),
  servingGrams: z.number(),
  mealSection: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const DayLogSchema = z.object({
  date: z.string(),
  entries: z.array(LogEntrySchema),
});

const DayLogRecordSchema = z.record(z.string(), DayLogSchema);

const NutritionGoalsSchema = z.object({
  calorieTarget: z.number(),
  proteinPct: z.number(),
  carbsPct: z.number(),
  fatPct: z.number(),
  isManual: z.boolean(),
});

// Weight is stored as a flat `Record<YYYY-MM-DD, number>` (date → weightKg),
// matching the data model's LocalStorage Key Map. (Req 8.2)
const WeightRecordSchema = z.record(z.string(), z.number());

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// When no goals have been configured, the calorie target is treated as 0 so
// that progress calculations degrade to 0% rather than throwing. The UI is
// responsible for surfacing the empty-state prompt when goals are absent.
// (Req 6.7, 9.8, 12.3)
const DEFAULT_CALORIE_TARGET = 0;

// ---------------------------------------------------------------------------
// Data-loading helpers
// ---------------------------------------------------------------------------

/**
 * Load all DayLogs for a user from storage. Returns `{}` when no logs exist
 * or when stored data fails schema validation. (Req 5.6, 11.1, 11.2)
 */
function loadLogs(userId: string): Record<string, DayLog> {
  return storageRepository.get(STORAGE_KEYS.LOGS(userId), DayLogRecordSchema, {});
}

/**
 * Load the user's nutrition goals from storage. Returns `null` when no goals
 * have been configured or when the stored value is invalid. (Req 7.6, 11.1)
 */
function loadGoals(userId: string): NutritionGoals | null {
  return storageRepository.get<NutritionGoals | null>(
    STORAGE_KEYS.GOALS(userId),
    NutritionGoalsSchema as z.ZodType<NutritionGoals | null>,
    null,
  );
}

/**
 * Resolve the user's calorie target, defaulting to 0 when no goals exist.
 */
function loadCalorieTarget(userId: string): number {
  return loadGoals(userId)?.calorieTarget ?? DEFAULT_CALORIE_TARGET;
}

/**
 * Load the user's weight record (`Record<YYYY-MM-DD, number>`) from storage.
 * Returns `{}` when no entries exist or validation fails. (Req 8.2, 11.1)
 */
function loadWeightRecord(userId: string): Record<string, number> {
  return storageRepository.get(
    STORAGE_KEYS.WEIGHT(userId),
    WeightRecordSchema,
    {},
  );
}

/**
 * Persist the full weight record for a user. (Req 8.2)
 */
function saveWeightRecord(userId: string, record: Record<string, number>): void {
  storageRepository.set(STORAGE_KEYS.WEIGHT(userId), record);
}

/**
 * Convert a stored weight record (`Record<YYYY-MM-DD, number>`) into an array
 * of `WeightEntry` objects.
 */
function toWeightEntries(record: Record<string, number>): WeightEntry[] {
  return Object.entries(record).map(([date, weightKg]) => ({ date, weightKg }));
}

// ---------------------------------------------------------------------------
// ProgressService
// ---------------------------------------------------------------------------

/**
 * Service layer for progress / weight-log operations.
 *
 * Responsibilities:
 *  - Load persisted DayLogs and delegate to the pure `NutritionCalculator`
 *    progress functions (`computeWeeklyAverage`, `computeMonthlyAdherence`,
 *    `computeStreak`).
 *  - Overlay the user's persisted calorie target onto results that the pure
 *    functions cannot derive on their own.
 *  - Read, sort, and persist weight entries under `dietsync:[userId]:weight`.
 *
 * (Req 8.1-8.4, 9.1-9.8)
 */
export class ProgressService {
  // ── Weekly stats ─────────────────────────────────────────────────────────

  /**
   * Compute weekly calorie stats for the Monday–Sunday week that contains
   * `weekOf`.
   *
   * Loads the user's DayLogs, delegates to `computeWeeklyAverage` (which
   * respects the Mon–Sun boundary and excludes empty days from the divisor),
   * then overlays the user's persisted calorie target as `targetCalories`.
   *
   * When the week has no logged days, `averageCalories` is 0 and `daysLogged`
   * is 0 — the UI renders an empty-state message in that case. (Req 9.1, 9.5,
   * 9.8)
   */
  getWeeklyStats(userId: string, weekOf: Date): WeeklyStats {
    const logs = loadLogs(userId);
    const stats = computeWeeklyAverage(logs, weekOf);
    const targetCalories = loadCalorieTarget(userId);
    return { ...stats, targetCalories };
  }

  // ── Monthly adherence ───────────────────────────────────────────────────

  /**
   * Compute per-day calorie adherence percentages for the calendar month
   * that contains `month`.
   *
   * Loads the user's DayLogs and calorie target, then delegates to
   * `computeMonthlyAdherence`. Days without a log entry still appear with an
   * adherence of 0%. (Req 9.2)
   */
  getMonthlyAdherence(userId: string, month: Date): DailyAdherence[] {
    const logs = loadLogs(userId);
    const calorieTarget = loadCalorieTarget(userId);
    return computeMonthlyAdherence(logs, month, calorieTarget);
  }

  // ── Streak ──────────────────────────────────────────────────────────────

  /**
   * Compute the current logging streak: the number of consecutive calendar
   * days ending on `today` (or yesterday, if today has no entry) on which at
   * least one food entry was logged.
   *
   * Loads the user's DayLogs and delegates to `computeStreak`. Any gap of one
   * or more days without a log resets the streak to 0. (Req 9.3, 9.4, 9.6)
   */
  getStreak(userId: string, today: Date): number {
    const logs = loadLogs(userId);
    return computeStreak(logs, today);
  }

  // ── Weight log ──────────────────────────────────────────────────────────

  /**
   * Load and return the user's weight entries, sorted in ascending date
   * order.
   *
   * Storage holds weight as a flat `Record<YYYY-MM-DD, number>`; this method
   * converts it to `WeightEntry[]` and applies `sortWeightLog` so the trend
   * is insertion-order independent. (Req 8.3, 8.4)
   */
  getWeightLog(userId: string): WeightEntry[] {
    const record = loadWeightRecord(userId);
    return sortWeightLog(toWeightEntries(record));
  }

  /**
   * Add (or overwrite) a weight entry for `date` and persist it.
   *
   * Accepts a positive numeric weight in kilograms associated with the given
   * `YYYY-MM-DD` date. If an entry already exists for that date it is
   * overwritten. The updated weight record is persisted to
   * `dietsync:[userId]:weight`, and the freshly sorted `WeightEntry[]` is
   * returned so callers (e.g. a store) can refresh their slice. (Req 8.1,
   * 8.2)
   */
  addWeightEntry(userId: string, date: string, weightKg: number): WeightEntry[] {
    const record = loadWeightRecord(userId);
    const updated: Record<string, number> = { ...record, [date]: weightKg };
    saveWeightRecord(userId, updated);
    return sortWeightLog(toWeightEntries(updated));
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/**
 * App-wide singleton. Import and use this in Zustand stores and other service
 * consumers.
 */
export const progressService = new ProgressService();
