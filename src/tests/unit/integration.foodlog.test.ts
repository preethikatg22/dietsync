/**
 * Integration tests — food log flows (add / edit / remove).
 *
 * Runs against the real logStore → FoodLogService → NutritionCalculator →
 * LocalFoodRepository → StorageRepository stack. No business-logic mocking.
 * jsdom provides localStorage.
 *
 * Key scenarios (Requirements 5.4, 5.5, 6.5):
 *  1. Add entry → day totals update in logStore and match NutritionCalculator
 *     scaled values.
 *  2. Edit entry → recalculated macros are stored and reflected in the log.
 *  3. Remove entry → day totals decrease (reach zero when it was the only
 *     entry).
 *  4. Multiple entries across different meal sections sum correctly into the
 *     day total.
 *  5. Each mutation persists the DayLog to `dietsync:[userId]:logs` in
 *     LocalStorage.
 *
 * **Validates: Requirements 5.4, 5.5, 6.5**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/authStore.ts';
import { useLogStore } from '../../stores/logStore.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';
import {
  STORAGE_KEYS,
  type OnboardingData,
  type DayLog,
} from '../../types/index.ts';
import { scaleNutrients, aggregateDayLog } from '../../services/NutritionCalculator.ts';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Food items used in tests — picked from src/data/foods.json
//
//  "1001": Brown Rice (cooked) — 123 cal, 2.7g protein, 25.6g carbs, 1.0g fat / 100g
//  "1002": White Rice (cooked) — 130 cal, 2.7g protein, 28.2g carbs, 0.3g fat / 100g
//  "1006": Rolled Oats (dry)   — 389 cal, 16.9g protein, 66.3g carbs, 6.9g fat / 100g
// ---------------------------------------------------------------------------

const FOOD = {
  BROWN_RICE: {
    id: '1001',
    name: 'Brown Rice (cooked)',
    category: 'grains',
    caloriesPer100g: 123,
    proteinPer100g: 2.7,
    carbsPer100g: 25.6,
    fatPer100g: 1.0,
  },
  WHITE_RICE: {
    id: '1002',
    name: 'White Rice (cooked)',
    category: 'grains',
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbsPer100g: 28.2,
    fatPer100g: 0.3,
  },
  ROLLED_OATS: {
    id: '1006',
    name: 'Rolled Oats (dry)',
    category: 'grains',
    caloriesPer100g: 389,
    proteinPer100g: 16.9,
    carbsPer100g: 66.3,
    fatPer100g: 6.9,
  },
} as const;

// ---------------------------------------------------------------------------
// Zod schema for reading the raw DayLog map from localStorage
// ---------------------------------------------------------------------------

const LogEntrySchema = z.object({
  id: z.string(),
  foodId: z.string(),
  foodName: z.string(),
  servingGrams: z.number(),
  mealSection: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const DayLogSchema = z.object({
  date: z.string(),
  entries: z.array(LogEntrySchema),
});

const AllLogsSchema = z.record(z.string(), DayLogSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid onboarding profile factory. */
function makeProfile(email: string, password = 'TestPass123!'): OnboardingData {
  return {
    name: 'Log Integration User',
    email,
    password,
    dob: '1990-06-15',
    sex: 'female',
    heightCm: 165,
    weightKg: 62,
    activityLevel: 'lightly_active',
    goal: 'maintain',
  };
}

/** Reset both Zustand stores to initial state. */
function resetStores(): void {
  useAuthStore.setState({ session: null, currentUser: null });
  useLogStore.setState({ activeDate: todayString(), dayLog: null });
}

/** Today as YYYY-MM-DD. */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read the persisted DayLog map for a user from localStorage.
 * Returns an empty object if nothing is stored yet.
 */
