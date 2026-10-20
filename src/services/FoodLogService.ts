// ─────────────────────────────────────────────────────────────────────────────
// DietSync — FoodLogService
// Requirements: 5.1-5.8, 11.3, 15.1-15.4, 16.1-16.4
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import {
  STORAGE_KEYS,
  type DayLog,
  type LogEntry,
  type MealSection,
  type UserSettings,
  type ValidationError,
} from '../types/index';
import { localFoodRepository } from '../repositories/LocalFoodRepository';
import type { FoodRepositoryError } from '../repositories/IFoodRepository';
import { scaleNutrients } from './NutritionCalculator';
import { storageRepository } from '../repositories/StorageRepository';

// Re-export so consumers can import `ValidationError` from this module.
export type { ValidationError };

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

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

const UserSettingsSchema = z.object({
  logPruningDays: z.number(),
  waterStepMl: z.number(),
  waterTargetMl: z.number(),
});

// Schema for the recent foods list — an array of food ID strings
const RecentFoodsSchema = z.array(z.string());

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of unique food IDs kept in the recent foods list. (Req 15.1) */
const RECENT_FOODS_MAX = 10;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PRUNING_DAYS = 90;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the cutoff date string (YYYY-MM-DD) for log pruning.
 * Entries strictly older than this date are removed.
 */
