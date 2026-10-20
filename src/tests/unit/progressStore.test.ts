/**
 * Unit tests for the progressStore (Zustand).
 *
 * Verifies that `refresh` loads all four slices from ProgressService and
 * that `addWeightEntry` persists a weight entry and updates the `weightLog`
 * slice. Runs against the real ProgressService + StorageRepository stack
 * (no mocking). An account is created via authStore to obtain a real userId.
 * localStorage is cleared between tests.
 *
 * **Validates: Requirements 8.1-8.4, 9.1-9.8**
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressStore } from '../../stores/progressStore.ts';
import { useAuthStore } from '../../stores/authStore.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';
import {
  STORAGE_KEYS,
  type OnboardingData,
} from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid onboarding profile used to create test accounts. */
function makeProfile(email: string, password = 'password123'): OnboardingData {
  return {
    name: 'Test User',
    email,
    password,
    dob: '1990-01-15',
    sex: 'male',
    heightCm: 175,
    weightKg: 70,
    activityLevel: 'moderately_active',
    goal: 'maintain',
  };
}

/** Create a real account and return its userId. */
async function setupUser(email: string): Promise<string> {
  await useAuthStore.getState().createAccount(makeProfile(email));
  return useAuthStore.getState().currentUser!.userId;
}

/** Reset stores to default state. */
function resetStores(): void {
  useAuthStore.setState({ session: null, currentUser: null });
  useProgressStore.setState({
    streak: 0,
    weeklyStats: null,
    monthlyStats: [],
    weightLog: [],
  });
}

/**
 * Seed a minimal DayLog entry for the given YYYY-MM-DD date strings into
 * localStorage in a single write, so that streak/adherence calculations see
 * logged activity across all provided dates.
 */