function readPersistedLogs(userId: string): Record<string, DayLog> {
  return storageRepository.get(
    STORAGE_KEYS.LOGS(userId),
    AllLogsSchema,
    {},
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let userId: string;
const TODAY = todayString();

beforeEach(async () => {
  // Start each test with a clean slate
  localStorage.clear();
  resetStores();

  // Create a real account so the service layer can resolve the userId
  const email = `foodlog-${Date.now()}@example.com`;
  await useAuthStore.getState().createAccount(makeProfile(email));
  userId = useAuthStore.getState().session!.userId;

  // Point the log store at today
  useLogStore.setState({ activeDate: TODAY, dayLog: null });
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Food log integration — add entry', () => {
  /**
   * **Validates: Requirements 5.4, 6.5**
   *
   * After adding a single entry, the logStore's dayLog totals match the
   * values that NutritionCalculator.scaleNutrients would produce for that
   * food and serving size.
   */
  it('day totals in logStore match NutritionCalculator scaled values after add', () => {
    const grams = 150;
    const expected = scaleNutrients(FOOD.BROWN_RICE, grams);

    useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, grams, 'breakfast');

    const { dayLog } = useLogStore.getState();
    expect(dayLog).not.toBeNull();
    expect(dayLog!.entries).toHaveLength(1);

    const totals = aggregateDayLog(dayLog!.entries);
    expect(totals.calories).toBeCloseTo(expected.calories, 5);
    expect(totals.protein).toBeCloseTo(expected.protein, 5);
    expect(totals.carbs).toBeCloseTo(expected.carbs, 5);
    expect(totals.fat).toBeCloseTo(expected.fat, 5);
  });

  /**
   * **Validates: Requirements 5.4, 6.5**
   *
   * The individual LogEntry returned by addEntry carries the correctly scaled
   * macro values.
   */
  it('the returned LogEntry carries correctly scaled macro values', () => {
    const grams = 200;
    const expected = scaleNutrients(FOOD.ROLLED_OATS, grams);

    const entry = useLogStore.getState().addEntry(userId, FOOD.ROLLED_OATS.id, grams, 'snacks');

    expect(entry.calories).toBeCloseTo(expected.calories, 5);
    expect(entry.protein).toBeCloseTo(expected.protein, 5);
    expect(entry.carbs).toBeCloseTo(expected.carbs, 5);
    expect(entry.fat).toBeCloseTo(expected.fat, 5);
    expect(entry.servingGrams).toBe(grams);
    expect(entry.mealSection).toBe('snacks');
    expect(entry.foodId).toBe(FOOD.ROLLED_OATS.id);
  });

  /**
   * **Validates: Requirement 5.6 (persistence)**
   *
   * After addEntry the DayLog is stored in LocalStorage under
   * `dietsync:[userId]:logs`.
   */
  it('persists DayLog to LocalStorage under dietsync:[userId]:logs after add', () => {
    const grams = 100;
    useLogStore.getState().addEntry(userId, FOOD.WHITE_RICE.id, grams, 'lunch');

    const persisted = readPersistedLogs(userId);
    expect(persisted[TODAY]).toBeDefined();
    expect(persisted[TODAY].entries).toHaveLength(1);
    expect(persisted[TODAY].entries[0].foodId).toBe(FOOD.WHITE_RICE.id);
    expect(persisted[TODAY].entries[0].servingGrams).toBe(grams);
  });
});

describe('Food log integration — edit entry', () => {
  /**
   * **Validates: Requirement 5.4**
   *
   * Editing a serving size causes the entry's macro values to be recalculated.
   * The logStore's dayLog reflects the new totals.
   */
  it('recalculates macros after editing serving size', () => {
    // Add an entry at 100 g
    const entry = useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, 100, 'breakfast');

    // Edit to 200 g — should double all macros
    const newGrams = 200;
    const expectedAfterEdit = scaleNutrients(FOOD.BROWN_RICE, newGrams);

    useLogStore.getState().editEntry(userId, TODAY, entry.id, newGrams);

    const { dayLog } = useLogStore.getState();
    expect(dayLog).not.toBeNull();
    expect(dayLog!.entries).toHaveLength(1);

    const updatedEntry = dayLog!.entries[0];
    expect(updatedEntry.servingGrams).toBe(newGrams);
    expect(updatedEntry.calories).toBeCloseTo(expectedAfterEdit.calories, 5);
    expect(updatedEntry.protein).toBeCloseTo(expectedAfterEdit.protein, 5);
    expect(updatedEntry.carbs).toBeCloseTo(expectedAfterEdit.carbs, 5);
    expect(updatedEntry.fat).toBeCloseTo(expectedAfterEdit.fat, 5);
  });

  /**
   * **Validates: Requirement 5.4**
   *
   * The edited entry's macros at 2× the original serving equal exactly double
   * the original macros (linearity of scaleNutrients).
   */
  it('editing to double the serving doubles the nutrient values (linearity)', () => {
    const originalGrams = 150;
    const entry = useLogStore.getState().addEntry(userId, FOOD.ROLLED_OATS.id, originalGrams, 'breakfast');

    const originalCalories = entry.calories;
    const originalProtein = entry.protein;
    const originalCarbs = entry.carbs;
    const originalFat = entry.fat;

    useLogStore.getState().editEntry(userId, TODAY, entry.id, originalGrams * 2);

    const { dayLog } = useLogStore.getState();
    const edited = dayLog!.entries[0];

    expect(edited.calories).toBeCloseTo(originalCalories * 2, 4);
    expect(edited.protein).toBeCloseTo(originalProtein * 2, 4);
    expect(edited.carbs).toBeCloseTo(originalCarbs * 2, 4);
    expect(edited.fat).toBeCloseTo(originalFat * 2, 4);
  });

  /**
   * **Validates: Requirement 5.4, persistence**
   *
   * After editEntry the updated values are persisted to LocalStorage.
   */
  it('persists the updated entry to LocalStorage after edit', () => {
    const entry = useLogStore.getState().addEntry(userId, FOOD.WHITE_RICE.id, 100, 'dinner');
    const newGrams = 250;

    useLogStore.getState().editEntry(userId, TODAY, entry.id, newGrams);

    const persisted = readPersistedLogs(userId);
    const storedEntry = persisted[TODAY]?.entries.find(e => e.id === entry.id);
    expect(storedEntry).toBeDefined();
    expect(storedEntry!.servingGrams).toBe(newGrams);

    const expectedCalories = scaleNutrients(FOOD.WHITE_RICE, newGrams).calories;
    expect(storedEntry!.calories).toBeCloseTo(expectedCalories, 5);
  });
});

