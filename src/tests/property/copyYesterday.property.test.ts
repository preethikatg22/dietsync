/**
 * Property-based tests — FoodLogService.copyYesterday (Property 24)
 *
 * **Validates: Requirements 16.1, 16.2, 28.3, 28.4**
 *
 * Properties covered:
 *   - Property 24a: Copied entries are field-equal to source entries (except id)
 *   - Property 24b: All copied entry IDs are unique and differ from source IDs
 *   - Property 24c: The source DayLog remains unchanged after the copy (isolation)
 *   - Property 24d: Count of copied entries equals count of source entries
 */

import * as fc from 'fast-check';
import { z } from 'zod';
import { beforeEach, describe, it, expect } from 'vitest';
import { foodLogService } from '../../services/FoodLogService';
import { storageRepository } from '../../repositories/StorageRepository';
import { STORAGE_KEYS, type DayLog, type LogEntry } from '../../types/index';

// ---------------------------------------------------------------------------
// Zod schemas — for reading raw persisted logs from storage
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

const AllLogsSchema = z.record(z.string(), DayLogSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute today and yesterday as YYYY-MM-DD strings at runtime so that the
 * log pruning threshold (90 days) never strips test data.
 */
function getTestDates(): { today: string; yesterday: string } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const yd = new Date(now);
  yd.setDate(yd.getDate() - 1);
  const yesterdayStr = yd.toISOString().slice(0, 10);

  return { today: todayStr, yesterday: yesterdayStr };
}

/**
 * Write a DayLog map directly into storage, bypassing FoodLogService, so we
 * can set up precise pre-conditions.
 */
function seedLogs(userId: string, logs: Record<string, DayLog>): void {
  storageRepository.set(STORAGE_KEYS.LOGS(userId), logs);
}

/**
 * Read the raw persisted DayLog map from storage.
 */
function readPersistedLogs(userId: string): Record<string, DayLog> {
  return storageRepository.get(STORAGE_KEYS.LOGS(userId), AllLogsSchema, {});
}

// ---------------------------------------------------------------------------
// fast-check Arbitraries (from design.md)
// ---------------------------------------------------------------------------

const mealSectionArb = fc.constantFrom(
  'breakfast' as const,
  'lunch' as const,
  'dinner' as const,
  'snacks' as const,
);

const logEntryArb = fc.record({
  id: fc.string({ minLength: 1 }),
  foodId: fc.string({ minLength: 1 }),
  foodName: fc.string({ minLength: 1 }),
  servingGrams: fc.float({ min: Math.fround(0.01), max: Math.fround(2000), noNaN: true }),
  mealSection: mealSectionArb,
  calories: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
  protein: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
  carbs: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
  fat: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
});

const dayLogEntriesArb = fc.array(logEntryArb, { minLength: 1, maxLength: 20 });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const USER_ID = 'test-user-copy-yesterday-property';

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Property 24a — Field equality (Req 16.1, 28.3)
// ---------------------------------------------------------------------------

