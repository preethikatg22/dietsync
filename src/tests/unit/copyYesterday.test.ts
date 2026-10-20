/**
 * Unit tests — FoodLogService.copyYesterday (Requirement 16.1-16.4)
 *
 * Tests that:
 *  1. Entries are deep-copied from yesterday with new UUIDs. (Req 16.1)
 *  2. Source DayLog is never mutated. (Req 16.2)
 *  3. Returns `no_previous_log` when yesterday has no entries. (Req 16.3)
 *  4. Returns `needs_confirmation` when today has entries and mode is absent. (Req 16.4)
 *  5. `mode = "append"` merges copied entries after today's existing entries.
 *  6. `mode = "replace"` discards today's existing entries.
 *  7. A successful copy persists the updated DayLog to storage.
 *  8. Copied entries are field-equal to the source but carry new IDs.
 *
 * **Validates: Requirements 16.1–16.4**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { foodLogService, type CopyYesterdayResult } from '../../services/FoodLogService';
import { storageRepository } from '../../repositories/StorageRepository';
import { STORAGE_KEYS, type DayLog, type LogEntry } from '../../types/index';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schema — used to read the raw persisted log map from storage
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
// Test constants
// ---------------------------------------------------------------------------

const USER_ID = 'test-user-copy-yesterday';

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

const { today: TODAY, yesterday: YESTERDAY } = getTestDates();

/** A minimal LogEntry factory that doesn't require food lookup. */
function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    foodId: 'food-1',
    foodName: 'Test Food',
    servingGrams: 100,
    mealSection: 'breakfast',
    calories: 200,
    protein: 10,
    carbs: 30,
    fat: 5,
    ...overrides,
  };
}

