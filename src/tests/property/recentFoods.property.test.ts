/**
 * Property-based tests for Recent Foods logic in FoodLogService
 *
 * Validates: Requirements 28.1, 28.2
 *
 * Properties covered:
 *   - Property 23a: List never exceeds 10 entries (Req 28.1, 15.1, 15.3)
 *   - Property 23b: No duplicate food IDs in the list (Req 28.2, 15.1, 15.2)
 *   - Property 23c: Logging a food already in the list promotes it to index 0 (Req 15.2)
 *   - Property 23d: New unique food in a full list evicts the oldest; new ID at index 0 (Req 15.3)
 *   - Property 23e: The most-recently-logged food is always at index 0 (Req 15.1)
 */

import * as fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { foodLogService } from '../../services/FoodLogService';
import { localFoodRepository } from '../../repositories/LocalFoodRepository';
import type { FoodItem } from '../../types/index';

// ---------------------------------------------------------------------------
// Constants mirrored from FoodLogService (RECENT_FOODS_MAX = 10)
// ---------------------------------------------------------------------------

const RECENT_FOODS_MAX = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid FoodItem for any given foodId so that
 * localFoodRepository.getById returns something `addEntry` can use.
 */
function makeFoodItem(foodId: string): FoodItem {
  return {
    id: foodId,
    name: `Food ${foodId}`,
    category: 'grains',
    caloriesPer100g: 100,
    proteinPer100g: 5,
    carbsPer100g: 20,
    fatPer100g: 2,
  };
}

/**
 * Log a food via `foodLogService.addEntry` using a fixed userId, date,
 * serving size and section. The `localFoodRepository.getById` spy must
 * already be active to resolve the foodId to a valid FoodItem.
 */