describe('Food log integration — remove entry', () => {
  /**
   * **Validates: Requirement 5.5**
   *
   * Removing the only entry leaves the DayLog with zero totals.
   */
  it('totals reach zero after removing the only entry', () => {
    const entry = useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, 150, 'breakfast');

    useLogStore.getState().removeEntry(userId, TODAY, entry.id);

    const { dayLog } = useLogStore.getState();
    expect(dayLog).not.toBeNull();
    expect(dayLog!.entries).toHaveLength(0);

    const totals = aggregateDayLog(dayLog!.entries);
    expect(totals.calories).toBe(0);
    expect(totals.protein).toBe(0);
    expect(totals.carbs).toBe(0);
    expect(totals.fat).toBe(0);
  });

  /**
   * **Validates: Requirement 5.5**
   *
   * Removing one of two entries decreases totals by exactly that entry's
   * contribution.
   */
  it('totals decrease by the removed entry contribution when one of two entries is removed', () => {
    const entry1 = useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, 150, 'breakfast');
    void useLogStore.getState().addEntry(userId, FOOD.ROLLED_OATS.id, 60, 'breakfast');

    const scaledEntry1 = scaleNutrients(FOOD.BROWN_RICE, 150);
    const scaledEntry2 = scaleNutrients(FOOD.ROLLED_OATS, 60);

    // Remove entry1
    useLogStore.getState().removeEntry(userId, TODAY, entry1.id);

    const { dayLog } = useLogStore.getState();
    expect(dayLog!.entries).toHaveLength(1);

    const totals = aggregateDayLog(dayLog!.entries);
    // Only entry2 should remain
    expect(totals.calories).toBeCloseTo(scaledEntry2.calories, 5);
    expect(totals.protein).toBeCloseTo(scaledEntry2.protein, 5);
    expect(totals.carbs).toBeCloseTo(scaledEntry2.carbs, 5);
    expect(totals.fat).toBeCloseTo(scaledEntry2.fat, 5);

    // Sanity-check the removed entry is gone
    expect(dayLog!.entries.find(e => e.id === entry1.id)).toBeUndefined();
    void scaledEntry1; // referenced so TS doesn't complain about unused var
  });

  /**
   * **Validates: Requirement 5.5, persistence**
   *
   * After removeEntry the entry is absent from LocalStorage.
   */
  it('persists the removal to LocalStorage — entry is absent after remove', () => {
    const entry = useLogStore.getState().addEntry(userId, FOOD.WHITE_RICE.id, 100, 'lunch');

    useLogStore.getState().removeEntry(userId, TODAY, entry.id);

    const persisted = readPersistedLogs(userId);
    const found = persisted[TODAY]?.entries.find(e => e.id === entry.id);
    expect(found).toBeUndefined();
  });
});

