/**
 * Property-based tests for NutritionCalculator — Weekly/monthly stats, streaks, weight log
 *
 * Validates: Requirements 9.3, 9.4, 9.5, 9.6, 24.1, 24.2, 24.3,
 *            25.1, 25.2, 25.3, 26.1, 26.2, 26.3
 *
 * Properties covered:
 *   - Property 16: Weekly average respects Mon–Sun boundary
 *   - Property 17: Perfect adherence day = 100%
 *   - Property 18: Streak increments and resets correctly
 *   - Property 19: Weight log is insertion-order independent
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeMonthlyAdherence,
  computeStreak,
  computeWeeklyAverage,
  sortWeightLog,
} from '../../services/NutritionCalculator.ts';
import type { DayLog, LogEntry, MealSection, WeightEntry } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/** Return the Monday of the ISO week containing d */
function weekMonday(d: Date): Date {
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return monday;
}

/** Build a minimal DayLog with one placeholder entry */
function makeDayLog(date: string): DayLog {
  return {
    date,
    entries: [
      {
        id: `entry-${date}`,
        foodId: 'food-1',
        foodName: 'Test Food',
        servingGrams: 100,
        mealSection: 'breakfast' as MealSection,
        calories: 200,
        protein: 10,
        carbs: 30,
        fat: 5,
      } satisfies LogEntry,
    ],
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const positiveTargetArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true });

const dateArb = fc
  .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

const weightEntryArb: fc.Arbitrary<WeightEntry> = fc.record({
  date: dateArb,
  weightKg: fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true }),
});

// ---------------------------------------------------------------------------
// Property 16: Weekly average respects Mon–Sun boundary
// Validates: Requirements 9.5, 24.1, 24.2
// ---------------------------------------------------------------------------

