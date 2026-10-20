/**
 * Property-based tests for NutritionCalculator — Atwater calorie–macro consistency
 *
 * Validates: Requirements 12.1, 12.2, 21.1, 21.2
 *
 * Properties covered:
 *   - Property 11: Calorie–macro consistency per entry and per day
 */

import * as fc from 'fast-check';
import { describe } from 'vitest';
import { aggregateDayLog, scaleNutrients } from '../../services/NutritionCalculator.ts';
import type { FoodItem, LogEntry, MealSection } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Atwater-derived calories from macro grams */
function atwaterCalories(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const mealSectionArb = fc.constantFrom<MealSection>(
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
);

/**
 * FoodItem where per-100g calorie value is within 2 kcal of its Atwater equivalent,
 * simulating the tolerance allowed by USDA source rounding (Requirement 12.2).
 */
const consistentFoodItemArb: fc.Arbitrary<FoodItem> = fc
  .record({
    id: fc.string(),
    name: fc.string(),
    category: fc.string(),
    proteinPer100g: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
    carbsPer100g: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
    fatPer100g: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
    atwaterOffset: fc.float({ min: Math.fround(-2), max: Math.fround(2), noNaN: true }),
  })
  .map(({ id, name, category, proteinPer100g, carbsPer100g, fatPer100g, atwaterOffset }) => ({
    id,
    name,
    category,
    proteinPer100g,
    carbsPer100g,
    fatPer100g,
    // Stored calorie value is within 2 kcal of Atwater-derived value
    caloriesPer100g:
      atwaterCalories(proteinPer100g, carbsPer100g, fatPer100g) + atwaterOffset,
  }));

const positiveServingArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true });

/** Build a LogEntry using scaleNutrients so stored values are exact */
function makeEntry(
  food: FoodItem,
  servingGrams: number,
  id: string,
  mealSection: MealSection,
): LogEntry {
  const scaled = scaleNutrients(food, servingGrams);
  return {
    id,
    foodId: food.id,
    foodName: food.name,
    servingGrams,
    mealSection,
    calories: scaled.calories,
    protein: scaled.protein,
    carbs: scaled.carbs,
    fat: scaled.fat,
  };
}

const consistentLogEntryArb: fc.Arbitrary<LogEntry> = fc
  .tuple(consistentFoodItemArb, positiveServingArb, fc.uuid(), mealSectionArb)
  .map(([food, serving, id, section]) => makeEntry(food, serving, id, section));

// ---------------------------------------------------------------------------
// Property 11: Calorie–macro consistency per entry and per day
// Validates: Requirements 12.1, 12.2, 21.1, 21.2
// ---------------------------------------------------------------------------

describe('Property 11: Calorie–macro consistency per entry and per day', () => {
  /**
   * **Validates: Requirements 12.1, 12.2, 21.1**
   *
   * For all food entries with non-negative macros whose stored caloriesPer100g
   * is within 2 kcal/100g of Atwater-derived value, the per-entry difference
   * between stored calories and Atwater-derived calories is ≤ 2 kcal per entry.
   *
   * The tolerance scales with serving size because both stored and Atwater values
   * are scaled by the same factor: diff(serving) = diff(per100g) × serving/100.
   * With diff(per100g) ≤ 2 kcal and serving up to 10000 g → scaled diff ≤ 200 kcal.
   * We use the per-100g proportional tolerance: ≤ 2 × (servingGrams/100).
   */
  it('|storedCalories - atwaterCalories| <= 2 × (servingGrams/100) for any consistent entry', () => {
    fc.assert(
      fc.property(consistentLogEntryArb, (entry) => {
        const atwater = atwaterCalories(entry.protein, entry.carbs, entry.fat);
        const diff = Math.abs(entry.calories - atwater);
        // The tolerance is 2 kcal per 100g of serving
        const tolerancePerEntry = 2 * (entry.servingGrams / 100);
        return diff <= tolerancePerEntry + 1e-9;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.2, 21.2**
   *
   * For a day with N consistent entries, the total stored calories differ from
   * Atwater-derived total by at most 2×N kcal (where N is the entry count and
   * tolerance scales as above with serving sizes).
   */
  it('|totalStoredCalories - atwaterTotalCalories| <= 2N × (avg serving/100) for N entries', () => {
    fc.assert(
      fc.property(
        fc.array(consistentLogEntryArb, { minLength: 1, maxLength: 20 }),
        (entries) => {
          const dayTotals = aggregateDayLog(entries);
          const atwaterTotal = atwaterCalories(
            dayTotals.protein,
            dayTotals.carbs,
            dayTotals.fat,
          );
          const totalDiff = Math.abs(dayTotals.calories - atwaterTotal);

          // Total tolerance: 2 kcal per 100g of serving, summed across all N entries
          const totalTolerance =
            entries.reduce((sum, e) => sum + 2 * (e.servingGrams / 100), 0) + 1e-9;

          return totalDiff <= totalTolerance;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 21.1**
   *
   * For entries where the food's caloriesPer100g exactly equals the Atwater
   * derivation, the diff should be essentially zero (within float rounding).
   */
  it('entries with exact Atwater calories have near-zero calorie diff', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          name: fc.string(),
          category: fc.string(),
          proteinPer100g: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          carbsPer100g: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          fatPer100g: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        }),
        positiveServingArb,
        fc.uuid(),
        mealSectionArb,
        (foodBase, servingGrams, id, mealSection) => {
          const { proteinPer100g, carbsPer100g, fatPer100g } = foodBase;
          const exactCaloriesPer100g = atwaterCalories(
            proteinPer100g,
            carbsPer100g,
            fatPer100g,
          );
          const food: FoodItem = { ...foodBase, caloriesPer100g: exactCaloriesPer100g };
          const entry = makeEntry(food, servingGrams, id, mealSection);
          const atwater = atwaterCalories(entry.protein, entry.carbs, entry.fat);
          return Math.abs(entry.calories - atwater) < 1e-6;
        },
      ),
      { numRuns: 100 },
    );
  });
});