function seedLogEntries(userId: string, dateStrs: string[]): void {
  const logs: Record<string, object> = {};
  for (const dateStr of dateStrs) {
    logs[dateStr] = {
      date: dateStr,
      entries: [
        {
          id: `e-${dateStr}`,
          foodId: 'food-1',
          foodName: 'Food',
          servingGrams: 100,
          mealSection: 'lunch',
          calories: 500,
          protein: 10,
          carbs: 60,
          fat: 10,
        },
      ],
    };
  }
  storageRepository.set(STORAGE_KEYS.LOGS(userId), logs);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('progressStore', () => {
  // ── refresh — initial state ──────────────────────────────────────────────

  describe('refresh — initial state', () => {
    /**
     * **Validates: Requirements 9.1-9.8**
     *
     * After a fresh `refresh` with no persisted data, all slices should have
     * safe default values: streak is 0, weeklyStats is a valid object (not
     * null), monthlyStats is an array, and weightLog is empty.
     */
    it('loads all four slices; streak=0, weeklyStats is an object, monthlyStats is an array, weightLog=[]', async () => {
      const userId = await setupUser('refresh1@example.com');
      const today = new Date('2025-06-16');

      useProgressStore.getState().refresh(userId, today);

      const { streak, weeklyStats, monthlyStats, weightLog } =
        useProgressStore.getState();

      expect(streak).toBe(0);

      // weeklyStats should be a non-null object with the expected shape
      expect(weeklyStats).not.toBeNull();
      expect(weeklyStats).toMatchObject({
        weekOf: expect.any(String),
        averageCalories: expect.any(Number),
        daysLogged: expect.any(Number),
        targetCalories: expect.any(Number),
      });
      // No logs → no days logged
      expect(weeklyStats!.daysLogged).toBe(0);
      expect(weeklyStats!.averageCalories).toBe(0);

      // monthlyStats should be an array with one entry per calendar day of
      // the month (June 2025 has 30 days)
      expect(Array.isArray(monthlyStats)).toBe(true);
      expect(monthlyStats).toHaveLength(30);

      expect(weightLog).toEqual([]);
    });
  });

  // ── refresh — streak from logs ───────────────────────────────────────────

  describe('refresh — streak from logs', () => {
    /**
     * **Validates: Requirements 9.3, 9.4, 9.6**
     *
     * After seeding a log entry for "today", refresh should set streak > 0.
     */
    it('sets streak > 0 when today has a seeded log entry', async () => {
      const userId = await setupUser('streak1@example.com');

      // Fix "today" to a known date
      const fixedToday = new Date('2025-06-15T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedToday);

      const todayStr = '2025-06-15';
      seedLogEntries(userId, [todayStr]);

      useProgressStore.getState().refresh(userId, fixedToday);

      expect(useProgressStore.getState().streak).toBeGreaterThan(0);
    });

    /**
     * **Validates: Requirements 9.3, 9.4**
     *
     * Three consecutive logged days produces a streak of 3.
     */
    it('counts consecutive logged days for the streak', async () => {
      const userId = await setupUser('streak2@example.com');

      const fixedToday = new Date('2025-06-15T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedToday);

      // Seed 3 consecutive days ending on today
      seedLogEntries(userId, ['2025-06-13', '2025-06-14', '2025-06-15']);

      useProgressStore.getState().refresh(userId, fixedToday);

      expect(useProgressStore.getState().streak).toBe(3);
    });
  });

  // ── addWeightEntry ───────────────────────────────────────────────────────

  describe('addWeightEntry', () => {
    /**
     * **Validates: Requirements 8.1, 8.2**
     *
     * Adding a weight entry updates the `weightLog` slice.
     */
    it('adds an entry and updates the weightLog slice', async () => {
      const userId = await setupUser('weight1@example.com');

      useProgressStore.getState().addWeightEntry(userId, '2025-06-01', 70);

      const { weightLog } = useProgressStore.getState();
      expect(weightLog).toHaveLength(1);
      expect(weightLog[0]).toEqual({ date: '2025-06-01', weightKg: 70 });
    });

    /**
     * **Validates: Requirements 8.3, 8.4**
     *
     * Multiple entries added in non-chronological order are returned sorted
     * ascending by date.
     */
    it('returns entries sorted ascending by date', async () => {
      const userId = await setupUser('weight2@example.com');

      useProgressStore.getState().addWeightEntry(userId, '2025-06-03', 73);
      useProgressStore.getState().addWeightEntry(userId, '2025-06-01', 71);
      useProgressStore.getState().addWeightEntry(userId, '2025-06-02', 72);

      const { weightLog } = useProgressStore.getState();
      expect(weightLog.map((e) => e.date)).toEqual([
        '2025-06-01',
        '2025-06-02',
        '2025-06-03',
      ]);
      expect(weightLog.map((e) => e.weightKg)).toEqual([71, 72, 73]);
    });

    /**
     * **Validates: Requirements 8.1, 8.2**
     *
     * Adding a second entry for the same date overwrites the first.
     */
    it('overwrites an existing entry for the same date', async () => {
      const userId = await setupUser('weight3@example.com');

      useProgressStore.getState().addWeightEntry(userId, '2025-06-01', 70);
      useProgressStore.getState().addWeightEntry(userId, '2025-06-01', 71.5);

      const { weightLog } = useProgressStore.getState();
      expect(weightLog).toHaveLength(1);
      expect(weightLog[0]).toEqual({ date: '2025-06-01', weightKg: 71.5 });
    });
  });

  // ── refresh reloads weightLog ────────────────────────────────────────────

  describe('refresh reloads weightLog', () => {
    /**
     * **Validates: Requirements 8.3, 8.4, 9.1-9.8**
     *
     * After `addWeightEntry` persists data, resetting the slice to [] and
     * calling `refresh` should restore the weightLog from storage.
     */
    it('restores weightLog from storage after the slice is reset', async () => {
      const userId = await setupUser('reload1@example.com');

      useProgressStore.getState().addWeightEntry(userId, '2025-06-01', 70);
      expect(useProgressStore.getState().weightLog).toHaveLength(1);

      // Simulate a stale / reset slice
      useProgressStore.setState({ weightLog: [] });
      expect(useProgressStore.getState().weightLog).toHaveLength(0);

      // refresh should reload from storage
      useProgressStore.getState().refresh(userId, new Date('2025-06-16'));

      expect(useProgressStore.getState().weightLog).toHaveLength(1);
      expect(useProgressStore.getState().weightLog[0]).toEqual({
        date: '2025-06-01',
        weightKg: 70,
      });
    });
  });
});