function logFood(userId: string, foodId: string): void {
  foodLogService.addEntry(userId, '2025-01-01', foodId, 100, 'breakfast');
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Wipe all LocalStorage state between test runs so the list is always empty
  localStorage.clear();

  // Spy on localFoodRepository.getById and make it return a valid FoodItem
  // for any ID so that addEntry never throws a "food not found" error.
  vi.spyOn(localFoodRepository, 'getById').mockImplementation((id: string) =>
    makeFoodItem(id),
  );
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A non-empty user ID — uuid keeps IDs unique across property runs */
const userIdArb = fc.uuid();

/** A food ID — uuid guarantees uniqueness when we need distinct IDs */
const foodIdArb = fc.uuid();

/**
 * A list of N > 10 distinct food IDs (11–20 items) to exercise the size cap.
 * Using `fc.uniqueArray` ensures all IDs are distinct within the array.
 */
const moreThanMaxDistinctFoodIdsArb = fc.uniqueArray(fc.uuid(), {
  minLength: RECENT_FOODS_MAX + 1,
  maxLength: RECENT_FOODS_MAX + 10,
});

/**
 * A list of exactly RECENT_FOODS_MAX distinct food IDs — used to pre-fill
 * the list to capacity before testing eviction behaviour.
 */
const exactlyMaxDistinctFoodIdsArb = fc.uniqueArray(fc.uuid(), {
  minLength: RECENT_FOODS_MAX,
  maxLength: RECENT_FOODS_MAX,
});

/**
 * An arbitrary sequence of food IDs that may include repeats (1–20 items).
 * Used for uniqueness / promotion tests where repeats are intentional.
 */
const foodIdSequenceWithRepeatsArb = fc.array(
  // Pick from a small pool of 3–6 distinct IDs to guarantee repeats occur
  fc.integer({ min: 0, max: 5 }).map((i) => `food-pool-id-${i}`),
  { minLength: 1, maxLength: 20 },
);

// ---------------------------------------------------------------------------
// Unit tests — baseline sanity checks
// ---------------------------------------------------------------------------

describe('RecentFoods — unit tests', () => {
  it('starts empty for a brand-new user', () => {
    const userId = 'brand-new-user-unit';
    expect(foodLogService.getRecentFoods(userId)).toHaveLength(0);
  });

  it('contains the logged food ID after a single addEntry call', () => {
    const userId = 'user-single-add';
    const foodId = 'food-single-001';
    logFood(userId, foodId);
    const list = foodLogService.getRecentFoods(userId);
    expect(list).toContain(foodId);
  });

  it('puts the logged food ID at index 0', () => {
    const userId = 'user-index-zero';
    const foodId = 'food-idx-001';
    logFood(userId, foodId);
    expect(foodLogService.getRecentFoods(userId)[0]).toBe(foodId);
  });

  it('promotes an existing ID to index 0 on re-log', () => {
    const userId = 'user-promote';
    logFood(userId, 'food-a');
    logFood(userId, 'food-b');
    logFood(userId, 'food-a'); // re-log food-a
    const list = foodLogService.getRecentFoods(userId);
    expect(list[0]).toBe('food-a');
    // food-a should appear exactly once
    expect(list.filter((id) => id === 'food-a')).toHaveLength(1);
  });

  it('never exceeds 10 entries after logging 15 distinct foods', () => {
    const userId = 'user-cap-unit';
    for (let i = 0; i < 15; i++) {
      logFood(userId, `food-cap-${i}`);
    }
    expect(foodLogService.getRecentFoods(userId).length).toBeLessThanOrEqual(RECENT_FOODS_MAX);
  });
});

// ---------------------------------------------------------------------------
// Property 23a: List never exceeds 10 entries
// Validates: Requirements 28.1, 15.1, 15.3
// ---------------------------------------------------------------------------

describe('Property 23a: List never exceeds 10 entries', () => {
  /**
   * **Validates: Requirements 28.1, 15.1, 15.3**
   *
   * For any user and any sequence of N > 10 distinct food IDs logged in
   * order, the recent foods list must never exceed RECENT_FOODS_MAX (10)
   * entries.
   */
  it('list length is always ≤ 10 after logging more than 10 distinct foods', () => {
    fc.assert(
      fc.property(userIdArb, moreThanMaxDistinctFoodIdsArb, (userId, foodIds) => {
        localStorage.clear();

        for (const foodId of foodIds) {
          logFood(userId, foodId);
        }

        const list = foodLogService.getRecentFoods(userId);
        expect(list.length).toBeLessThanOrEqual(RECENT_FOODS_MAX);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 28.1**
   *
   * The size invariant holds even when the sequence contains duplicate IDs
   * (promote-on-re-log path still must not exceed the cap).
   */
  it('list length is always ≤ 10 when sequence contains repeated food IDs', () => {
    fc.assert(
      fc.property(userIdArb, foodIdSequenceWithRepeatsArb, (userId, foodIds) => {
        localStorage.clear();

        for (const foodId of foodIds) {
          logFood(userId, foodId);
        }

        const list = foodLogService.getRecentFoods(userId);
        expect(list.length).toBeLessThanOrEqual(RECENT_FOODS_MAX);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23b: No duplicate food IDs in the list
// Validates: Requirements 28.2, 15.1, 15.2
// ---------------------------------------------------------------------------

describe('Property 23b: No duplicate food IDs in the list', () => {
  /**
   * **Validates: Requirements 28.2, 15.2**
   *
   * After any sequence of add operations (including repeated IDs), the
   * resulting recent foods list must contain each ID at most once.
   */
  it('list contains no duplicate food IDs after any sequence of log operations', () => {
    fc.assert(
      fc.property(userIdArb, foodIdSequenceWithRepeatsArb, (userId, foodIds) => {
        localStorage.clear();

        for (const foodId of foodIds) {
          logFood(userId, foodId);
        }

        const list = foodLogService.getRecentFoods(userId);
        const unique = new Set(list);
        expect(unique.size).toBe(list.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 28.2**
   *
   * No duplicates even when more than 10 distinct foods are logged (eviction
   * path must not introduce duplicates).
   */
  it('list contains no duplicates after logging more than 10 distinct foods', () => {
    fc.assert(
      fc.property(userIdArb, moreThanMaxDistinctFoodIdsArb, (userId, foodIds) => {
        localStorage.clear();

        for (const foodId of foodIds) {
          logFood(userId, foodId);
        }

        const list = foodLogService.getRecentFoods(userId);
        const unique = new Set(list);
        expect(unique.size).toBe(list.length);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23c: Logging a food already in the list promotes it to index 0
// Validates: Requirements 15.2
// ---------------------------------------------------------------------------

describe('Property 23c: Re-logging an existing food promotes it to index 0', () => {
  /**
   * **Validates: Requirements 15.2**
   *
   * For any user: after logging a sequence of distinct foods and then logging
   * one of the earlier foods again, that food ID must appear at index 0 and
   * appear exactly once in the list.
   */
  it('re-logged food is promoted to index 0 and appears only once', () => {
    fc.assert(
      fc.property(
        userIdArb,
        // Generate 2–9 distinct food IDs so we can re-log one without filling the list
        fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 9 }),
        // Pick which index to re-log (within the generated list)
        fc.nat({ max: 8 }),
        (userId, foodIds, relogIndexRaw) => {
          localStorage.clear();

          // Log all foods once
          for (const foodId of foodIds) {
            logFood(userId, foodId);
          }

          // Choose which food to re-log (clamp to actual array length)
          const relogIndex = relogIndexRaw % foodIds.length;
          const reloggedId = foodIds[relogIndex]!;

          // Log it again
          logFood(userId, reloggedId);

          const list = foodLogService.getRecentFoods(userId);

          // Must be at index 0
          expect(list[0]).toBe(reloggedId);

          // Must appear exactly once (no duplicates introduced)
          expect(list.filter((id) => id === reloggedId)).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23d: New food in a full list evicts the oldest; new ID at index 0
// Validates: Requirements 15.3
// ---------------------------------------------------------------------------

describe('Property 23d: Eviction — full list gets new ID at index 0 and stays at 10', () => {
  /**
   * **Validates: Requirements 15.3**
   *
   * When exactly 10 distinct foods are already in the list and a new unique
   * food is logged:
   *   - the list still has exactly 10 entries
   *   - the new food ID is at index 0
   *   - no duplicates are introduced
   */
  it('adding a new unique food to a full list keeps it at 10 entries and puts new ID at index 0', () => {
    fc.assert(
      fc.property(
        userIdArb,
        exactlyMaxDistinctFoodIdsArb,
        foodIdArb,
        (userId, initialFoodIds, newFoodId) => {
          // Guard: ensure the new food ID is not already in the initial list
          // (fc.uniqueArray + uuid makes collision vanishingly rare, but be explicit)
          fc.pre(!initialFoodIds.includes(newFoodId));

          localStorage.clear();

          // Fill the list to exactly RECENT_FOODS_MAX
          for (const foodId of initialFoodIds) {
            logFood(userId, foodId);
          }

          const listBeforeEviction = foodLogService.getRecentFoods(userId);
          expect(listBeforeEviction).toHaveLength(RECENT_FOODS_MAX);

          // Log the new unique food — should trigger eviction of the oldest
          logFood(userId, newFoodId);

          const listAfterEviction = foodLogService.getRecentFoods(userId);

          // Still exactly 10
          expect(listAfterEviction).toHaveLength(RECENT_FOODS_MAX);

          // New ID is at position 0
          expect(listAfterEviction[0]).toBe(newFoodId);

          // No duplicates
          const unique = new Set(listAfterEviction);
          expect(unique.size).toBe(RECENT_FOODS_MAX);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 15.3**
   *
   * The evicted entry is the one that was at the tail (index 9) just before
   * the new food was logged — i.e. the oldest item is removed.
   */
  it('evicts the oldest (tail) entry when a new unique food is added to a full list', () => {
    fc.assert(
      fc.property(
        userIdArb,
        exactlyMaxDistinctFoodIdsArb,
        foodIdArb,
        (userId, initialFoodIds, newFoodId) => {
          fc.pre(!initialFoodIds.includes(newFoodId));

          localStorage.clear();

          for (const foodId of initialFoodIds) {
            logFood(userId, foodId);
          }

          // The oldest item is the first one that was logged (now at tail, index 9)
          const oldestFoodId = initialFoodIds[0]!;
          const listBefore = foodLogService.getRecentFoods(userId);
          // Confirm the oldest is indeed at the tail before eviction
          expect(listBefore[RECENT_FOODS_MAX - 1]).toBe(oldestFoodId);

          // Log the new food to trigger eviction
          logFood(userId, newFoodId);

          const listAfter = foodLogService.getRecentFoods(userId);

          // The oldest entry must no longer be present
          expect(listAfter).not.toContain(oldestFoodId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23e: Most-recently-logged food is always at index 0
// Validates: Requirements 15.1
// ---------------------------------------------------------------------------

describe('Property 23e: Most-recently-logged food is always at index 0', () => {
  /**
   * **Validates: Requirements 15.1**
   *
   * After any non-empty sequence of log operations, the last food that was
   * logged must always be at index 0 in the resulting list.
   */
  it('the last logged food is always at index 0', () => {
    fc.assert(
      fc.property(
        userIdArb,
        // A sequence of at least 1 food ID (may contain repeats)
        fc.array(
          fc.integer({ min: 0, max: 7 }).map((i) => `food-last-${i}`),
          { minLength: 1, maxLength: 20 },
        ),
        (userId, foodIds) => {
          localStorage.clear();

          for (const foodId of foodIds) {
            logFood(userId, foodId);
          }

          const lastLogged = foodIds[foodIds.length - 1]!;
          const list = foodLogService.getRecentFoods(userId);

          expect(list[0]).toBe(lastLogged);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * This holds even when the sequence contains more than 10 distinct foods
   * (the eviction path must not disturb the ordering invariant at index 0).
   */
  it('most-recently-logged food is at index 0 even when list overflows capacity', () => {
    fc.assert(
      fc.property(userIdArb, moreThanMaxDistinctFoodIdsArb, (userId, foodIds) => {
        localStorage.clear();

        for (const foodId of foodIds) {
          logFood(userId, foodId);
        }

        const lastLogged = foodIds[foodIds.length - 1]!;
        const list = foodLogService.getRecentFoods(userId);

        expect(list[0]).toBe(lastLogged);
      }),
      { numRuns: 100 },
    );
  });
});
