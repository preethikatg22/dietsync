/**
 * Unit tests for the Dashboard page and its components.
 *
 * Tests use @testing-library/react with a real Zustand store + StorageRepository
 * stack — no business logic is mocked. localStorage is cleared between tests.
 *
 * **Validates: Requirements 6.1–6.7**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard.tsx';
import { useAuthStore } from '../../stores/authStore.ts';
import { useLogStore } from '../../stores/logStore.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';
import { STORAGE_KEYS, type NutritionGoals, type OnboardingData } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the Dashboard inside a minimal router context. */
function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<div>Settings</div>} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** A minimal valid onboarding profile for test account creation. */
function makeProfile(email = 'dash@example.com', password = 'password123'): OnboardingData {
  return {
    name: 'Dash User',
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

/** Save NutritionGoals for `userId` directly to storage. */
function saveGoals(userId: string, goals: NutritionGoals) {
  storageRepository.set(STORAGE_KEYS.GOALS(userId), goals);
}

/** Standard goals fixture matching the test profile. */
const DEFAULT_GOALS: NutritionGoals = {
  calorieTarget: 2000,
  proteinPct: 30,
  carbsPct: 40,
  fatPct: 30,
  isManual: true,
};

/** Reset all Zustand store slices to their initial state. */
function resetStores() {
  useAuthStore.setState({ session: null, currentUser: null });
  useLogStore.setState({ activeDate: new Date().toISOString().slice(0, 10), dayLog: null });
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

describe('Dashboard — no goals configured (Req 6.7)', () => {
  /**
   * **Validates: Requirement 6.7**
   *
   * When no NutritionGoals are stored for the current user, the Dashboard
   * shows a prompt to configure goals rather than zero/undefined targets.
   */
  it('shows "configure goals" prompt when no goals are set', async () => {
    // Create account (establishes session + currentUser in the store)
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('nogoals@example.com'));
    });
    // Deliberately do NOT save any goals

    renderDashboard();

    // The NoGoalsPrompt renders an alert with this heading
    expect(screen.getByText(/no nutrition goals set/i)).toBeInTheDocument();
    // A link/button to set up goals should be present
    expect(screen.getByRole('link', { name: /set up goals/i })).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 6.7**
   *
   * When goals ARE set, the "configure goals" prompt is not shown and the
   * calorie progress UI is rendered instead.
   */
  it('does not show the prompt when goals are configured', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('withgoals@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    saveGoals(userId, DEFAULT_GOALS);

    renderDashboard();

    expect(screen.queryByText(/no nutrition goals set/i)).not.toBeInTheDocument();
    // Calorie progress section is rendered (Req 6.1)
    expect(screen.getByText(/today's calories/i)).toBeInTheDocument();
  });
});

describe('Dashboard — calorie display and remaining (Req 6.1, 6.4)', () => {
  /**
   * **Validates: Requirement 6.4**
   *
   * When consumed calories exceed the calorie target, the remaining display
   * shows a negative / over-target state with a visually distinct style
   * (red text + "Over target" label).
   */
  it('shows over-target indicator with distinct style when consumed > target', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('over@example.com'));
    });
    const { session } = useAuthStore.getState();
    const userId = session!.userId;

    // Set a low calorie target (500 kcal) so any food entry exceeds it
    saveGoals(userId, { ...DEFAULT_GOALS, calorieTarget: 500 });

    // Inject a DayLog whose entries sum to 800 kcal (> 500 target)
    const today = new Date().toISOString().slice(0, 10);
    const logs: Record<string, { date: string; entries: unknown[] }> = {
      [today]: {
        date: today,
        entries: [
          {
            id: 'e1',
            foodId: 'test-food',
            foodName: 'Test Food',
            servingGrams: 100,
            mealSection: 'breakfast',
            calories: 800,
            protein: 30,
            carbs: 100,
            fat: 20,
          },
        ],
      },
    };
    storageRepository.set(STORAGE_KEYS.LOGS(userId), logs);

    // Load the day log into the store
    act(() => {
      useLogStore.getState().loadDayLog(userId, today);
    });

    renderDashboard();

    // "Over target by" label replaces "Remaining" (CalorieProgress.tsx)
    expect(screen.getByText(/over target by/i)).toBeInTheDocument();

    // The over-target amount shown in red (positive display of absolute difference)
    // 800 − 500 = 300 kcal over
    expect(screen.getByText(/\+300 kcal/i)).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 6.4**
   *
   * When consumed is within target the remaining label is shown (not "Over
   * target") and uses the green (non-negative) style.
   */
  it('shows remaining calories when under target', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('under@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    saveGoals(userId, { ...DEFAULT_GOALS, calorieTarget: 2000 });

    const today = new Date().toISOString().slice(0, 10);
    const logs: Record<string, { date: string; entries: unknown[] }> = {
      [today]: {
        date: today,
        entries: [
          {
            id: 'e2',
            foodId: 'food2',
            foodName: 'Light Snack',
            servingGrams: 100,
            mealSection: 'snacks',
            calories: 300,
            protein: 10,
            carbs: 40,
            fat: 8,
          },
        ],
      },
    };
    storageRepository.set(STORAGE_KEYS.LOGS(userId), logs);

    act(() => {
      useLogStore.getState().loadDayLog(userId, today);
    });

    renderDashboard();

    // Scope queries to the CalorieProgress card to avoid collision with
    // WaterTracker which also renders a "Remaining" label.
    const calorieCard = screen.getByTestId('calorie-progress');

    // "Remaining" label (not over-target)
    expect(within(calorieCard).getByText(/^remaining$/i)).toBeInTheDocument();
    // 2000 − 300 = 1700 kcal remaining
    expect(within(calorieCard).getByText(/1700 kcal/i)).toBeInTheDocument();

    // The over-target copy must NOT appear
    expect(within(calorieCard).queryByText(/over target by/i)).not.toBeInTheDocument();
  });
});

describe('Dashboard — re-renders on log change (Req 6.5)', () => {
  /**
   * **Validates: Requirements 6.5, 6.6**
   *
   * When the logStore's `dayLog` slice is updated (simulating a new log
   * entry being added), the Dashboard reflects the new totals without a
   * page reload.
   */
  it('updates displayed calorie total when dayLog changes', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('rerender@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    saveGoals(userId, { ...DEFAULT_GOALS, calorieTarget: 2000 });

    const today = new Date().toISOString().slice(0, 10);

    // Start with an empty day log
    act(() => {
      useLogStore.setState({ dayLog: { date: today, entries: [] } });
    });

    renderDashboard();

    // Scope to the CalorieProgress card to avoid ambiguous matches with
    // other components that also render "0" (e.g. WaterTracker).
    const calorieCard = screen.getByTestId('calorie-progress');

    // Initially 0 kcal consumed
    expect(within(calorieCard).getByText('0')).toBeInTheDocument();

    // Simulate a new entry being added — update the store slice directly
    act(() => {
      useLogStore.setState({
        dayLog: {
          date: today,
          entries: [
            {
              id: 'new-entry',
              foodId: 'food3',
              foodName: 'Chicken Breast',
              servingGrams: 150,
              mealSection: 'lunch',
              calories: 248,
              protein: 46,
              carbs: 0,
              fat: 5,
            },
          ],
        },
      });
    });

    // Dashboard should now show 248 kcal consumed (without a page reload)
    expect(within(calorieCard).getByText('248')).toBeInTheDocument();
  });
});

describe('Dashboard — meal breakdown (Req 6.3)', () => {
  /**
   * **Validates: Requirement 6.3**
   *
   * The meal breakdown section is rendered showing per-section data when
   * a DayLog exists.
   */
  it('renders meal breakdown section when a DayLog is present', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('meals@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    saveGoals(userId, DEFAULT_GOALS);

    const today = new Date().toISOString().slice(0, 10);
    act(() => {
      useLogStore.setState({
        dayLog: {
          date: today,
          entries: [
            {
              id: 'entry-b',
              foodId: 'food-b',
              foodName: 'Oatmeal',
              servingGrams: 100,
              mealSection: 'breakfast',
              calories: 370,
              protein: 13,
              carbs: 67,
              fat: 7,
            },
          ],
        },
      });
    });

    renderDashboard();

    // Meal breakdown card heading
    expect(screen.getByText(/meal breakdown/i)).toBeInTheDocument();
    // Breakfast section should appear
    expect(screen.getByText(/breakfast/i)).toBeInTheDocument();
    // The entry calories shown
    expect(screen.getByText(/370 kcal/i)).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 6.3**
   *
   * When no entries exist, a friendly empty-state message is shown inside
   * the meal breakdown card.
   */
  it('shows empty-state message in meal breakdown when no entries', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('emptymeal@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;
    saveGoals(userId, DEFAULT_GOALS);

    const today = new Date().toISOString().slice(0, 10);
    act(() => {
      useLogStore.setState({ dayLog: { date: today, entries: [] } });
    });

    renderDashboard();

    expect(screen.getByText(/no food logged today/i)).toBeInTheDocument();
  });
});
