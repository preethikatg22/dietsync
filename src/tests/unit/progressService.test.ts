// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for ProgressService
//
// These tests verify the data-loading wrapper: that ProgressService loads
// persisted logs/goals/weight from StorageRepository, delegates to the pure
// NutritionCalculator functions, overlays the persisted calorie target, and
// persists weight writes. The pure functions themselves are covered by the
// NutritionCalculator property tests; here we exercise the I/O glue.
//
// Validates: Requirements 8.1-8.4, 9.1-9.8
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { describe, expect, it, beforeEach } from 'vitest';
import { progressService } from '../../services/ProgressService';
import { storageRepository } from '../../repositories/StorageRepository';
import { STORAGE_KEYS, type DayLog, type LogEntry, type NutritionGoals } from '../../types/index';

// Schema mirror for asserting raw storage contents in overwrite tests.
const weightRecordSchema = z.record(z.string(), z.number());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'test-user';

/** Build a minimal LogEntry carrying the given calories. */
function makeEntry(id: string, calories: number): LogEntry {
  return {
    id,
    foodId: 'food-1',
    foodName: 'Test Food',
    servingGrams: 100,
    mealSection: 'breakfast',
    calories,
    protein: 10,
    carbs: 20,
    fat: 5,
  };
}

/** Build a DayLog for a date with one entry of the given calories. */
function makeDayLog(date: string, calories: number): DayLog {
  return { date, entries: [makeEntry(`entry-${date}`, calories)] };
}

/** Persist a logs record directly into storage. */
function setLogs(userId: string, logs: Record<string, DayLog>): void {
  storageRepository.set(STORAGE_KEYS.LOGS(userId), logs);
}

/** Persist nutrition goals directly into storage. */
function setGoals(userId: string, goals: NutritionGoals): void {
  storageRepository.set(STORAGE_KEYS.GOALS(userId), goals);
}