function pruningCutoffDate(thresholdDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - thresholdDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Load all DayLogs for a user from storage.
 */
function loadAllLogs(userId: string): Record<string, DayLog> {
  const key = STORAGE_KEYS.LOGS(userId);
  return storageRepository.get(key, DayLogRecordSchema, {});
}

/**
 * Persist the full logs record for a user to storage. (Req 5.6)
 */
function saveAllLogs(userId: string, logs: Record<string, DayLog>): void {
  const key = STORAGE_KEYS.LOGS(userId);
  storageRepository.set(key, logs);
}

/**
 * Prune log entries older than the configured threshold for the given user.
 * Removes DayLog records whose date is strictly older than the cutoff.
 * (Req 11.3)
 *
 * Returns the pruned logs record.
 */
function pruneLogs(
  logs: Record<string, DayLog>,
  pruningDays: number,
): Record<string, DayLog> {
  const cutoff = pruningCutoffDate(pruningDays);
  const pruned: Record<string, DayLog> = {};
  for (const [date, dayLog] of Object.entries(logs)) {
    if (date >= cutoff) {
      pruned[date] = dayLog;
    }
  }
  return pruned;
}

/**
 * Load the pruning threshold from the user's settings.
 * Falls back to DEFAULT_PRUNING_DAYS (90) if settings are absent or invalid.
 */
function loadPruningDays(userId: string): number {
  const key = STORAGE_KEYS.SETTINGS(userId);
  const settings = storageRepository.get<UserSettings | null>(
    key,
    UserSettingsSchema as z.ZodType<UserSettings | null>,
    null,
  );
  return settings?.logPruningDays ?? DEFAULT_PRUNING_DAYS;
}

/**
 * Load all logs, prune old entries, persist the pruned set, and return it.
 */
function loadAndPruneLogs(userId: string): Record<string, DayLog> {
  const raw = loadAllLogs(userId);
  const pruningDays = loadPruningDays(userId);
  const pruned = pruneLogs(raw, pruningDays);

  // Persist the pruned version so storage stays clean (Req 11.3)
  if (Object.keys(raw).length !== Object.keys(pruned).length) {
    saveAllLogs(userId, pruned);
  }

  return pruned;
}

// ---------------------------------------------------------------------------
// Recent foods helpers (Req 15.1-15.3)
// ---------------------------------------------------------------------------

/**
 * Load the recent food IDs list for a user from storage.
 * Returns an empty array if no data exists or validation fails.
 */
function loadRecentFoodIds(userId: string): string[] {
  const key = STORAGE_KEYS.RECENT_FOODS(userId);
  return storageRepository.get(key, RecentFoodsSchema, []);
}

/**
 * Persist the recent food IDs list for a user to storage.
 */
function saveRecentFoodIds(userId: string, ids: string[]): void {
  const key = STORAGE_KEYS.RECENT_FOODS(userId);
  storageRepository.set(key, ids);
}

/**
 * Update the recent foods list after logging a food item.
 *
 * Rules (Req 15.1-15.3):
 *  - If `foodId` is already in the list, remove it from its current position
 *    and re-insert at index 0 (promote to top).
 *  - If `foodId` is new and the list already has 10 items, evict the last
 *    (oldest) entry before inserting at index 0.
 *  - Otherwise, simply insert the new `foodId` at index 0.
 */
function updateRecentFoodIds(userId: string, foodId: string): void {
  const current = loadRecentFoodIds(userId);

  // Remove any existing occurrence (handles promote-on-re-log, Req 15.2)
  const filtered = current.filter((id) => id !== foodId);

  // Evict oldest if at capacity with a new unique food (Req 15.3)
  if (filtered.length >= RECENT_FOODS_MAX) {
    filtered.splice(RECENT_FOODS_MAX - 1); // keep only the first N-1 items
  }

  // Insert at top (most-recently-logged first, Req 15.1)
  saveRecentFoodIds(userId, [foodId, ...filtered]);
}

// ---------------------------------------------------------------------------
// Copy Yesterday result type (Req 16.1-16.4)
// ---------------------------------------------------------------------------

/**
 * Discriminated-union result returned by {@link FoodLogService.copyYesterday}.
 *
 * | status | meaning |
 * |---|---|
 * | `"success"` | Entries were copied; `copiedCount` tells how many. |
 * | `"no_previous_log"` | Previous day has no log; no changes were made. |
 * | `"needs_confirmation"` | Today has existing entries and no `mode` was supplied; caller must re-invoke with `mode` = `"append"` or `"replace"`. |
 */
export type CopyYesterdayResult =
  | { status: 'success'; copiedCount: number }
  | { status: 'no_previous_log'; message: string }
  | { status: 'needs_confirmation'; message: string };

// ---------------------------------------------------------------------------
// FoodLogService
// ---------------------------------------------------------------------------

/**
 * Service layer for all food-log operations.
 *
 * Responsibilities:
 *  - Add, edit, and remove log entries within a user's daily food log.
 *  - Scale nutrients via `NutritionCalculator.scaleNutrients`.
 *  - Persist changes to `dietsync:[userId]:logs` via `StorageRepository`.
 *  - Prune log entries older than the configured threshold on every load.
 *    (Req 11.3)
 */
export class FoodLogService {
  // ── addEntry ─────────────────────────────────────────────────────────────

  /**
   * Adds a new food log entry to the specified date and meal section.
   *
   * Steps:
   *  1. Look up the food item via `LocalFoodRepository.getById`.
   *  2. Scale nutrients to the given serving size.
   *  3. Build a `LogEntry` with a fresh UUID id.
   *  4. Load the existing `DayLog` (or create a new one) and append the entry.
   *  5. Persist to storage. (Req 5.1, 5.2, 5.3, 5.6)
   *
   * Throws if `foodId` is not found.
   */
  addEntry(
    userId: string,
    date: string,
    foodId: string,
    grams: number,
    section: MealSection,
  ): LogEntry {
    // Resolve the food item
    const foodOrError = localFoodRepository.getById(foodId);
    if ((foodOrError as FoodRepositoryError).error) {
      throw new Error((foodOrError as FoodRepositoryError).message);
    }

    // We know it is a FoodItem at this point
    const food = foodOrError as Exclude<typeof foodOrError, FoodRepositoryError>;

    // Scale macros for the given serving size (Req 5.3)
    const scaled = scaleNutrients(food, grams);

    // Build the log entry
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      foodId: food.id,
      foodName: food.name,
      servingGrams: grams,
      mealSection: section,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
    };

    // Load, prune, append, and save
    const logs = loadAndPruneLogs(userId);
    const existing = logs[date] ?? { date, entries: [] };
    const updated: DayLog = {
      ...existing,
      entries: [...existing.entries, entry],
    };
    saveAllLogs(userId, { ...logs, [date]: updated });

    // Update the recent foods list after a successful add (Req 15.1-15.3)
    updateRecentFoodIds(userId, food.id);

    return entry;
  }

  // ── editEntry ─────────────────────────────────────────────────────────────

  /**
   * Updates an existing log entry's serving size and recalculates its
   * nutrient values.
   *
   * Steps:
   *  1. Load the DayLog for `date`.
   *  2. Find the entry with `entryId`.
   *  3. Look up the original food item by `entry.foodId` to get per-100g values.
   *  4. Re-scale nutrients for the new `grams` value.
   *  5. Replace the entry in the DayLog and persist. (Req 5.4)
   *
   * Throws if the entry is not found.
   */
  editEntry(
    userId: string,
    date: string,
    entryId: string,
    grams: number,
  ): LogEntry {
    const logs = loadAndPruneLogs(userId);
    const dayLog = logs[date];

    if (!dayLog) {
      throw new Error(
        `[FoodLogService] No DayLog found for date "${date}" (user "${userId}").`,
      );
    }

    const entryIndex = dayLog.entries.findIndex((e) => e.id === entryId);
    if (entryIndex === -1) {
      throw new Error(
        `[FoodLogService] No log entry found with id "${entryId}" on date "${date}".`,
      );
    }

    const existing = dayLog.entries[entryIndex];

    // Re-fetch the food to get fresh per-100g values (Req 5.8 — stored macro
    // values are retained if food is deleted, but here we need the food for
    // recalculation; fall back to using the entry's own nutrient fields if
    // the food has since been deleted)
    const foodOrError = localFoodRepository.getById(existing.foodId);
    let scaled: ReturnType<typeof scaleNutrients>;

    if ((foodOrError as FoodRepositoryError).error) {
      // Food was deleted after logging — re-scale based on the stored per-gram
      // ratios derived from the entry's original values (Req 5.8)
      const originalGrams = existing.servingGrams;
      if (originalGrams === 0) {
        scaled = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      } else {
        const perGram = {
          caloriesPer100g: (existing.calories / originalGrams) * 100,
          proteinPer100g: (existing.protein / originalGrams) * 100,
          carbsPer100g: (existing.carbs / originalGrams) * 100,
          fatPer100g: (existing.fat / originalGrams) * 100,
        };
        scaled = scaleNutrients(
          {
            id: existing.foodId,
            name: existing.foodName,
            category: '',
            ...perGram,
          },
          grams,
        );
      }
    } else {
      const food = foodOrError as Exclude<typeof foodOrError, FoodRepositoryError>;
      scaled = scaleNutrients(food, grams);
    }

    const updatedEntry: LogEntry = {
      ...existing,
      servingGrams: grams,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
    };

    const updatedEntries = [...dayLog.entries];
    updatedEntries[entryIndex] = updatedEntry;

    const updatedDayLog: DayLog = { ...dayLog, entries: updatedEntries };
    saveAllLogs(userId, { ...logs, [date]: updatedDayLog });

    return updatedEntry;
  }

  // ── removeEntry ───────────────────────────────────────────────────────────

  /**
   * Removes a log entry from the specified date.
   *
   * No-op if the entry or the DayLog is not found. (Req 5.5)
   */
  removeEntry(userId: string, date: string, entryId: string): void {
    const logs = loadAndPruneLogs(userId);
    const dayLog = logs[date];

    if (!dayLog) return;

    const filteredEntries = dayLog.entries.filter((e) => e.id !== entryId);

    // If nothing changed, skip the write
    if (filteredEntries.length === dayLog.entries.length) return;

    const updatedDayLog: DayLog = { ...dayLog, entries: filteredEntries };
    saveAllLogs(userId, { ...logs, [date]: updatedDayLog });
  }

  // ── getDayLog ─────────────────────────────────────────────────────────────

  /**
   * Loads and returns the `DayLog` for the given user and date.
   *
   * Triggers log pruning on every load (Req 11.3).
   * Returns a fresh empty DayLog when no data exists for the given date.
   */
  getDayLog(userId: string, date: string): DayLog {
    const logs = loadAndPruneLogs(userId);
    return logs[date] ?? { date, entries: [] };
  }

  // ── getRecentFoods ────────────────────────────────────────────────────────

  /**
   * Returns the list of recently logged food IDs for the user, ordered from
   * most-recently-logged (index 0) to oldest (index N-1).
   *
   * The list contains up to 10 unique food IDs. Empty if the user has no
   * recent food history. (Req 15.1, 15.4)
   */
  getRecentFoods(userId: string): string[] {
    return loadRecentFoodIds(userId);
  }

  // ── copyYesterday ─────────────────────────────────────────────────────────

  /**
   * Copies all food log entries from the previous calendar day into today's
   * DayLog, assigning new unique IDs to each copied entry.
   *
   * Behaviour (Req 16.1-16.4):
   *
   * 1. Derive `yesterday` as the calendar day immediately before `today`.
   * 2. If yesterday has no DayLog (or an empty entries array), return
   *    `{ status: "no_previous_log" }`. No storage write occurs. (Req 16.3)
   * 3. If today already has entries AND `mode` is not supplied, return
   *    `{ status: "needs_confirmation" }`. The caller must re-invoke with
   *    `mode = "append"` or `mode = "replace"`. (Req 16.4)
   * 4. Deep-copy all source entries with fresh UUIDs (Req 16.1). The source
   *    DayLog is never mutated (Req 16.2).
   *    - `mode = "append"` (or today is empty): merge copied entries after
   *      today's existing entries.
   *    - `mode = "replace"`: discard today's existing entries entirely and use
   *      only the copied entries.
   * 5. Persist the updated today DayLog and return `{ status: "success" }`.
   *
   * @param userId  - Authenticated user ID.
   * @param today   - Current calendar date in `YYYY-MM-DD` format.
   * @param mode    - Optional conflict resolution: `"append"` | `"replace"`.
   *                  Required only when today already has entries.
   */
  copyYesterday(
    userId: string,
    today: string,
    mode?: 'append' | 'replace',
  ): CopyYesterdayResult {
    // ── 1. Derive yesterday's date string ─────────────────────────────────
    const todayDate = new Date(today);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    // ── 2. Load logs (with pruning) ────────────────────────────────────────
    const logs = loadAndPruneLogs(userId);

    // ── 3. Check previous day has entries ─────────────────────────────────
    const sourceLog = logs[yesterday];
    if (!sourceLog || sourceLog.entries.length === 0) {
      return {
        status: 'no_previous_log',
        message: `No food log exists for ${yesterday}. Nothing was copied.`,
      };
    }

    // ── 4. Check today for existing entries (conflict detection) ──────────
    const todayLog = logs[today] ?? { date: today, entries: [] };
    const todayHasEntries = todayLog.entries.length > 0;

    if (todayHasEntries && mode === undefined) {
      return {
        status: 'needs_confirmation',
        message:
          "Today already has food entries. Choose 'append' to add yesterday's entries alongside today's, or 'replace' to overwrite today's log entirely.",
      };
    }

    // ── 5. Deep-copy source entries with new UUIDs ─────────────────────────
    // Source log is read-only — we never mutate `sourceLog.entries` (Req 16.2).
    const copiedEntries: LogEntry[] = sourceLog.entries.map((entry) => ({
      ...entry,                    // shallow-copy all fields (all are primitives)
      id: crypto.randomUUID(),     // assign a fresh unique ID (Req 16.1)
    }));

    // ── 6. Merge according to mode ────────────────────────────────────────
    const mergedEntries: LogEntry[] =
      mode === 'replace'
        ? copiedEntries
        : [...todayLog.entries, ...copiedEntries]; // append (default)

    const updatedTodayLog: DayLog = { date: today, entries: mergedEntries };

    // ── 7. Persist and return ─────────────────────────────────────────────
    saveAllLogs(userId, { ...logs, [today]: updatedTodayLog });

    return { status: 'success', copiedCount: copiedEntries.length };
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/**
 * App-wide singleton. Import and use this in Zustand stores and other
 * service consumers.
 */
export const foodLogService = new FoodLogService();

// ---------------------------------------------------------------------------
// Validation helpers
// Requirements: 4.1, 4.2, 5.2, 18.1-18.4 — Properties 6 & 7
// ---------------------------------------------------------------------------

/**
 * Input shape accepted by {@link validateFoodEntry}.
 *
 * Every field is typed `unknown` and optional so that the validator can
 * detect missing, null, or wrongly-typed values and report them as
 * {@link ValidationError}s. Valid inputs (e.g. a `FoodItem`) satisfy this
 * shape structurally.
 */
export interface FoodEntryValidationInput {
  name?: unknown;
  caloriesPer100g?: unknown;
  proteinPer100g?: unknown;
  carbsPer100g?: unknown;
  fatPer100g?: unknown;
}

/**
 * Validate that a serving size is a positive number.
 *
 * Returns an empty array when `grams > 0`. Returns a single
 * `ValidationError` for any value `<= 0` or `NaN` (the `grams > 0` check is
 * false for `NaN`, so it falls through to the error branch).
 *
 * **Validates: Requirement 18.3, Property 7**
 */
export function validateServingSize(grams: number): ValidationError[] {
  if (grams > 0) {
    return [];
  }
  return [{ field: 'servingGrams', message: 'Serving size must be greater than zero' }];
}

/**
 * Validate that every required food field is present and non-negative.
 *
 * `name` must be a non-empty string. `caloriesPer100g`, `proteinPer100g`,
 * `carbsPer100g`, and `fatPer100g` must each be present (not null/undefined),
 * a finite-ish number, `>= 0`, and not `NaN`.
 *
 * Returns one `ValidationError` per invalid field; an empty array signals a
 * fully valid entry.
 *
 * **Validates: Requirements 4.1, 4.2, 5.2, 18.1, 18.2, 18.4 — Property 6**
 */
export function validateFoodEntry(food: FoodEntryValidationInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // name — must be a non-empty string
  if (typeof food.name !== 'string' || food.name === '') {
    errors.push({
      field: 'name',
      message: 'Name is required and must be a non-empty string',
    });
  }

  // Numeric macro fields — present, a number, >= 0, not NaN
  validateNonNegativeNumber(
    food.caloriesPer100g,
    'caloriesPer100g',
    'Calories per 100g',
    errors,
  );
  validateNonNegativeNumber(
    food.proteinPer100g,
    'proteinPer100g',
    'Protein per 100g',
    errors,
  );
  validateNonNegativeNumber(food.carbsPer100g, 'carbsPer100g', 'Carbs per 100g', errors);
  validateNonNegativeNumber(food.fatPer100g, 'fatPer100g', 'Fat per 100g', errors);

  return errors;
}

/**
 * Internal helper: pushes a {@link ValidationError} when `value` is missing,
 * not a number, `NaN`, or negative.
 */
function validateNonNegativeNumber(
  value: unknown,
  field: string,
  label: string,
  errors: ValidationError[],
): void {
  if (value == null || typeof value !== 'number' || Number.isNaN(value)) {
    errors.push({ field, message: `${label} is required and must be a number` });
    return;
  }
  if (value < 0) {
    errors.push({
      field,
      message: `${label} must be greater than or equal to zero`,
    });
  }
}
