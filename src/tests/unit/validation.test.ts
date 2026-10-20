/**
 * Unit tests for the FoodLogService validation helpers
 *
 * Validates: Requirements 4.1, 4.2, 5.2, 18.1, 18.2, 18.3, 18.4
 *
 * Covers specific examples and edge cases for `validateServingSize` and
 * `validateFoodEntry` (Properties 6 & 7).
 */

import { describe, expect, it } from 'vitest';
import {
  validateFoodEntry,
  validateServingSize,
} from '../../services/FoodLogService.ts';

// ---------------------------------------------------------------------------
// validateServingSize
// ---------------------------------------------------------------------------

describe('validateServingSize', () => {
  it('returns an empty array for a positive serving size', () => {
    expect(validateServingSize(100)).toEqual([]);
    expect(validateServingSize(0.1)).toEqual([]);
  });

  it('returns an error for zero', () => {
    const errors = validateServingSize(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('servingGrams');
    expect(errors[0].message).toBe('Serving size must be greater than zero');
  });

  it('returns an error for a negative serving size', () => {
    const errors = validateServingSize(-5);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('servingGrams');
  });

  it('returns an error for NaN', () => {
    const errors = validateServingSize(NaN);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('servingGrams');
  });
});

// ---------------------------------------------------------------------------
// validateFoodEntry — valid inputs
// ---------------------------------------------------------------------------

describe('validateFoodEntry — valid inputs', () => {
  it('returns an empty array for a complete, valid food entry', () => {
    expect(
      validateFoodEntry({
        name: 'Brown Rice',
        caloriesPer100g: 123,
        proteinPer100g: 2.7,
        carbsPer100g: 25.6,
        fatPer100g: 1.0,
      }),
    ).toEqual([]);
  });

  it('accepts zero-valued macros (0 is non-negative)', () => {
    expect(
      validateFoodEntry({
        name: 'Water',
        caloriesPer100g: 0,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 0,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateFoodEntry — missing / null fields (Req 18.1)
// ---------------------------------------------------------------------------

describe('validateFoodEntry — missing or null fields', () => {
  it('rejects a missing name', () => {
    const errors = validateFoodEntry({
      caloriesPer100g: 100,
      proteinPer100g: 5,
      carbsPer100g: 20,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('name');
  });

  it('rejects an empty-string name', () => {
    const errors = validateFoodEntry({
      name: '',
      caloriesPer100g: 100,
      proteinPer100g: 5,
      carbsPer100g: 20,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('name');
  });

  it('rejects a null macro field', () => {
    const errors = validateFoodEntry({
      name: 'Test Food',
      caloriesPer100g: null,
      proteinPer100g: 5,
      carbsPer100g: 20,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('caloriesPer100g');
  });

  it('rejects a missing macro field', () => {
    const errors = validateFoodEntry({
      name: 'Test Food',
      proteinPer100g: 5,
      carbsPer100g: 20,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('caloriesPer100g');
  });

  it('reports multiple invalid fields at once', () => {
    const errors = validateFoodEntry({
      name: '',
      caloriesPer100g: null,
      proteinPer100g: -1,
      // carbsPer100g and fatPer100g omitted
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('name');
    expect(fields).toContain('caloriesPer100g');
    expect(fields).toContain('proteinPer100g');
    expect(fields).toContain('carbsPer100g');
    expect(fields).toContain('fatPer100g');
  });
});

// ---------------------------------------------------------------------------
// validateFoodEntry — negative values (Req 18.2)
// ---------------------------------------------------------------------------

describe('validateFoodEntry — negative values', () => {
  it('rejects a negative calories value', () => {
    const errors = validateFoodEntry({
      name: 'Test',
      caloriesPer100g: -50,
      proteinPer100g: 5,
      carbsPer100g: 20,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('caloriesPer100g');
  });

  it('rejects a negative protein value', () => {
    const errors = validateFoodEntry({
      name: 'Test',
      caloriesPer100g: 100,
      proteinPer100g: -5,
      carbsPer100g: 20,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('proteinPer100g');
  });

  it('rejects a NaN macro value', () => {
    const errors = validateFoodEntry({
      name: 'Test',
      caloriesPer100g: 100,
      proteinPer100g: 5,
      carbsPer100g: NaN,
      fatPer100g: 2,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('carbsPer100g');
  });
});
