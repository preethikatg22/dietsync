/**
 * Unit tests for the logStore (Zustand).
 *
 * Verifies that each action calls FoodLogService and updates the `activeDate`
 * and `dayLog` slices accordingly. Runs against the real FoodLogService +
 * StorageRepository + LocalFoodRepository stack (no mocking), consistent with
 * the design's integration testing guidance. An account is created via
 * authStore to obtain a real userId, and a bundled food item is used for log
 * entries. localStorage is cleared between tests.
 *
 * **Validates: Requirements 5.1–5.8**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useLogStore } from '../../stores/logStore.ts';
import { useAuthStore } from '../../stores/authStore.ts';
import { localFoodRepository } from '../../repositories/LocalFoodRepository.ts';
import { type FoodItem, type OnboardingData } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid onboarding profile used to create test accounts. */
function makeProfile(email: string, password = 'password123'): OnboardingData {
  return {
    name: 'Test User',
    email,
    password,
    dob: '1990-01-15',
    sex: 'male',
    heightCm: 175,
    weightKg: 70,
    activityLevel: 'moderately_active',
    goal: 'maintain',
  };
}

/** Today's date as `YYYY-MM-DD`. */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Create a real account and return its userId. */
async function setupUser(email: string): Promise<string> {
  await useAuthStore.getState().createAccount(makeProfile(email));
  return useAuthStore.getState().currentUser!.userId;
}

/** The first bundled food item (stable across tests — loaded once). */
function firstFood(): FoodItem {
  const foods = localFoodRepository.search('');
  return foods[0];
}

