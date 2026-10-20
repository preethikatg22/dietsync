/**
 * Property-based tests for WaterService
 *
 * Validates: Requirements 27.1, 27.2
 *
 * Properties covered:
 *   - Property 22a: N additions sum to arithmetic total (Req 27.1 / Req 14.5)
 *   - Property 22b: Totals for distinct dates are independent (Req 27.2 / Req 14.4)
 *
 * Unit tests:
 *   - A new/untracked date starts at 0 (Req 14.4)
 */

import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { WaterService } from '../../services/WaterService';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let waterService: WaterService;

beforeEach(() => {
  // Clear localStorage before each test to prevent cross-contamination
  localStorage.clear();
  // Create a fresh WaterService instance so the singleton state is isolated
  waterService = new WaterService();
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty user ID string */
const userIdArb = fc.string({ minLength: 1, maxLength: 36 });

/** Calendar date string in YYYY-MM-DD format.
 *  Uses integer epoch timestamps (matching storageRepository pattern) to avoid
 *  invalid-date edge cases during fast-check shrinking.
 */
const dateArb = fc
  .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

/** Positive amount in millilitres (1–1000) */
const amountArb = fc.float({ min: 1, max: 1000, noNaN: true });

/** Non-empty array of positive amounts (1–20 items) */
const amountsArrayArb = fc.array(fc.float({ min: 1, max: 1000, noNaN: true }), {
  minLength: 1,
  maxLength: 20,
});

/** Two distinct calendar date strings */
const twoDistinctDatesArb = fc
  .tuple(dateArb, dateArb)
  .filter(([d1, d2]) => d1 !== d2);

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('WaterService — unit tests', () => {
  /**
   * Req 14.4: A new calendar day starts at 0.
   */
  it('returns 0 for a date that has never been tracked', () => {
    const userId = 'user-unit-test';
    const date = '2025-06-15';

    const result = waterService.getWater(userId, date);

    expect(result).toBe(0);
  });

  it('returns 0 for a fresh userId on any date', () => {
    expect(waterService.getWater('brand-new-user', '2024-01-01')).toBe(0);
    expect(waterService.getWater('brand-new-user', '2024-12-31')).toBe(0);
  });

  it('addWater returns the cumulative total after a single addition', () => {
    const total = waterService.addWater('user-a', '2025-01-01', 500);
    expect(total).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Property 22a: N additions sum to arithmetic total
// Validates: Requirements 27.1
// ---------------------------------------------------------------------------

describe('Property 22a: N additions sum to arithmetic total', () => {
  /**
   * **Validates: Requirements 27.1**
   *
   * For any userId, date, and non-empty array of positive amounts, after
   * calling addWater N times the value returned by getWater equals the
   * arithmetic sum of all amounts added.
   */
  it('getWater equals the sum of all addWater calls on the same date', () => {
    fc.assert(
      fc.property(userIdArb, dateArb, amountsArrayArb, (userId, date, amounts) => {
        // Clear localStorage for isolation within each property run
        localStorage.clear();

        // Add each amount individually
        for (const amount of amounts) {
          waterService.addWater(userId, date, amount);
        }

        const total = waterService.getWater(userId, date);
        const expectedSum = amounts.reduce((acc, a) => acc + a, 0);

        // Allow small floating-point tolerance
        expect(total).toBeCloseTo(expectedSum, 5);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 27.1**
   *
   * The return value of addWater always equals getWater called immediately
   * after — the two are consistent.
   */
  it('addWater return value matches getWater immediately after', () => {
    fc.assert(
      fc.property(userIdArb, dateArb, amountsArrayArb, (userId, date, amounts) => {
        localStorage.clear();

        let lastReturnValue = 0;
        for (const amount of amounts) {
          lastReturnValue = waterService.addWater(userId, date, amount);
        }

        const getResult = waterService.getWater(userId, date);
        expect(lastReturnValue).toBeCloseTo(getResult, 10);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22b: Totals for distinct dates are independent
// Validates: Requirements 27.2
// ---------------------------------------------------------------------------

describe('Property 22b: Totals for distinct dates are independent', () => {
  /**
   * **Validates: Requirements 27.2**
   *
   * For any userId, two distinct dates d1 and d2, and amounts A and B:
   * adding A on d1 does NOT affect getWater(userId, d2), and adding B on d2
   * does NOT affect getWater(userId, d1).
   */
  it('adding water on date1 does not affect the total on date2', () => {
    fc.assert(
      fc.property(userIdArb, twoDistinctDatesArb, amountArb, amountArb, (userId, [d1, d2], amountA, amountB) => {
        localStorage.clear();

        // Establish a baseline for d2 before touching d1
        waterService.addWater(userId, d2, amountB);
        const baselineD2 = waterService.getWater(userId, d2);

        // Add water on d1
        waterService.addWater(userId, d1, amountA);

        // d2 total must be unchanged
        const afterD2 = waterService.getWater(userId, d2);
        expect(afterD2).toBeCloseTo(baselineD2, 10);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 27.2**
   *
   * Symmetric check: adding on d2 does not affect d1.
   */
  it('adding water on date2 does not affect the total on date1', () => {
    fc.assert(
      fc.property(userIdArb, twoDistinctDatesArb, amountArb, amountArb, (userId, [d1, d2], amountA, amountB) => {
        localStorage.clear();

        // Establish a baseline for d1
        waterService.addWater(userId, d1, amountA);
        const baselineD1 = waterService.getWater(userId, d1);

        // Add water on d2
        waterService.addWater(userId, d2, amountB);

        // d1 total must be unchanged
        const afterD1 = waterService.getWater(userId, d1);
        expect(afterD1).toBeCloseTo(baselineD1, 10);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 27.2**
   *
   * Multiple additions on both dates remain independent: the final totals
   * on each date equal only the amounts added to that respective date.
   */
  it('multiple additions on two distinct dates produce independent totals', () => {
    fc.assert(
      fc.property(
        userIdArb,
        twoDistinctDatesArb,
        amountsArrayArb,
        amountsArrayArb,
        (userId, [d1, d2], amountsA, amountsB) => {
          localStorage.clear();

          // Interleave additions on both dates
          const maxLen = Math.max(amountsA.length, amountsB.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < amountsA.length) waterService.addWater(userId, d1, amountsA[i]!);
            if (i < amountsB.length) waterService.addWater(userId, d2, amountsB[i]!);
          }

          const totalD1 = waterService.getWater(userId, d1);
          const totalD2 = waterService.getWater(userId, d2);

          const expectedD1 = amountsA.reduce((acc, a) => acc + a, 0);
          const expectedD2 = amountsB.reduce((acc, a) => acc + a, 0);

          expect(totalD1).toBeCloseTo(expectedD1, 5);
          expect(totalD2).toBeCloseTo(expectedD2, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 27.2**
   *
   * Distinct user IDs also have independent totals on the same date —
   * confirming data isolation across users.
   */
  it('distinct users have independent totals on the same date', () => {
    fc.assert(
      fc.property(
        fc.tuple(userIdArb, userIdArb).filter(([u1, u2]) => u1 !== u2),
        dateArb,
        amountArb,
        amountArb,
        ([userId1, userId2], date, amountA, amountB) => {
          localStorage.clear();

          waterService.addWater(userId1, date, amountA);
          waterService.addWater(userId2, date, amountB);

          expect(waterService.getWater(userId1, date)).toBeCloseTo(amountA, 10);
          expect(waterService.getWater(userId2, date)).toBeCloseTo(amountB, 10);
        },
      ),
      { numRuns: 100 },
    );
  });
});
