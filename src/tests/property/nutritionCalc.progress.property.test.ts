/**
 * Property-based tests for NutritionCalculator — Remaining calories and progress
 *
 * Validates: Requirements 6.4, 12.3, 22.1, 22.2, 22.3
 *
 * Properties covered:
 *   - Property 12: Remaining is unclamped; progress ≥ 100% when over target
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeProgressPct,
  computeRemaining,
} from '../../services/NutritionCalculator.ts';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const nonNegCaloriesArb = fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true });
const positiveTargetArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true });

// ---------------------------------------------------------------------------
// Property 12: Remaining calories and progress percentage are unclamped
// Validates: Requirements 6.4, 12.3, 22.1, 22.2, 22.3
// ---------------------------------------------------------------------------

describe('Property 12: Remaining and progress are unclamped', () => {
  /**
   * **Validates: Requirements 6.4, 12.3, 22.1**
   *
   * For C and T > 0: remaining = T − C (negative when C > T).
   */
  it('computeRemaining(C, T) = T - C, which is negative when C > T', () => {
    fc.assert(
      fc.property(nonNegCaloriesArb, positiveTargetArb, (consumed, target) => {
        const remaining = computeRemaining(consumed, target);
        const expected = target - consumed;
        // Check that remaining matches the formula exactly
        return Math.abs(remaining - expected) < 1e-9;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 22.1**
   *
   * Remaining is negative when consumption exceeds target.
   */
  it('computeRemaining is negative when consumed > target', () => {
    fc.assert(
      fc.property(
        positiveTargetArb,
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        (target, extra) => {
          const consumed = target + extra;
          return computeRemaining(consumed, target) < 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.3, 22.2**
   *
   * Progress % = (C / T) × 100, not clamped; may exceed 100 when C > T.
   */
  it('computeProgressPct(C, T) = (C/T)×100, unclamped above 100 when C > T', () => {
    fc.assert(
      fc.property(nonNegCaloriesArb, positiveTargetArb, (consumed, target) => {
        const pct = computeProgressPct(consumed, target);
        const expected = (consumed / target) * 100;
        return Math.abs(pct - expected) < 1e-9;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.3, 22.2**
   *
   * Progress exceeds 100 when consumption exceeds target.
   */
  it('computeProgressPct exceeds 100 when consumed > target', () => {
    fc.assert(
      fc.property(
        positiveTargetArb,
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        (target, extra) => {
          const consumed = target + extra;
          return computeProgressPct(consumed, target) > 100;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.3, 22.3**
   *
   * When T = 0, computeProgressPct returns 0 (no division-by-zero).
   */
  it('computeProgressPct(C, 0) === 0 for any C, without throwing', () => {
    fc.assert(
      fc.property(nonNegCaloriesArb, (consumed) => {
        let result: number;
        expect(() => {
          result = computeProgressPct(consumed, 0);
        }).not.toThrow();
        return result! === 0;
      }),
      { numRuns: 100 },
    );
  });
});