/**
 * Directly write a DayLog map into storage, bypassing FoodLogService, so we
 * can set up precise pre-conditions without going through the food-lookup path.
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
// Setup: clear localStorage between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FoodLogService.copyYesterday', () => {
  // ── no_previous_log ───────────────────────────────────────────────────────

  describe('when yesterday has no log', () => {
    it('returns no_previous_log status', () => {
      const result = foodLogService.copyYesterday(USER_ID, TODAY);
      expect(result.status).toBe('no_previous_log');
    });

    it('includes an informational message referencing the previous date', () => {
      const result = foodLogService.copyYesterday(USER_ID, TODAY);
      expect((result as Extract<CopyYesterdayResult, { status: 'no_previous_log' }>).message)
        .toContain(YESTERDAY);
    });

    it('does not create any DayLog in storage', () => {
      foodLogService.copyYesterday(USER_ID, TODAY);
      const stored = readPersistedLogs(USER_ID);
      expect(Object.keys(stored)).toHaveLength(0);
    });
  });

  describe('when yesterday has an empty entries array', () => {
    it('returns no_previous_log status', () => {
      seedLogs(USER_ID, { [YESTERDAY]: { date: YESTERDAY, entries: [] } });
      const result = foodLogService.copyYesterday(USER_ID, TODAY);
      expect(result.status).toBe('no_previous_log');
    });
  });

  // ── needs_confirmation ────────────────────────────────────────────────────

  describe('when today already has entries and no mode is provided', () => {
    it('returns needs_confirmation status', () => {
      const yesterdayEntry = makeEntry({ id: 'yd-1' });
      const todayEntry = makeEntry({ id: 'td-1' });
      seedLogs(USER_ID, {
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
        [TODAY]: { date: TODAY, entries: [todayEntry] },
      });

      const result = foodLogService.copyYesterday(USER_ID, TODAY);
      expect(result.status).toBe('needs_confirmation');
    });

    it('includes a message mentioning append and replace options', () => {
      const yesterdayEntry = makeEntry();
      const todayEntry = makeEntry();
      seedLogs(USER_ID, {
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
        [TODAY]: { date: TODAY, entries: [todayEntry] },
      });

      const result = foodLogService.copyYesterday(USER_ID, TODAY) as Extract<
        CopyYesterdayResult,
        { status: 'needs_confirmation' }
      >;
      expect(result.message.toLowerCase()).toMatch(/append/);
      expect(result.message.toLowerCase()).toMatch(/replace/);
    });

    it('does not modify today\'s entries when returning needs_confirmation', () => {
      const todayEntry = makeEntry({ id: 'td-original' });
      const yesterdayEntry = makeEntry({ id: 'yd-1' });
      seedLogs(USER_ID, {
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
        [TODAY]: { date: TODAY, entries: [todayEntry] },
      });

      foodLogService.copyYesterday(USER_ID, TODAY); // no mode → needs_confirmation

      const stored = readPersistedLogs(USER_ID);
      expect(stored[TODAY]?.entries).toHaveLength(1);
      expect(stored[TODAY]?.entries[0].id).toBe('td-original');
    });
  });

  // ── success — today is empty ──────────────────────────────────────────────

  describe('when today is empty (no mode needed)', () => {
    it('returns success status with correct copiedCount', () => {
      const e1 = makeEntry({ id: 'yd-1' });
      const e2 = makeEntry({ id: 'yd-2', mealSection: 'lunch' });
      seedLogs(USER_ID, { [YESTERDAY]: { date: YESTERDAY, entries: [e1, e2] } });

      const result = foodLogService.copyYesterday(USER_ID, TODAY);
      expect(result.status).toBe('success');
      expect((result as Extract<CopyYesterdayResult, { status: 'success' }>).copiedCount).toBe(2);
    });

    it('copies entries with new unique IDs (Req 16.1)', () => {
      const sourceEntry = makeEntry({ id: 'source-id-1' });
      seedLogs(USER_ID, { [YESTERDAY]: { date: YESTERDAY, entries: [sourceEntry] } });

      foodLogService.copyYesterday(USER_ID, TODAY);

      const stored = readPersistedLogs(USER_ID);
      const todayEntries = stored[TODAY]?.entries ?? [];
      expect(todayEntries).toHaveLength(1);
      // New UUID must differ from the source entry's ID
      expect(todayEntries[0].id).not.toBe('source-id-1');
    });

    it('copied entry IDs are all distinct from each other', () => {
      const entries = [makeEntry(), makeEntry(), makeEntry()];
      seedLogs(USER_ID, { [YESTERDAY]: { date: YESTERDAY, entries: entries } });

      foodLogService.copyYesterday(USER_ID, TODAY);

      const stored = readPersistedLogs(USER_ID);
      const ids = (stored[TODAY]?.entries ?? []).map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('copied entries are field-equal to source (except id) (Req 16.1)', () => {
      const sourceEntry = makeEntry({ id: 'src-id', calories: 300, protein: 25 });
      seedLogs(USER_ID, { [YESTERDAY]: { date: YESTERDAY, entries: [sourceEntry] } });

      foodLogService.copyYesterday(USER_ID, TODAY);

      const stored = readPersistedLogs(USER_ID);
      const copied = stored[TODAY]?.entries[0];
      expect(copied).toBeDefined();
      // All fields except `id` must match
      const { id: _srcId, ...srcRest } = sourceEntry;
      const { id: _cpyId, ...cpyRest } = copied!;
      expect(cpyRest).toEqual(srcRest);
    });

    it('does NOT mutate the source DayLog (Req 16.2)', () => {
      const originalEntry = makeEntry({ id: 'orig-id' });
      seedLogs(USER_ID, {
        [YESTERDAY]: { date: YESTERDAY, entries: [originalEntry] },
      });

      foodLogService.copyYesterday(USER_ID, TODAY);

      const stored = readPersistedLogs(USER_ID);
      const sourceEntries = stored[YESTERDAY]?.entries ?? [];
      expect(sourceEntries).toHaveLength(1);
      expect(sourceEntries[0].id).toBe('orig-id');
    });

    it('persists the new DayLog to storage', () => {
      const sourceEntry = makeEntry();
      seedLogs(USER_ID, { [YESTERDAY]: { date: YESTERDAY, entries: [sourceEntry] } });

      foodLogService.copyYesterday(USER_ID, TODAY);

      const stored = readPersistedLogs(USER_ID);
      expect(stored[TODAY]).toBeDefined();
      expect(stored[TODAY]?.entries).toHaveLength(1);
    });
  });

  // ── success — mode = "append" ─────────────────────────────────────────────

  describe('mode = "append"', () => {
    it('merges copied entries after today\'s existing entries', () => {
      const todayEntry = makeEntry({ id: 'td-existing', foodName: 'Existing Food' });
      const yesterdayEntry = makeEntry({ id: 'yd-1', foodName: 'Yesterday Food' });
      seedLogs(USER_ID, {
        [TODAY]: { date: TODAY, entries: [todayEntry] },
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
      });

      const result = foodLogService.copyYesterday(USER_ID, TODAY, 'append');
      expect(result.status).toBe('success');

      const stored = readPersistedLogs(USER_ID);
      const entries = stored[TODAY]?.entries ?? [];
      // Today's original entry comes first, then the copied one
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('td-existing');
      expect(entries[1].foodName).toBe('Yesterday Food');
      expect(entries[1].id).not.toBe('yd-1'); // new UUID
    });

    it('returns copiedCount equal to yesterday\'s entry count', () => {
      const todayEntry = makeEntry();
      const y1 = makeEntry();
      const y2 = makeEntry();
      seedLogs(USER_ID, {
        [TODAY]: { date: TODAY, entries: [todayEntry] },
        [YESTERDAY]: { date: YESTERDAY, entries: [y1, y2] },
      });

      const result = foodLogService.copyYesterday(USER_ID, TODAY, 'append') as Extract<
        CopyYesterdayResult,
        { status: 'success' }
      >;
      expect(result.copiedCount).toBe(2);
    });
  });

  // ── success — mode = "replace" ────────────────────────────────────────────

  describe('mode = "replace"', () => {
    it('discards today\'s existing entries and uses only the copied ones', () => {
      const todayEntry = makeEntry({ id: 'td-to-discard' });
      const yesterdayEntry = makeEntry({ id: 'yd-source', foodName: 'Copied Food' });
      seedLogs(USER_ID, {
        [TODAY]: { date: TODAY, entries: [todayEntry] },
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
      });

      const result = foodLogService.copyYesterday(USER_ID, TODAY, 'replace');
      expect(result.status).toBe('success');

      const stored = readPersistedLogs(USER_ID);
      const entries = stored[TODAY]?.entries ?? [];
      expect(entries).toHaveLength(1);
      // Original today entry should be gone
      expect(entries.find((e) => e.id === 'td-to-discard')).toBeUndefined();
      // Copied entry with new ID
      expect(entries[0].foodName).toBe('Copied Food');
      expect(entries[0].id).not.toBe('yd-source');
    });

    it('does NOT mutate the source DayLog after replace (Req 16.2)', () => {
      const todayEntry = makeEntry();
      const yesterdayEntry = makeEntry({ id: 'yd-immutable' });
      seedLogs(USER_ID, {
        [TODAY]: { date: TODAY, entries: [todayEntry] },
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
      });

      foodLogService.copyYesterday(USER_ID, TODAY, 'replace');

      const stored = readPersistedLogs(USER_ID);
      expect(stored[YESTERDAY]?.entries[0].id).toBe('yd-immutable');
    });
  });

  // ── cross-date isolation ──────────────────────────────────────────────────

  describe('cross-date isolation', () => {
    it('leaves other dates in storage untouched after a successful copy', () => {
      // Use a recent date (2 days ago) so it's not pruned by the 90-day threshold
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const otherDate = twoDaysAgo.toISOString().slice(0, 10);
      const otherEntry = makeEntry({ id: 'other-entry' });
      const yesterdayEntry = makeEntry({ id: 'yd-1' });
      seedLogs(USER_ID, {
        [YESTERDAY]: { date: YESTERDAY, entries: [yesterdayEntry] },
        [otherDate]: { date: otherDate, entries: [otherEntry] },
      });

      foodLogService.copyYesterday(USER_ID, TODAY);

      const stored = readPersistedLogs(USER_ID);
      expect(stored[otherDate]?.entries[0].id).toBe('other-entry');
    });
  });
});