describe('Property 24a: Copied entries are field-equal to source entries (except id)', () => {
  /**
   * **Validates: Requirements 16.1, 28.3**
   *
   * For any array of arbitrary LogEntry values seeded as yesterday's log,
   * after a successful copy every copied entry (by position) has the same
   * `foodId`, `foodName`, `servingGrams`, `mealSection`, `calories`,
   * `protein`, `carbs`, `fat` as the source entry.
   * Only the `id` field must differ.
   */
  it('each copied entry matches all source fields except id', () => {
    const { today, yesterday } = getTestDates();

    fc.assert(
      fc.property(dayLogEntriesArb, (sourceEntries) => {
        localStorage.clear();

        seedLogs(USER_ID, {
          [yesterday]: { date: yesterday, entries: sourceEntries as LogEntry[] },
        });

        const result = foodLogService.copyYesterday(USER_ID, today);
        expect(result.status).toBe('success');

        const stored = readPersistedLogs(USER_ID);
        const copiedEntries = stored[today]?.entries ?? [];

        expect(copiedEntries).toHaveLength(sourceEntries.length);

        sourceEntries.forEach((srcEntry, idx) => {
          const copied = copiedEntries[idx];
          expect(copied).toBeDefined();

          // id must be different
          expect(copied.id).not.toBe(srcEntry.id);

          // All other fields must be identical
          expect(copied.foodId).toBe(srcEntry.foodId);
          expect(copied.foodName).toBe(srcEntry.foodName);
          expect(copied.servingGrams).toBe(srcEntry.servingGrams);
          expect(copied.mealSection).toBe(srcEntry.mealSection);
          expect(copied.calories).toBe(srcEntry.calories);
          expect(copied.protein).toBe(srcEntry.protein);
          expect(copied.carbs).toBe(srcEntry.carbs);
          expect(copied.fat).toBe(srcEntry.fat);
        });
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 24b — ID uniqueness (Req 16.1)
// ---------------------------------------------------------------------------

describe('Property 24b: All copied entry IDs are unique and differ from source IDs', () => {
  /**
   * **Validates: Requirements 16.1**
   *
   * For any yesterday log with N entries:
   *  - All N copied entry IDs are distinct from each other.
   *  - None of the N copied IDs equals any of the source IDs.
   */
  it('all copied IDs are mutually unique and differ from every source ID', () => {
    const { today, yesterday } = getTestDates();

    fc.assert(
      fc.property(dayLogEntriesArb, (sourceEntries) => {
        localStorage.clear();

        seedLogs(USER_ID, {
          [yesterday]: { date: yesterday, entries: sourceEntries as LogEntry[] },
        });

        const result = foodLogService.copyYesterday(USER_ID, today);
        expect(result.status).toBe('success');

        const stored = readPersistedLogs(USER_ID);
        const copiedIds = (stored[today]?.entries ?? []).map((e) => e.id);
        const sourceIds = new Set(sourceEntries.map((e) => e.id));

        // All copied IDs must be distinct from one another
        expect(new Set(copiedIds).size).toBe(copiedIds.length);

        // No copied ID must match any source ID
        for (const copiedId of copiedIds) {
          expect(sourceIds.has(copiedId)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 24c — Source immutability (Req 16.2, 28.4)
// ---------------------------------------------------------------------------

describe('Property 24c: Source DayLog remains unchanged after copy (isolation guarantee)', () => {
  /**
   * **Validates: Requirements 16.2, 28.4**
   *
   * For any yesterday log and any modification applied to today's entries
   * after the copy, the source DayLog (yesterday's) remains field-by-field
   * equal to what it was before the copy.
   */
  it('yesterday DayLog is unchanged after a successful copy', () => {
    const { today, yesterday } = getTestDates();

    fc.assert(
      fc.property(dayLogEntriesArb, (sourceEntries) => {
        localStorage.clear();

        // Deep-clone source entries before seeding to capture the original state
        const originalEntries: LogEntry[] = sourceEntries.map((e) => ({ ...e }));

        seedLogs(USER_ID, {
          [yesterday]: { date: yesterday, entries: sourceEntries as LogEntry[] },
        });

        foodLogService.copyYesterday(USER_ID, today);

        // Read persisted state and verify yesterday is unmodified
        const stored = readPersistedLogs(USER_ID);
        const storedYesterday = stored[yesterday];

        expect(storedYesterday).toBeDefined();
        expect(storedYesterday!.date).toBe(yesterday);
        expect(storedYesterday!.entries).toHaveLength(originalEntries.length);

        originalEntries.forEach((orig, idx) => {
          const persisted = storedYesterday!.entries[idx];
          expect(persisted.id).toBe(orig.id);
          expect(persisted.foodId).toBe(orig.foodId);
          expect(persisted.foodName).toBe(orig.foodName);
          expect(persisted.servingGrams).toBe(orig.servingGrams);
          expect(persisted.mealSection).toBe(orig.mealSection);
          expect(persisted.calories).toBe(orig.calories);
          expect(persisted.protein).toBe(orig.protein);
          expect(persisted.carbs).toBe(orig.carbs);
          expect(persisted.fat).toBe(orig.fat);
        });
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 16.2, 28.4**
   *
   * Mutating today's entries after the copy does NOT alter yesterday's source.
   * Simulates a post-copy mutation by directly overwriting today's storage,
   * then verifies yesterday is still intact.
   */
  it('mutating today after copy does not alter the source DayLog', () => {
    const { today, yesterday } = getTestDates();

    fc.assert(
      fc.property(dayLogEntriesArb, logEntryArb, (sourceEntries, extraEntry) => {
        localStorage.clear();

        const originalEntries: LogEntry[] = sourceEntries.map((e) => ({ ...e }));

        seedLogs(USER_ID, {
          [yesterday]: { date: yesterday, entries: sourceEntries as LogEntry[] },
        });

        foodLogService.copyYesterday(USER_ID, today);

        // Simulate a post-copy mutation: overwrite today's entries in storage
        const storedAfterCopy = readPersistedLogs(USER_ID);
        const mutatedTodayLog: DayLog = {
          date: today,
          entries: [...(storedAfterCopy[today]?.entries ?? []), extraEntry as LogEntry],
        };
        storageRepository.set(STORAGE_KEYS.LOGS(USER_ID), {
          ...storedAfterCopy,
          [today]: mutatedTodayLog,
        });

        // Yesterday must still be untouched
        const storedAfterMutation = readPersistedLogs(USER_ID);
        const storedYesterday = storedAfterMutation[yesterday];

        expect(storedYesterday).toBeDefined();
        expect(storedYesterday!.entries).toHaveLength(originalEntries.length);

        originalEntries.forEach((orig, idx) => {
          const persisted = storedYesterday!.entries[idx];
          expect(persisted.id).toBe(orig.id);
          expect(persisted.foodId).toBe(orig.foodId);
          expect(persisted.foodName).toBe(orig.foodName);
        });
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 24d — Count preservation
// ---------------------------------------------------------------------------

describe('Property 24d: Copied DayLog entry count equals source entry count', () => {
  /**
   * **Validates: Requirements 16.1**
   *
   * For any N source entries, the copied DayLog has exactly N entries and
   * the `copiedCount` field in the result equals N.
   */
  it('copied entry count equals source entry count', () => {
    const { today, yesterday } = getTestDates();

    fc.assert(
      fc.property(dayLogEntriesArb, (sourceEntries) => {
        localStorage.clear();

        seedLogs(USER_ID, {
          [yesterday]: { date: yesterday, entries: sourceEntries as LogEntry[] },
        });

        const result = foodLogService.copyYesterday(USER_ID, today);
        expect(result.status).toBe('success');

        const copiedCount = (result as Extract<typeof result, { status: 'success' }>).copiedCount;
        expect(copiedCount).toBe(sourceEntries.length);

        const stored = readPersistedLogs(USER_ID);
        expect(stored[today]?.entries).toHaveLength(sourceEntries.length);
      }),
      { numRuns: 100 },
    );
  });
});