describe('Food log integration — multiple entries across meal sections', () => {
  /**
   * **Validates: Requirements 6.5, 6.6**
   *
   * Adding entries to different meal sections and calling aggregateDayLog
   * produces the correct combined total regardless of section.
   */
  it('sums entries from all meal sections into a single correct day total', () => {
    const breakfastGrams = 80;
    const lunchGrams = 200;
    const dinnerGrams = 150;
    const snacksGrams = 50;

    useLogStore.getState().addEntry(userId, FOOD.ROLLED_OATS.id, breakfastGrams, 'breakfast');
    useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, lunchGrams, 'lunch');
    useLogStore.getState().addEntry(userId, FOOD.WHITE_RICE.id, dinnerGrams, 'dinner');
    useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, snacksGrams, 'snacks');

    const { dayLog } = useLogStore.getState();
    expect(dayLog!.entries).toHaveLength(4);

    // Compute expected totals manually
    const expectedCalories =
      scaleNutrients(FOOD.ROLLED_OATS, breakfastGrams).calories +
      scaleNutrients(FOOD.BROWN_RICE, lunchGrams).calories +
      scaleNutrients(FOOD.WHITE_RICE, dinnerGrams).calories +
      scaleNutrients(FOOD.BROWN_RICE, snacksGrams).calories;

    const expectedProtein =
      scaleNutrients(FOOD.ROLLED_OATS, breakfastGrams).protein +
      scaleNutrients(FOOD.BROWN_RICE, lunchGrams).protein +
      scaleNutrients(FOOD.WHITE_RICE, dinnerGrams).protein +
      scaleNutrients(FOOD.BROWN_RICE, snacksGrams).protein;

    const totals = aggregateDayLog(dayLog!.entries);
    expect(totals.calories).toBeCloseTo(expectedCalories, 4);
    expect(totals.protein).toBeCloseTo(expectedProtein, 4);
  });

  /**
   * **Validates: Requirements 5.4, 6.5, 6.6**
   *
   * The full add → edit → remove cycle ends with correct totals.
   */
  it('full cycle: add two entries, edit one, remove the other → totals correct', () => {
    // Add two entries
    const entry1 = useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, 100, 'lunch');
    const entry2 = useLogStore.getState().addEntry(userId, FOOD.ROLLED_OATS.id, 50, 'snacks');

    // Edit entry1 to 200 g
    useLogStore.getState().editEntry(userId, TODAY, entry1.id, 200);

    // Remove entry2
    useLogStore.getState().removeEntry(userId, TODAY, entry2.id);

    const { dayLog } = useLogStore.getState();
    expect(dayLog!.entries).toHaveLength(1);

    // Only the edited entry1 should contribute
    const expected = scaleNutrients(FOOD.BROWN_RICE, 200);
    const totals = aggregateDayLog(dayLog!.entries);

    expect(totals.calories).toBeCloseTo(expected.calories, 5);
    expect(totals.protein).toBeCloseTo(expected.protein, 5);
    expect(totals.carbs).toBeCloseTo(expected.carbs, 5);
    expect(totals.fat).toBeCloseTo(expected.fat, 5);
  });

  /**
   * **Validates: Requirement 5.6 (persistence)**
   *
   * All four meal sections are persisted correctly under a single DayLog key.
   */
  it('all meal-section entries are persisted in a single DayLog in LocalStorage', () => {
    useLogStore.getState().addEntry(userId, FOOD.ROLLED_OATS.id, 80, 'breakfast');
    useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, 200, 'lunch');
    useLogStore.getState().addEntry(userId, FOOD.WHITE_RICE.id, 150, 'dinner');
    useLogStore.getState().addEntry(userId, FOOD.BROWN_RICE.id, 50, 'snacks');

    const persisted = readPersistedLogs(userId);
    const dayLog = persisted[TODAY];

    expect(dayLog).toBeDefined();
    expect(dayLog.entries).toHaveLength(4);

    const sections = dayLog.entries.map(e => e.mealSection);
    expect(sections).toContain('breakfast');
    expect(sections).toContain('lunch');
    expect(sections).toContain('dinner');
    expect(sections).toContain('snacks');
  });
});
