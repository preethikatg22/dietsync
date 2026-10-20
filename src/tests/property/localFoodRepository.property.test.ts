/**
 * Property-based tests for LocalFoodRepository
 *
 * Validates: Requirements 23.1-23.4
 *
 * Properties covered:
 *   - Property 13: Search returns no false positives (Req 23.1)
 *   - Property 14: Custom food IDs never collide with bundled IDs (Req 23.2)
 *   - Property 15: Mutations (edit/delete) are immediately reflected in subsequent queries (Req 23.3, 23.4)
 */

import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalFoodRepository } from '../../repositories/LocalFoodRepository';
import type { CustomFood } from '../../types/index';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'test-user-property-tests';

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty query string (empty returns all items, which is intentional behaviour, not a false positive) */
const nonEmptyQueryArb = fc.string({ minLength: 1, maxLength: 20 });

/** Valid per-100g nutrient value */
const nutrientValueArb = fc.float({ min: Math.fround(0), max: Math.fround(999.9), noNaN: true });

/** Generates a valid CustomFood-like input (without the isCustom flag, which is added by createCustomFood) */
const customFoodInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  caloriesPer100g: nutrientValueArb,
  proteinPer100g: nutrientValueArb,
  carbsPer100g: nutrientValueArb,
  fatPer100g: nutrientValueArb,
  category: fc.constantFrom(
    'grains',
    'dairy',
    'proteins',
    'fruits',
    'vegetables',
    'snacks',
    'indian_staples',
    'custom',
  ),
});

// ---------------------------------------------------------------------------
// Property 13: Search Returns No False Positives
// Validates: Requirement 23.1
// ---------------------------------------------------------------------------