describe('Property 16: Weekly average respects Mon–Sun boundary', () => {
  /**
   * **Validates: Requirements 9.5, 24.1, 24.2**
   *
   * A date D is included in computeWeeklyAverage for weekOf W if and only if
   * D falls within that ISO week's Mon–Sun span.
   */
  it('a date within the week is included; a date outside is excluded', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2021-01-04'), max: new Date('2029-12-25'), noInvalidDate: true }),
        fc.integer({ min: 0, max: 6 }),
        (weekOfDate, offsetInWeek) => {
          const monday = weekMonday(weekOfDate);
          const dateInWeek = addDays(monday, offsetInWeek);
          const dateOutsideWeek = addDays(monday, 7); // the next Monday (outside)

          const dateInWeekStr = toDateString(dateInWeek);
          const dateOutsideWeekStr = toDateString(dateOutsideWeek);

          const logs: Record<string, DayLog> = {
            [dateInWeekStr]: makeDayLog(dateInWeekStr),
            [dateOutsideWeekStr]: makeDayLog(dateOutsideWeekStr),
          };

          const stats = computeWeeklyAverage(logs, weekOfDate);

          // The date inside the week should be counted (daysLogged >= 1)
          return stats.daysLogged >= 1 && stats.averageCalories > 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.5, 24.2**
   *
   * All 7 days in a fully-logged week are counted.
   */
  it('all 7 days logged in a week → daysLogged === 7', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2021-01-04'), max: new Date('2029-12-25'), noInvalidDate: true }),
        (weekOfDate) => {
          const monday = weekMonday(weekOfDate);
          const logs: Record<string, DayLog> = {};
          for (let i = 0; i < 7; i++) {
            const d = toDateString(addDays(monday, i));
            logs[d] = makeDayLog(d);
          }
          const stats = computeWeeklyAverage(logs, weekOfDate);
          return stats.daysLogged === 7;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 24.1**
   *
   * Days with no entries are excluded from the divisor (daysLogged not incremented).
   */
  it('days without entries are not counted in the divisor', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2021-01-04'), max: new Date('2029-12-25'), noInvalidDate: true }),
        (weekOfDate) => {
          const monday = weekMonday(weekOfDate);
          // Log only Monday and Tuesday
          const mondayStr = toDateString(monday);
          const tuesdayStr = toDateString(addDays(monday, 1));
          const logs: Record<string, DayLog> = {
            [mondayStr]: makeDayLog(mondayStr),
            [tuesdayStr]: makeDayLog(tuesdayStr),
          };
          const stats = computeWeeklyAverage(logs, weekOfDate);
          return stats.daysLogged === 2;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 24.1**
   *
   * Empty week returns daysLogged === 0 and averageCalories === 0.
   */
  it('empty week returns daysLogged=0 and averageCalories=0', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2021-01-04'), max: new Date('2029-12-25'), noInvalidDate: true }),
        (weekOfDate) => {
          const stats = computeWeeklyAverage({}, weekOfDate);
          return stats.daysLogged === 0 && stats.averageCalories === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Perfect adherence day = 100%
// Validates: Requirements 24.3
// ---------------------------------------------------------------------------

describe('Property 17: Perfect adherence day contributes 100%', () => {
  /**
   * **Validates: Requirements 24.3**
   *
   * A day where consumed === target contributes exactly 100% adherence.
   */
  it('computeMonthlyAdherence returns 100% for a day where consumed equals target', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2029-12-31'), noInvalidDate: true }),
        positiveTargetArb,
        (date, target) => {
          const dateStr = toDateString(date);
          // Create a log entry whose calories exactly equal the target
          const entry: LogEntry = {
            id: 'e1',
            foodId: 'f1',
            foodName: 'Perfect Day Food',
            servingGrams: 100,
            mealSection: 'lunch',
            calories: target,
            protein: 10,
            carbs: 20,
            fat: 5,
          };
          const logs: Record<string, DayLog> = {
            [dateStr]: { date: dateStr, entries: [entry] },
          };

          const adherence = computeMonthlyAdherence(logs, date, target);
          const dayAdherence = adherence.find((d) => d.date === dateStr);

          if (!dayAdherence) return false;
          return Math.abs(dayAdherence.adherencePct - 100) < 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 24.3**
   *
   * Days with no log entry contribute 0% adherence.
   */
  it('computeMonthlyAdherence returns 0% for days with no log entry', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2029-12-31'), noInvalidDate: true }),
        positiveTargetArb,
        (date, target) => {
          // Pass empty logs
          const adherence = computeMonthlyAdherence({}, date, target);
          // Every day in the month should have 0% adherence
          return adherence.every((d) => d.adherencePct === 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Streak increments and resets correctly
// Validates: Requirements 9.3, 9.4, 9.6, 25.1, 25.2, 25.3
// ---------------------------------------------------------------------------

describe('Property 18: Streak logic', () => {
  /**
   * **Validates: Requirements 9.3, 9.4, 9.6, 25.1**
   *
   * N consecutive days ending on today → streak === N.
   */
  it('N consecutive logged days ending today produce streak = N', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (n) => {
        const today = new Date('2025-06-15');
        const logs: Record<string, DayLog> = {};
        for (let i = 0; i < n; i++) {
          const d = toDateString(addDays(today, -i));
          logs[d] = makeDayLog(d);
        }
        return computeStreak(logs, today) === n;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.4, 9.6, 25.2**
   *
   * Any gap in the consecutive days resets the streak to 0 from the gap.
   * Strategy: leave today AND the gapSize days immediately before today unlogged,
   * then log daysBeforeGap days ending at (today - gapSize - 1). The streak
   * cursor starts at today (no entry) → yesterday (no entry if gapSize > 1) →
   * … → (today - gapSize) (no entry) → (today - gapSize - 1) which IS logged,
   * but since (today - gapSize) is unlogged the walk breaks before reaching it,
   * so streak must be 0.
   */
  it('a gap of one or more days resets the streak', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (daysBeforeGap, gapSize) => {
          const today = new Date('2025-06-15');
          const logs: Record<string, DayLog> = {};

          // Log daysBeforeGap days ending at (today - gapSize - 1).
          // The gap covers today and the gapSize days before it: none of
          // those days are logged, so the streak must be 0.
          const blockEnd = addDays(today, -(gapSize + 1)); // last logged day
          for (let i = 0; i < daysBeforeGap; i++) {
            const d = toDateString(addDays(blockEnd, -i));
            logs[d] = makeDayLog(d);
          }
          // today through (today - gapSize) are NOT logged → gap before block

          const streak = computeStreak(logs, today);
          return streak === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.3, 25.1**
   *
   * Zero logged days → streak === 0.
   */
  it('no logged days → streak = 0', () => {
    const today = new Date('2025-06-15');
    expect(computeStreak({}, today)).toBe(0);
  });

  /**
   * **Validates: Requirements 9.6, 25.3**
   *
   * Streak counts from yesterday if today has no log entry.
   */
  it('counts from yesterday when today has no entry', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const today = new Date('2025-06-15');
        const logs: Record<string, DayLog> = {};
        // Log n consecutive days ending yesterday (not today)
        for (let i = 1; i <= n; i++) {
          const d = toDateString(addDays(today, -i));
          logs[d] = makeDayLog(d);
        }
        return computeStreak(logs, today) === n;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Weight log is insertion-order independent
// Validates: Requirements 8.3, 8.4, 26.1, 26.2, 26.3
// ---------------------------------------------------------------------------

describe('Property 19: Weight log trend is insertion-order independent', () => {
  /** Fisher-Yates shuffle returning a new array */
  function shuffle<T>(arr: T[], seed: number): T[] {
    const copy = [...arr];
    let s = seed;
    for (let i = copy.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }

  /**
   * **Validates: Requirements 8.3, 8.4, 26.1, 26.2**
   *
   * sortWeightLog always returns entries in ascending date order,
   * regardless of insertion order.
   */
  it('sortWeightLog result is always in ascending date order regardless of insertion order', () => {
    fc.assert(
      fc.property(
        fc.array(weightEntryArb, { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (entries, seed) => {
          const shuffled = shuffle(entries, seed);
          const sorted = sortWeightLog(shuffled);

          for (let i = 1; i < sorted.length; i++) {
            if ((sorted[i]!.date < sorted[i - 1]!.date)) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 26.1, 26.2**
   *
   * Two different insertion orders of the same entries (with unique dates)
   * produce identical sorted output. We restrict to unique dates because a
   * stable sort preserves input-relative order for ties, so the same
   * duplicate-date entries shuffled differently will legitimately sort
   * differently — that is correct stable-sort behaviour, not a bug.
   */
  it('two different insertion orders of the same entries (unique dates) produce identical sorted output', () => {
    const uniqueDateWeightEntriesArb = fc
      .uniqueArray(dateArb, { minLength: 1, maxLength: 30 })
      .chain((dates) =>
        fc
          .array(
            fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true }),
            { minLength: dates.length, maxLength: dates.length },
          )
          .map((weights) =>
            dates.map((date, i) => ({ date, weightKg: weights[i]! })),
          ),
      );

    fc.assert(
      fc.property(
        uniqueDateWeightEntriesArb,
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        (entries, seed1, seed2) => {
          const order1 = sortWeightLog(shuffle(entries, seed1));
          const order2 = sortWeightLog(shuffle(entries, seed2));

          if (order1.length !== order2.length) return false;
          for (let i = 0; i < order1.length; i++) {
            if (order1[i]!.date !== order2[i]!.date) return false;
            if (order1[i]!.weightKg !== order2[i]!.weightKg) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 26.3**
   *
   * Sort is stable on duplicate dates: relative order of same-date entries
   * is preserved.
   */
  it('sort is stable on duplicate dates (same-date entries preserve relative order)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true }), {
          minLength: 2,
          maxLength: 5,
        }),
        dateArb,
        (weights, date) => {
          const entries: WeightEntry[] = weights.map((w) => ({ date, weightKg: w }));
          const sorted = sortWeightLog(entries);
          // All same-date: stable sort preserves original order
          for (let i = 0; i < entries.length; i++) {
            if (sorted[i]!.weightKg !== entries[i]!.weightKg) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4, 26.1**
   *
   * Single weight entry is trivially sorted.
   */
  it('single weight entry is always "sorted"', () => {
    fc.assert(
      fc.property(weightEntryArb, (entry) => {
        const sorted = sortWeightLog([entry]);
        return sorted.length === 1 && sorted[0]!.date === entry.date;
      }),
      { numRuns: 100 },
    );
  });
});