/** Format a Date as YYYY-MM-DD in local time. */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Add `days` calendar days to `d`, returning a new Date. */
function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ProgressService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── getWeeklyStats ──────────────────────────────────────────────────────

  describe('getWeeklyStats', () => {
    it('computes the weekly average from persisted logs and overlays the goal target', () => {
      // 2025-06-16 is a Monday
      const monday = new Date('2025-06-16');
      const mondayStr = toDateString(monday);
      const tuesdayStr = toDateString(addDays(monday, 1));

      setLogs(USER_ID, {
        [mondayStr]: makeDayLog(mondayStr, 200),
        [tuesdayStr]: makeDayLog(tuesdayStr, 300),
      });
      setGoals(USER_ID, {
        calorieTarget: 2000,
        proteinPct: 30,
        carbsPct: 40,
        fatPct: 30,
        isManual: false,
      });

      const stats = progressService.getWeeklyStats(USER_ID, monday);

      expect(stats.weekOf).toBe(mondayStr);
      expect(stats.daysLogged).toBe(2);
      // average = (200 + 300) / 2
      expect(stats.averageCalories).toBe(250);
      // target overlaid from persisted goals
      expect(stats.targetCalories).toBe(2000);
    });

    it('returns 0 average and 0 daysLogged for an empty week', () => {
      const stats = progressService.getWeeklyStats(USER_ID, new Date('2025-06-16'));
      expect(stats.daysLogged).toBe(0);
      expect(stats.averageCalories).toBe(0);
    });

    it('defaults targetCalories to 0 when no goals are configured', () => {
      const monday = new Date('2025-06-16');
      const mondayStr = toDateString(monday);
      setLogs(USER_ID, { [mondayStr]: makeDayLog(mondayStr, 500) });

      const stats = progressService.getWeeklyStats(USER_ID, monday);

      expect(stats.targetCalories).toBe(0);
      expect(stats.daysLogged).toBe(1);
    });

    it('excludes days outside the Mon–Sun boundary', () => {
      const monday = new Date('2025-06-16');
      const mondayStr = toDateString(monday);
      const nextMondayStr = toDateString(addDays(monday, 7)); // outside the week

      setLogs(USER_ID, {
        [mondayStr]: makeDayLog(mondayStr, 200),
        [nextMondayStr]: makeDayLog(nextMondayStr, 9999),
      });

      const stats = progressService.getWeeklyStats(USER_ID, monday);

      expect(stats.daysLogged).toBe(1);
      expect(stats.averageCalories).toBe(200);
    });

    it('weekOf is the Monday of the week containing weekOf', () => {
      // 2025-06-18 is a Wednesday; its week's Monday is 2025-06-16
      const stats = progressService.getWeeklyStats(USER_ID, new Date('2025-06-18'));
      expect(stats.weekOf).toBe('2025-06-16');
    });
  });

  // ── getMonthlyAdherence ────────────────────────────────────────────────

  describe('getMonthlyAdherence', () => {
    it('computes per-day adherence using the persisted calorie target', () => {
      const date = new Date('2025-06-15');
      const dateStr = toDateString(date);
      const target = 2000;

      setGoals(USER_ID, {
        calorieTarget: target,
        proteinPct: 30,
        carbsPct: 40,
        fatPct: 30,
        isManual: false,
      });
      // One day consuming exactly the target → 100% adherence
      setLogs(USER_ID, { [dateStr]: makeDayLog(dateStr, target) });

      const adherence = progressService.getMonthlyAdherence(USER_ID, date);

      // June has 30 days
      expect(adherence).toHaveLength(30);

      const dayAdherence = adherence.find((d) => d.date === dateStr);
      expect(dayAdherence).toBeDefined();
      expect(dayAdherence!.adherencePct).toBeCloseTo(100, 9);

      // All other days have 0% adherence
      const otherDays = adherence.filter((d) => d.date !== dateStr);
      expect(otherDays.every((d) => d.adherencePct === 0)).toBe(true);
    });

    it('uses 0 as the calorie target when no goals are configured', () => {
      const date = new Date('2025-06-15');
      const dateStr = toDateString(date);
      setLogs(USER_ID, { [dateStr]: makeDayLog(dateStr, 500) });

      const adherence = progressService.getMonthlyAdherence(USER_ID, date);

      // With target 0 the pure function returns 0% for every day
      expect(adherence.every((d) => d.adherencePct === 0)).toBe(true);
    });
  });

  // ── getStreak ──────────────────────────────────────────────────────────

  describe('getStreak', () => {
    it('counts consecutive logged days ending on today', () => {
      const today = new Date('2025-06-15');
      const logs: Record<string, DayLog> = {};
      for (let i = 0; i < 3; i++) {
        const d = toDateString(addDays(today, -i));
        logs[d] = makeDayLog(d, 200);
      }
      setLogs(USER_ID, logs);

      expect(progressService.getStreak(USER_ID, today)).toBe(3);
    });

    it('returns 0 when no days are logged', () => {
      expect(progressService.getStreak(USER_ID, new Date('2025-06-15'))).toBe(0);
    });

    it('counts from yesterday when today has no entry', () => {
      const today = new Date('2025-06-15');
      const logs: Record<string, DayLog> = {};
      // Log yesterday and the day before — not today
      for (let i = 1; i <= 2; i++) {
        const d = toDateString(addDays(today, -i));
        logs[d] = makeDayLog(d, 200);
      }
      setLogs(USER_ID, logs);

      expect(progressService.getStreak(USER_ID, today)).toBe(2);
    });
  });

  // ── getWeightLog ───────────────────────────────────────────────────────

  describe('getWeightLog', () => {
    it('loads weight entries and returns them sorted ascending by date', () => {
      // Persist out of order — storage holds Record<YYYY-MM-DD, number>
      storageRepository.set(STORAGE_KEYS.WEIGHT(USER_ID), {
        '2025-06-20': 75,
        '2025-06-18': 76,
        '2025-06-19': 74.5,
      });

      const log = progressService.getWeightLog(USER_ID);

      expect(log).toHaveLength(3);
      expect(log.map((e) => e.date)).toEqual([
        '2025-06-18',
        '2025-06-19',
        '2025-06-20',
      ]);
      expect(log.map((e) => e.weightKg)).toEqual([76, 74.5, 75]);
    });

    it('returns an empty array when no weight entries exist', () => {
      expect(progressService.getWeightLog(USER_ID)).toEqual([]);
    });

    it('returns WeightEntry objects with date and weightKg fields', () => {
      storageRepository.set(STORAGE_KEYS.WEIGHT(USER_ID), { '2025-06-01': 70 });

      const log = progressService.getWeightLog(USER_ID);
      expect(log[0]).toEqual({ date: '2025-06-01', weightKg: 70 });
    });
  });

  // ── addWeightEntry ─────────────────────────────────────────────────────

  describe('addWeightEntry', () => {
    it('adds a new weight entry and persists it', () => {
      const result = progressService.addWeightEntry(USER_ID, '2025-06-01', 70);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2025-06-01', weightKg: 70 });

      // Persisted to storage — readable through getWeightLog
      const reloaded = progressService.getWeightLog(USER_ID);
      expect(reloaded).toEqual([{ date: '2025-06-01', weightKg: 70 }]);
    });

    it('overwrites an existing entry for the same date', () => {
      progressService.addWeightEntry(USER_ID, '2025-06-01', 70);
      const result = progressService.addWeightEntry(USER_ID, '2025-06-01', 71.5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2025-06-01', weightKg: 71.5 });

      // Storage holds a single entry for that date
      const raw = storageRepository.get(
        STORAGE_KEYS.WEIGHT(USER_ID),
        weightRecordSchema,
        {},
      );
      expect(raw['2025-06-01']).toBe(71.5);
    });

    it('returns the full sorted log after adding multiple entries', () => {
      // Add out of chronological order
      progressService.addWeightEntry(USER_ID, '2025-06-03', 73);
      progressService.addWeightEntry(USER_ID, '2025-06-01', 71);
      const result = progressService.addWeightEntry(USER_ID, '2025-06-02', 72);

      expect(result.map((e) => e.date)).toEqual([
        '2025-06-01',
        '2025-06-02',
        '2025-06-03',
      ]);
      expect(result.map((e) => e.weightKg)).toEqual([71, 72, 73]);
    });
  });
});