describe('Property 13: Search returns no false positives', () => {
  /**
   * **Validates: Requirement 23.1**
   * FOR ALL search queries Q, every item returned by LocalFoodRepository.search(Q)
   * has a name or category that contains Q as a case-insensitive substring.
   */
  it('every search result matches the query in name or category (case-insensitive)', () => {
    const repo = createLocalFoodRepository(null);

    fc.assert(
      fc.property(nonEmptyQueryArb, (query) => {
        const results = repo.search(query);
        const lowerQuery = query.toLowerCase();

        for (const item of results) {
          const nameMatches = item.name.toLowerCase().includes(lowerQuery);
          const categoryMatches = item.category.toLowerCase().includes(lowerQuery);
          expect(nameMatches || categoryMatches).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.1**
   * Search results also include custom foods, and no false positives appear
   * from the merged custom + bundled result set.
   */
  it('no false positives when custom foods are merged into search results', () => {
    fc.assert(
      fc.property(nonEmptyQueryArb, customFoodInputArb, (query, foodInput) => {
        const repo = createLocalFoodRepository(TEST_USER_ID);
        const customFood = repo.createCustomFood(
          foodInput.name,
          foodInput.caloriesPer100g,
          foodInput.proteinPer100g,
          foodInput.carbsPer100g,
          foodInput.fatPer100g,
          foodInput.category,
        );
        repo.addCustomFood(customFood);

        const results = repo.search(query);
        const lowerQuery = query.toLowerCase();

        for (const item of results) {
          const nameMatches = item.name.toLowerCase().includes(lowerQuery);
          const categoryMatches = item.category.toLowerCase().includes(lowerQuery);
          expect(nameMatches || categoryMatches).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.1**
   * When query matches a custom food's name or category, that food appears in results.
   */
  it('custom food with matching name appears in search results', () => {
    fc.assert(
      fc.property(customFoodInputArb, (foodInput) => {
        const repo = createLocalFoodRepository(TEST_USER_ID);
        const customFood = repo.createCustomFood(
          foodInput.name,
          foodInput.caloriesPer100g,
          foodInput.proteinPer100g,
          foodInput.carbsPer100g,
          foodInput.fatPer100g,
          foodInput.category,
        );
        repo.addCustomFood(customFood);

        // Search using the full name as query — the food must appear
        const results = repo.search(foodInput.name.toLowerCase());
        const found = results.some((item) => item.id === customFood.id);
        expect(found).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Custom Food IDs Never Collide with Bundled IDs
// Validates: Requirement 23.2
// ---------------------------------------------------------------------------

describe('Property 14: Custom food IDs never collide with bundled IDs', () => {
  /**
   * **Validates: Requirement 23.2**
   * The "custom_" prefix ensures structural non-collision:
   * every generated CustomFood ID starts with "custom_".
   */
  it('createCustomFood always produces IDs with "custom_" prefix', () => {
    fc.assert(
      fc.property(customFoodInputArb, (foodInput) => {
        const repo = createLocalFoodRepository(null);
        const customFood = repo.createCustomFood(
          foodInput.name,
          foodInput.caloriesPer100g,
          foodInput.proteinPer100g,
          foodInput.carbsPer100g,
          foodInput.fatPer100g,
          foodInput.category,
        );
        expect(customFood.id.startsWith('custom_')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.2**
   * No bundled food item has an ID that starts with "custom_".
   * This guarantees the prefix creates an orthogonal namespace.
   */
  it('no bundled food ID starts with "custom_"', () => {
    const repo = createLocalFoodRepository(null);
    // Retrieve all bundled items via empty-string search
    const allItems = repo.search('');
    for (const item of allItems) {
      // Custom foods are only present when a userId is set; with null userId none are loaded
      // so all returned items are bundled
      expect(item.id.startsWith('custom_')).toBe(false);
    }
  });

  /**
   * **Validates: Requirement 23.2**
   * Multiple createCustomFood calls produce unique IDs (UUID v4 guarantees negligible collision rate,
   * but we verify they differ from bundled IDs too).
   */
  it('generated custom IDs do not match any bundled food ID', () => {
    fc.assert(
      fc.property(fc.array(customFoodInputArb, { minLength: 1, maxLength: 20 }), (foodInputs) => {
        const repo = createLocalFoodRepository(TEST_USER_ID);
        // Collect all bundled IDs
        const bundledIds = new Set(repo.search('').map((f) => f.id));

        for (const input of foodInputs) {
          const customFood = repo.createCustomFood(
            input.name,
            input.caloriesPer100g,
            input.proteinPer100g,
            input.carbsPer100g,
            input.fatPer100g,
            input.category,
          );
          expect(bundledIds.has(customFood.id)).toBe(false);
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Mutations Are Immediately Reflected in Subsequent Queries
// Validates: Requirements 23.3, 23.4
// ---------------------------------------------------------------------------

describe('Property 15: Custom food mutations are reflected in subsequent queries', () => {
  /**
   * **Validates: Requirement 23.3**
   * After addCustomFood + editCustomFood, all subsequent queries return updated values.
   */
  it('edited custom food appears with updated values in search results', () => {
    fc.assert(
      fc.property(
        customFoodInputArb,
        customFoodInputArb,
        (originalInput, updatedInput) => {
          const repo = createLocalFoodRepository(TEST_USER_ID);

          // Add the original custom food
          const original = repo.createCustomFood(
            originalInput.name,
            originalInput.caloriesPer100g,
            originalInput.proteinPer100g,
            originalInput.carbsPer100g,
            originalInput.fatPer100g,
            originalInput.category,
          );
          repo.addCustomFood(original);

          // Edit it with new values
          const updated: CustomFood = {
            ...original,
            name: updatedInput.name,
            caloriesPer100g: updatedInput.caloriesPer100g,
            proteinPer100g: updatedInput.proteinPer100g,
            carbsPer100g: updatedInput.carbsPer100g,
            fatPer100g: updatedInput.fatPer100g,
            category: updatedInput.category,
          };
          repo.editCustomFood(updated);

          // getById must return updated values
          const retrieved = repo.getById(original.id);
          expect('error' in retrieved).toBe(false);
          if (!('error' in retrieved)) {
            expect(retrieved.name).toBe(updatedInput.name);
            expect(retrieved.caloriesPer100g).toBe(updatedInput.caloriesPer100g);
            expect(retrieved.proteinPer100g).toBe(updatedInput.proteinPer100g);
            expect(retrieved.carbsPer100g).toBe(updatedInput.carbsPer100g);
            expect(retrieved.fatPer100g).toBe(updatedInput.fatPer100g);
            expect(retrieved.category).toBe(updatedInput.category);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.3**
   * After edit, the search function reflects the updated name/category.
   */
  it('edited custom food reflects updated name in search', () => {
    fc.assert(
      fc.property(customFoodInputArb, customFoodInputArb, (originalInput, updatedInput) => {
        const repo = createLocalFoodRepository(TEST_USER_ID);

        const original = repo.createCustomFood(
          originalInput.name,
          originalInput.caloriesPer100g,
          originalInput.proteinPer100g,
          originalInput.carbsPer100g,
          originalInput.fatPer100g,
          originalInput.category,
        );
        repo.addCustomFood(original);

        const updated: CustomFood = {
          ...original,
          name: updatedInput.name,
          category: updatedInput.category,
          caloriesPer100g: updatedInput.caloriesPer100g,
          proteinPer100g: updatedInput.proteinPer100g,
          carbsPer100g: updatedInput.carbsPer100g,
          fatPer100g: updatedInput.fatPer100g,
        };
        repo.editCustomFood(updated);

        // Searching by updated name must find the item
        const results = repo.search(updatedInput.name.toLowerCase());
        const found = results.some((item) => item.id === original.id);
        expect(found).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.4**
   * After addCustomFood + deleteCustomFood, the item is absent from all subsequent queries.
   */
  it('deleted custom food is absent from getById', () => {
    fc.assert(
      fc.property(customFoodInputArb, (foodInput) => {
        const repo = createLocalFoodRepository(TEST_USER_ID);

        const food = repo.createCustomFood(
          foodInput.name,
          foodInput.caloriesPer100g,
          foodInput.proteinPer100g,
          foodInput.carbsPer100g,
          foodInput.fatPer100g,
          foodInput.category,
        );
        repo.addCustomFood(food);

        // Verify it was added
        const beforeDelete = repo.getById(food.id);
        expect('error' in beforeDelete).toBe(false);

        // Delete it
        repo.deleteCustomFood(food.id);

        // getById must now return a FoodRepositoryError
        const afterDelete = repo.getById(food.id);
        expect('error' in afterDelete).toBe(true);
        if ('error' in afterDelete) {
          expect(afterDelete.error).toBe(true);
          expect(afterDelete.id).toBe(food.id);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.4**
   * After delete, the item does not appear in search results.
   */
  it('deleted custom food is absent from search results', () => {
    fc.assert(
      fc.property(customFoodInputArb, (foodInput) => {
        const repo = createLocalFoodRepository(TEST_USER_ID);

        const food = repo.createCustomFood(
          foodInput.name,
          foodInput.caloriesPer100g,
          foodInput.proteinPer100g,
          foodInput.carbsPer100g,
          foodInput.fatPer100g,
          foodInput.category,
        );
        repo.addCustomFood(food);
        repo.deleteCustomFood(food.id);

        // Search by the exact name — the deleted item must not appear
        const results = repo.search(foodInput.name.toLowerCase());
        const found = results.some((item) => item.id === food.id);
        expect(found).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 23.4**
   * After delete, the item does not appear in getCategories if it was the only item for that category.
   * (This test uses a unique category not in the bundled data.)
   */
  it('deleted custom food with unique category no longer contributes that category', () => {
    const repo = createLocalFoodRepository(TEST_USER_ID);

    // Use a category name that is guaranteed not to exist in the bundled database
    const uniqueCategory = `test_category_${crypto.randomUUID()}`;
    const food = repo.createCustomFood('Test Food', 100, 10, 10, 5, uniqueCategory);
    repo.addCustomFood(food);

    // Verify the unique category appears
    expect(repo.getCategories()).toContain(uniqueCategory);

    // Delete the food
    repo.deleteCustomFood(food.id);

    // The unique category should no longer appear
    expect(repo.getCategories()).not.toContain(uniqueCategory);
  });

  /**
   * **Validates: Requirement 23.3**
   * After editing a custom food's category, getCategories reflects the new category.
   */
  it('editing a custom food category is reflected in getCategories', () => {
    const repo = createLocalFoodRepository(TEST_USER_ID);

    const uniqueCategory = `test_category_edit_${crypto.randomUUID()}`;
    const food = repo.createCustomFood('Editable Food', 100, 10, 10, 5, 'custom');
    repo.addCustomFood(food);

    const updated: CustomFood = { ...food, category: uniqueCategory };
    repo.editCustomFood(updated);

    expect(repo.getCategories()).toContain(uniqueCategory);
  });
});