/** Reset both stores to their default / logged-out state. */
function resetStores(): void {
  useAuthStore.setState({ session: null, currentUser: null });
  useLogStore.setState({ activeDate: todayDate(), dayLog: null });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logStore', () => {
  describe('addEntry', () => {
    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.6**
     *
     * Adding an entry calls FoodLogService.addEntry (which scales nutrients
     * and persists) and reloads dayLog so the slice reflects the new entry.
     */
    it('appends a scaled entry to the active date and reloads dayLog', async () => {
      const userId = await setupUser('alice@example.com');
      const food = firstFood();
      const grams = 150;

      const entry = useLogStore.getState().addEntry(
        userId,
        food.id,
        grams,
        'breakfast',
      );

      expect(entry.foodId).toBe(food.id);
      expect(entry.foodName).toBe(food.name);
      expect(entry.servingGrams).toBe(grams);
      expect(entry.mealSection).toBe('breakfast');
      expect(entry.calories).toBeCloseTo(
        (food.caloriesPer100g * grams) / 100,
        5,
      );

      const { dayLog, activeDate } = useLogStore.getState();
      expect(dayLog).not.toBeNull();
      expect(dayLog!.date).toBe(activeDate);
      expect(dayLog!.entries).toHaveLength(1);
      expect(dayLog!.entries[0].id).toBe(entry.id);
    });
  });

  describe('editEntry', () => {
    /**
     * **Validates: Requirements 5.4**
     *
     * Editing an entry's serving size recalculates its macros and reloads
     * dayLog so the slice reflects the updated entry.
     */
    it('recalculates nutrients for the updated serving size', async () => {
      const userId = await setupUser('bob@example.com');
      const food = firstFood();
      const date = useLogStore.getState().activeDate;
      const entry = useLogStore.getState().addEntry(
        userId,
        food.id,
        100,
        'lunch',
      );

      const newGrams = 200;
      const expectedCalories = (food.caloriesPer100g * newGrams) / 100;
      const updated = useLogStore.getState().editEntry(
        userId,
        date,
        entry.id,
        newGrams,
      );

      expect(updated.id).toBe(entry.id);
      expect(updated.servingGrams).toBe(newGrams);
      expect(updated.calories).toBeCloseTo(expectedCalories, 5);

      const { dayLog } = useLogStore.getState();
      expect(dayLog!.entries).toHaveLength(1);
      expect(dayLog!.entries[0].servingGrams).toBe(newGrams);
      expect(dayLog!.entries[0].calories).toBeCloseTo(expectedCalories, 5);
    });
  });

  describe('removeEntry', () => {
    /**
     * **Validates: Requirements 5.5**
     *
     * Removing an entry deletes it from the day log and reloads dayLog.
     */
    it('removes the entry from the day log', async () => {
      const userId = await setupUser('carol@example.com');
      const food = firstFood();
      const date = useLogStore.getState().activeDate;
      const e1 = useLogStore.getState().addEntry(
        userId,
        food.id,
        100,
        'breakfast',
      );
      const e2 = useLogStore.getState().addEntry(
        userId,
        food.id,
        50,
        'snacks',
      );
      expect(useLogStore.getState().dayLog!.entries).toHaveLength(2);

      useLogStore.getState().removeEntry(userId, date, e1.id);

      const { dayLog } = useLogStore.getState();
      expect(dayLog!.entries).toHaveLength(1);
      expect(dayLog!.entries[0].id).toBe(e2.id);
    });
  });

  describe('setDate', () => {
    /**
     * **Validates: Requirements 5.7**
     *
     * setDate updates activeDate and triggers loadDayLog for that date.
     */
    it('sets activeDate and loads the day log for the new date', async () => {
      const userId = await setupUser('dave@example.com');
      const food = firstFood();
      const dateWithEntry = useLogStore.getState().activeDate;
      useLogStore.getState().addEntry(userId, food.id, 100, 'breakfast');

      const otherDate = '2024-01-15';
      useLogStore.getState().setDate(otherDate);

      expect(useLogStore.getState().activeDate).toBe(otherDate);
      // otherDate has no entries → empty (not null) day log.
      expect(useLogStore.getState().dayLog).not.toBeNull();
      expect(useLogStore.getState().dayLog!.date).toBe(otherDate);
      expect(useLogStore.getState().dayLog!.entries).toHaveLength(0);

      // Navigating back to the date that has an entry loads it.
      useLogStore.getState().setDate(dateWithEntry);
      expect(useLogStore.getState().activeDate).toBe(dateWithEntry);
      expect(useLogStore.getState().dayLog!.entries).toHaveLength(1);
    });

    /**
     * **Validates: Requirements 5.7**
     *
     * With no authenticated user, setDate still updates activeDate but has
     * nothing to load, so dayLog is cleared to null.
     */
    it('updates activeDate but clears dayLog when no user is authenticated', () => {
      useLogStore.getState().setDate('2024-06-01');

      expect(useLogStore.getState().activeDate).toBe('2024-06-01');
      expect(useLogStore.getState().dayLog).toBeNull();
    });
  });

  describe('loadDayLog', () => {
    /**
     * **Validates: Requirements 5.6**
     *
     * loadDayLog reads the DayLog from the service and updates the slice,
     * even when the slice was stale.
     */
    it('updates dayLog from the service for the given date', async () => {
      const userId = await setupUser('erin@example.com');
      const food = firstFood();
      const date = useLogStore.getState().activeDate;
      useLogStore.getState().addEntry(userId, food.id, 100, 'dinner');

      // Simulate a stale slice, then reload from the service.
      useLogStore.setState({ dayLog: null });
      expect(useLogStore.getState().dayLog).toBeNull();

      useLogStore.getState().loadDayLog(userId, date);

      const { dayLog } = useLogStore.getState();
      expect(dayLog).not.toBeNull();
      expect(dayLog!.date).toBe(date);
      expect(dayLog!.entries).toHaveLength(1);
    });

    /**
     * **Validates: Requirements 5.6**
     *
     * A date with no stored log yields an empty (not null) DayLog.
     */
    it('returns an empty day log for a date with no entries', async () => {
      const userId = await setupUser('frank@example.com');

      useLogStore.getState().loadDayLog(userId, '2024-09-09');

      const { dayLog } = useLogStore.getState();
      expect(dayLog).not.toBeNull();
      expect(dayLog!.entries).toHaveLength(0);
    });
  });
});
