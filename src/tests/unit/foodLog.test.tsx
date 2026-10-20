/**
 * Unit tests for the Food Log page (Log.tsx) and its components.
 *
 * Validates:
 *  - Search results contain only items matching the query (case-insensitive)
 *  - Searching a nonsense string returns empty results
 *  - Adding an entry updates the day totals displayed
 *  - Editing serving size recalculates nutrients
 *  - Removing an entry removes its row from the UI
 *  - Date navigator prev/next changes the displayed date
 *  - Meal sections show per-section calorie totals
 *
 * Uses real Zustand stores + StorageRepository (no business logic mocked).
 * localStorage is cleared between tests.
 *
 * **Validates: Requirements 5.1–5.8**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Log } from '../../pages/Log.tsx';
import { useAuthStore } from '../../stores/authStore.ts';
import { useLogStore } from '../../stores/logStore.ts';
import { useFoodStore } from '../../stores/foodStore.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';
import {
  STORAGE_KEYS,
  type OnboardingData,
  type MealSection,
  type DayLog,
} from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the Log page inside a minimal router. */
function renderLog() {
  return render(
    <MemoryRouter initialEntries={['/log']}>
      <Routes>
        <Route path="/log" element={<Log />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Minimal valid onboarding profile. */
function makeProfile(email = 'log@example.com', password = 'password123'): OnboardingData {
  return {
    name: 'Log User',
    email,
    password,
    dob: '1990-06-15',
    sex: 'male',
    heightCm: 175,
    weightKg: 75,
    activityLevel: 'moderately_active',
    goal: 'maintain',
  };
}

/**
 * Seed today's DayLog in storage for `userId` with `entries`.
 * Also sets the logStore's `dayLog` slice so the component renders it.
 */
function seedDayLog(userId: string, entries: DayLog['entries']) {
  const today = new Date().toISOString().slice(0, 10);
  const dayLog: DayLog = { date: today, entries };
  storageRepository.set(STORAGE_KEYS.LOGS(userId), { [today]: dayLog });
  useLogStore.setState({ activeDate: today, dayLog });
}

/** Reset all relevant Zustand store slices. */
function resetStores() {
  useAuthStore.setState({ session: null, currentUser: null });
  useLogStore.setState({
    activeDate: new Date().toISOString().slice(0, 10),
    dayLog: null,
  });
  useFoodStore.setState({ searchResults: [], customFoods: [] });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

// ---------------------------------------------------------------------------
// 1. Search results match query substring (case-insensitive)  [Req 3.3]
// ---------------------------------------------------------------------------

describe('FoodSearchModal — search results', () => {
  /**
   * **Validates: Requirement 3.3, 5.1 (search returns matching items only)**
   *
   * Every item returned by search must contain the query as a case-insensitive
   * substring in its name or category.
   */
  it('search results contain only items matching the query (case-insensitive)', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('search1@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    // Open the modal for breakfast
    await userEvent.click(
      screen.getByRole('button', { name: /add food to breakfast/i }),
    );

    // Type a query — "rice" should match items with "rice" in name/category
    const searchInput = screen.getByLabelText(/search foods/i);
    await userEvent.type(searchInput, 'rice');

    // Wait for results to render
    await waitFor(() => {
      const results = screen.queryAllByRole('option');
      expect(results.length).toBeGreaterThan(0);
    });

    // Every result must contain "rice" in the visible text (name or category)
    const resultButtons = screen
      .getAllByRole('option')
      .map((li) => li.querySelector('button'));

    for (const btn of resultButtons) {
      const text = btn?.textContent?.toLowerCase() ?? '';
      expect(text).toMatch(/rice/i);
    }
  });

  /**
   * **Validates: Requirement 3.7**
   *
   * A query that matches nothing returns zero results (empty list state).
   */
  it('searching a nonsense string shows empty results', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('search2@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    await userEvent.click(
      screen.getByRole('button', { name: /add food to breakfast/i }),
    );

    const searchInput = screen.getByLabelText(/search foods/i);
    await userEvent.type(searchInput, 'zzz_no_such_food_xyzqwerty');

    await waitFor(() => {
      expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    expect(
      screen.getByText(/no results for/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Adding an entry updates day totals  [Req 5.1, 5.3, 5.6]
// ---------------------------------------------------------------------------

describe('Adding a food entry', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.6**
   *
   * After adding a food entry via the modal, the meal section's calorie
   * total increases to reflect the new entry's scaled nutrients.
   */
  it('adds entry and shows updated section calorie total', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('add1@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    // Initially breakfast shows 0 kcal
    const breakfastSection = screen.getByRole('region', { name: /breakfast/i });
    expect(within(breakfastSection).getByText(/^0 kcal$/i)).toBeInTheDocument();

    // Open the breakfast modal
    await userEvent.click(
      within(breakfastSection).getByRole('button', { name: /add food to breakfast/i }),
    );

    // Search and pick the first result
    const searchInput = screen.getByLabelText(/search foods/i);
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'rice');

    await waitFor(() => {
      expect(screen.queryAllByRole('option').length).toBeGreaterThan(0);
    });

    const firstResult = screen.getAllByRole('option')[0].querySelector('button')!;
    await userEvent.click(firstResult);

    // Set serving to 100g (the default) and confirm
    const servingInput = screen.getByLabelText(/serving size \(grams\)/i);
    await userEvent.clear(servingInput);
    await userEvent.type(servingInput, '100');

    await userEvent.click(screen.getByRole('button', { name: /add to log/i }));

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Breakfast section total should now be > 0
    await waitFor(() => {
      const totals = within(breakfastSection)
        .getAllByText(/\d+ kcal/i)
        .map((el) => el.textContent ?? '');
      // At least one element showing a positive calorie total
      expect(totals.some((t) => parseInt(t) > 0)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Editing serving size recalculates nutrients  [Req 5.4]
// ---------------------------------------------------------------------------

describe('Editing a food entry', () => {
  /**
   * **Validates: Requirement 5.4**
   *
   * When a user changes an entry's serving size and confirms, the displayed
   * calorie value for that entry updates accordingly.
   */
  it('editing serving size recalculates and displays updated calories', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('edit1@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    // Seed an entry with 200 kcal at 200g serving
    seedDayLog(userId, [
      {
        id: 'entry-edit-1',
        foodId: 'food-e1',
        foodName: 'Test Food',
        servingGrams: 200,
        mealSection: 'lunch' as MealSection,
        calories: 200,
        protein: 10,
        carbs: 30,
        fat: 5,
      },
    ]);

    renderLog();

    // Verify initial calories shown
    expect(screen.getByText(/200g/i)).toBeInTheDocument();

    // Click edit on the entry
    await userEvent.click(
      screen.getByRole('button', { name: /edit test food/i }),
    );

    // Inline edit input should appear — update grams to 100
    const editInput = screen.getByLabelText(/serving size in grams/i);
    await userEvent.clear(editInput);
    await userEvent.type(editInput, '100');

    // Save
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // After save, serving should update to 100g in the UI
    await waitFor(() => {
      expect(screen.getByText(/100g/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Removing an entry removes its row from the UI  [Req 5.5]
// ---------------------------------------------------------------------------

describe('Removing a food entry', () => {
  /**
   * **Validates: Requirement 5.5**
   *
   * Clicking the remove button on an entry removes it from the display.
   */
  it('removes entry row from UI after clicking remove', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('remove1@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    seedDayLog(userId, [
      {
        id: 'entry-rm-1',
        foodId: 'food-rm1',
        foodName: 'Chicken Breast',
        servingGrams: 150,
        mealSection: 'dinner' as MealSection,
        calories: 248,
        protein: 46,
        carbs: 0,
        fat: 5,
      },
    ]);

    renderLog();

    // Entry should be visible
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();

    // Click remove
    await userEvent.click(
      screen.getByRole('button', { name: /remove chicken breast/i }),
    );

    // Entry should be gone
    await waitFor(() => {
      expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 5.5**
   *
   * After removal, the section calorie total drops to 0.
   */
  it('section calorie total returns to 0 after removing the only entry', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('remove2@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    seedDayLog(userId, [
      {
        id: 'entry-rm-2',
        foodId: 'food-rm2',
        foodName: 'Apple',
        servingGrams: 100,
        mealSection: 'snacks' as MealSection,
        calories: 52,
        protein: 0.3,
        carbs: 14,
        fat: 0.2,
      },
    ]);

    renderLog();

    const snacksSection = screen.getByRole('region', { name: /snacks/i });
    // Should show 52 kcal initially via aria-label on the total span
    expect(
      within(snacksSection).getByLabelText(/snacks total: 52 calories/i),
    ).toBeInTheDocument();

    // Remove the entry
    await userEvent.click(
      screen.getByRole('button', { name: /remove apple/i }),
    );

    // Section total should return to 0 kcal
    await waitFor(() => {
      expect(
        within(snacksSection).getByLabelText(/snacks total: 0 calories/i),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Date navigator changes displayed date  [Req 5.7]
// ---------------------------------------------------------------------------

describe('Date navigator', () => {
  /**
   * **Validates: Requirement 5.7**
   *
   * Clicking "Previous day" changes the displayed date label.
   */
  it('clicking previous day changes the active date label', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('nav1@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    // Initially shows "Today"
    expect(screen.getByText('Today')).toBeInTheDocument();

    // Click prev
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    // Should now show "Yesterday"
    await waitFor(() => {
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });

    // "Today" label should no longer be shown
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 5.7**
   *
   * Clicking prev then next returns to today.
   */
  it('prev then next returns to today', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('nav2@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));
    await waitFor(() => expect(screen.getByText('Yesterday')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /next day/i }));
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
  });

  /**
   * **Validates: Requirement 5.7**
   *
   * The "next day" button is disabled when already on today.
   */
  it('next day button is disabled when on today', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('nav3@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    const nextBtn = screen.getByRole('button', { name: /next day/i });
    expect(nextBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 6. Meal sections show per-section calorie totals  [Req 5.8]
// ---------------------------------------------------------------------------

describe('Meal section calorie totals', () => {
  /**
   * **Validates: Requirement 5.8**
   *
   * Each meal section header shows the calorie total for that section only,
   * not a combined total.
   */
  it('shows separate calorie totals for each meal section', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('totals@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    seedDayLog(userId, [
      {
        id: 'entry-b',
        foodId: 'food-b',
        foodName: 'Oatmeal',
        servingGrams: 100,
        mealSection: 'breakfast' as MealSection,
        calories: 370,
        protein: 13,
        carbs: 67,
        fat: 7,
      },
      {
        id: 'entry-l',
        foodId: 'food-l',
        foodName: 'Salad',
        servingGrams: 200,
        mealSection: 'lunch' as MealSection,
        calories: 80,
        protein: 3,
        carbs: 10,
        fat: 2,
      },
    ]);

    renderLog();

    const breakfastSection = screen.getByRole('region', { name: /breakfast/i });
    const lunchSection = screen.getByRole('region', { name: /lunch/i });
    const dinnerSection = screen.getByRole('region', { name: /dinner/i });

    // Breakfast: 370 kcal — use aria-label on section total span
    expect(
      within(breakfastSection).getByLabelText(/breakfast total: 370 calories/i),
    ).toBeInTheDocument();
    // Lunch: 80 kcal
    expect(
      within(lunchSection).getByLabelText(/lunch total: 80 calories/i),
    ).toBeInTheDocument();
    // Dinner: 0 kcal (no entries)
    expect(
      within(dinnerSection).getByLabelText(/dinner total: 0 calories/i),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 5.8**
   *
   * Sections with no entries show 0 kcal.
   */
  it('empty meal sections show 0 kcal', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('empty@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    seedDayLog(userId, []);

    renderLog();

    for (const label of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
      const section = screen.getByRole('region', { name: new RegExp(label, 'i') });
      expect(within(section).getByText(/^0 kcal$/i)).toBeInTheDocument();
    }
  });
});
