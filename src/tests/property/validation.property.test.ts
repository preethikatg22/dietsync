/**
 * Property-based tests for the FoodLogService validation layer
 *
 * Validates: Requirements 4.1, 4.2, 5.2, 18.1, 18.2, 18.3, 18.4
 *
 * Properties covered:
 *   - Property 6: Invalid food entries are always rejected
 *       (missing/null field or negative value → non-empty error array;
 *        valid entry → empty error array)
 *   - Property 7: Non-positive serving sizes are rejected
 *       (serving size ≤ 0 → descriptive error)
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  validateFoodEntry,
  validateServingSize,
  type FoodEntryValidationInput,
} from '../../services/FoodLogService.ts';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A fully valid food entry — non-negative macros and a non-empty name. */
const validFoodArb: fc.Arbitrary<FoodEntryValidationInput> = fc.record({
  name: fc.string({ minLength: 1 }),
  caloriesPer100g: fc.float({ min: Math.fround(0), max: Math.fround(9999.9), noNaN: true }),
  proteinPer100g: fc.float({ min: Math.fround(0), max: Math.fround(9999.9), noNaN: true }),
  carbsPer100g: fc.float({ min: Math.fround(0), max: Math.fround(9999.9), noNaN: true }),
  fatPer100g: fc.float({ min: Math.fround(0), max: Math.fround(9999.9), noNaN: true }),
});

const allFieldsArb = fc.constantFrom(
  'name',
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
);

const numericFieldsArb = fc.constantFrom(
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
);

/**
 * A valid food with one required field set to `null` or removed entirely.
 * Exercises the "missing or null" branch of Property 6 / Req 18.1.
 */
const foodWithMissingOrNullFieldArb: fc.Arbitrary<FoodEntryValidationInput> = fc
  .tuple(validFoodArb, allFieldsArb, fc.constantFrom(null, undefined))
  .map(([food, field, badValue]) => {
    const copy: Record<string, unknown> = { ...food };
    if (badValue === undefined) {
      delete copy[field];
    } else {
      copy[field] = badValue;
    }
    return copy as FoodEntryValidationInput;
  });

/**
 * A valid food with one numeric macro field set to a strictly negative number.
 * Exercises the "negative value" branch of Property 6 / Req 18.2.
 */
const foodWithNegativeFieldArb: fc.Arbitrary<FoodEntryValidationInput> = fc
  .tuple(validFoodArb, numericFieldsArb, fc.float({ min: Math.fround(0.001), max: Math.fround(9999), noNaN: true }))
  .map(([food, field, magnitude]) => {
    const copy: Record<string, unknown> = { ...food };
    copy[field] = -magnitude;
    return copy as FoodEntryValidationInput;
  });

// ---------------------------------------------------------------------------
// Property 6 — Invalid food entries are always rejected
// ---------------------------------------------------------------------------

describe('Property 6 — Invalid food entries are always rejected', () => {
  // Validates: Requirements 18.1, 18.2
  it('rejects any entry with a missing/null field (Req 18.1) or negative value (Req 18.2)', () => {
    fc.assert(
      fc.property(foodWithMissingOrNullFieldArb, (food) => {
        const errors = validateFoodEntry(food);
        expect(errors.length).toBeGreaterThan(0);
      }),
    );

    fc.assert(
      fc.property(foodWithNegativeFieldArb, (food) => {
        const errors = validateFoodEntry(food);
        expect(errors.length).toBeGreaterThan(0);
      }),
    );
  });

  // Validates: Requirements 4.1, 4.2, 18.4
  it('accepts all valid entries (non-negative macros, present fields) with an empty error array', () => {
    fc.assert(
      fc.property(validFoodArb, (food) => {
        expect(validateFoodEntry(food)).toEqual([]);
      }),
    );
  });

  // Validates: Requirements 18.1
  it('reports the offending field name when a required field is missing or null', () => {
    fc.assert(
      fc.property(foodWithMissingOrNullFieldArb, (food) => {
        const errors = validateFoodEntry(food);
        // At least one error must name a known required field.
        const fields = errors.map((e) => e.field);
        expect(fields).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^(name|caloriesPer100g|proteinPer100g|carbsPer100g|fatPer100g)$/,
            ),
          ]),
        );
      }),
    );
  });

  // Validates: Requirements 18.2
  it('reports the offending field name when a numeric value is negative', () => {
    fc.assert(
      fc.property(foodWithNegativeFieldArb, (food) => {
        const errors = validateFoodEntry(food);
        const fields = errors.map((e) => e.field);
        expect(fields).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^(caloriesPer100g|proteinPer100g|carbsPer100g|fatPer100g)$/,
            ),
          ]),
        );
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — Non-positive serving sizes are rejected
// ---------------------------------------------------------------------------

describe('Property 7 — Non-positive serving sizes are rejected', () => {
  // Validates: Requirements 18.3
  it('returns a descriptive error for every serving size ≤ 0 (including 0 and NaN)', () => {
    const nonPositiveArb = fc.oneof(
      fc.float({ min: Math.fround(-10000), max: Math.fround(0), noNaN: true }),
      fc.constant(0),
      fc.constant(NaN),
    );

    fc.assert(
      fc.property(nonPositiveArb, (grams) => {
        const errors = validateServingSize(grams);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].field).toBe('servingGrams');
        expect(typeof errors[0].message).toBe('string');
        expect(errors[0].message.length).toBeGreaterThan(0);
      }),
    );
  });

  // Validates: Requirements 18.4 (serving size validity companion)
  it('accepts every positive serving size with an empty error array', () => {
    const positiveArb = fc.float({
      min: Math.fround(0.01),
      max: Math.fround(10000),
      noNaN: true,
    });

    fc.assert(
      fc.property(positiveArb, (grams) => {
        expect(validateServingSize(grams)).toEqual([]);
      }),
    );
  });
});
