/**
 * Unit tests for the Settings page components.
 *
 * Covers:
 *  - Macro percentages not summing to 100 blocks save (Req 7.2, 7.3)
 *  - Macro percentages summing to 100 saves successfully
 *  - Calorie floor warning shown but user can still proceed (Req 7.4, 7.5)
 *  - Delete account removes only that user's data (Req 2.9)
 *  - Storage usage indicator renders (Req 11.4)
 *  - High-usage warning banner shows when > 4 MB (Req 11.5)
 *
 * Uses real Zustand stores + StorageRepository (no mocking of business logic).
 * localStorage is cleared between tests.
 *
 * **Validates: Requirements 2.9, 7.1–7.5, 11.3–11.5**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Settings } from '../../pages/Settings.tsx';
import { GoalsEditor } from '../../components/settings/GoalsEditor.tsx';
import { StorageSection } from '../../components/settings/StorageSection.tsx';
import { useAuthStore } from '../../stores/authStore.ts';
import { useFoodStore } from '../../stores/foodStore.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';
import { STORAGE_KEYS, type NutritionGoals, type OnboardingData } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the Settings page inside a minimal router with /login fallback. */
function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Render GoalsEditor with a MemoryRouter wrapper (it uses no router features but
 *  sibling AccountSection does — Settings needs a router in context). */
function renderGoalsEditor(userId: string, sex: 'male' | 'female' = 'female') {
  return render(
    <MemoryRouter>
      <GoalsEditor userId={userId} sex={sex} />
    </MemoryRouter>,
  );
}

function renderStorageSection(userId: string) {
  return render(
    <MemoryRouter>
      <StorageSection userId={userId} />
    </MemoryRouter>,
  );
}

/** Minimal valid onboarding profile factory. */
function makeProfile(
  email: string,
  password = 'settingsPass1',
  sex: 'male' | 'female' = 'female',
): OnboardingData {
  return {
    name: 'Settings User',
    email,
    password,
    dob: '1992-03-22',
    sex,
    heightCm: 165,
    weightKg: 62,
    activityLevel: 'sedentary',
    goal: 'maintain',
  };
}

/** Reset all Zustand store slices. */
function resetStores() {
  useAuthStore.setState({ session: null, currentUser: null });
  useFoodStore.setState({ searchResults: [], customFoods: [] });
}

/** Read goals directly from storage for assertion. */
function readGoals(userId: string): NutritionGoals | null {
  const raw = localStorage.getItem(STORAGE_KEYS.GOALS(userId));
  if (!raw) return null;
  return JSON.parse(raw) as NutritionGoals;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

// ---------------------------------------------------------------------------
// GoalsEditor — macro validation (Req 7.2, 7.3)
// ---------------------------------------------------------------------------

describe('GoalsEditor — macro percentage validation', () => {
  /**
   * **Validates: Requirement 7.2, 7.3**
   *
   * When protein + carbs + fat ≠ 100, clicking Save shows an error message
   * and does NOT write goals to storage.
   */
  it('blocks save when macro percentages do not sum to 100', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('macroerr@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    renderGoalsEditor(userId, 'female');

    // Set calorie target
    await userEvent.clear(screen.getByLabelText(/daily calorie target/i));
    await userEvent.type(screen.getByLabelText(/daily calorie target/i), '1800');

    // Enter macro split that does NOT sum to 100 (40 + 40 + 30 = 110)
    await userEvent.clear(screen.getByLabelText(/protein percentage/i));
    await userEvent.type(screen.getByLabelText(/protein percentage/i), '40');
    await userEvent.clear(screen.getByLabelText(/carbohydrates percentage/i));
    await userEvent.type(screen.getByLabelText(/carbohydrates percentage/i), '40');
    await userEvent.clear(screen.getByLabelText(/fat percentage/i));
    await userEvent.type(screen.getByLabelText(/fat percentage/i), '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/macro percentages must sum to 100/i),
      ).toBeInTheDocument();
    });

    // Goals must NOT have been persisted
    expect(readGoals(userId)).toBeNull();
  });

  /**
   * **Validates: Requirement 7.1, 7.2**
   *
   * When macro percentages sum to exactly 100, Save succeeds and goals are
   * written to storage.
   */
  it('saves goals when macro percentages sum to 100', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('macrosum@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    renderGoalsEditor(userId, 'female');

    await userEvent.clear(screen.getByLabelText(/daily calorie target/i));
    await userEvent.type(screen.getByLabelText(/daily calorie target/i), '1800');

    // Valid split: 30 + 40 + 30 = 100
    await userEvent.clear(screen.getByLabelText(/protein percentage/i));
    await userEvent.type(screen.getByLabelText(/protein percentage/i), '30');
    await userEvent.clear(screen.getByLabelText(/carbohydrates percentage/i));
    await userEvent.type(screen.getByLabelText(/carbohydrates percentage/i), '40');
    await userEvent.clear(screen.getByLabelText(/fat percentage/i));
    await userEvent.type(screen.getByLabelText(/fat percentage/i), '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/goals saved/i);
    });

    // Error must NOT be shown
    expect(screen.queryByText(/macro percentages must sum to 100/i)).not.toBeInTheDocument();

    // Goals should be persisted
    const goals = readGoals(userId);
    expect(goals).not.toBeNull();
    expect(goals!.calorieTarget).toBe(1800);
    expect(goals!.proteinPct).toBe(30);
    expect(goals!.carbsPct).toBe(40);
    expect(goals!.fatPct).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// GoalsEditor — calorie floor warning (Req 7.4, 7.5)
// ---------------------------------------------------------------------------

describe('GoalsEditor — calorie floor warning', () => {
  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * Setting a calorie target below the sex-specific floor shows a warning but
   * still allows the user to save.
   *
   * Female floor: 1200 kcal.
   */
  it('shows floor warning for female user below 1200 kcal and allows save', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(
        makeProfile('floor-female@example.com', 'settingsPass1', 'female'),
      );
    });
    const userId = useAuthStore.getState().session!.userId;

    renderGoalsEditor(userId, 'female');

    // Set a target below 1200 kcal
    await userEvent.clear(screen.getByLabelText(/daily calorie target/i));
    await userEvent.type(screen.getByLabelText(/daily calorie target/i), '1100');

    // Valid macro split
    await userEvent.clear(screen.getByLabelText(/protein percentage/i));
    await userEvent.type(screen.getByLabelText(/protein percentage/i), '30');
    await userEvent.clear(screen.getByLabelText(/carbohydrates percentage/i));
    await userEvent.type(screen.getByLabelText(/carbohydrates percentage/i), '40');
    await userEvent.clear(screen.getByLabelText(/fat percentage/i));
    await userEvent.type(screen.getByLabelText(/fat percentage/i), '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    // Warning should appear
    await waitFor(() => {
      expect(
        screen.getByText(/below the recommended minimum/i),
      ).toBeInTheDocument();
    });

    // Despite the warning, the save should proceed — goals are persisted
    const goals = readGoals(userId);
    expect(goals).not.toBeNull();
    expect(goals!.calorieTarget).toBe(1100);
  });

  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * Male floor: 1500 kcal — same non-blocking behaviour.
   */
  it('shows floor warning for male user below 1500 kcal and allows save', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(
        makeProfile('floor-male@example.com', 'settingsPass1', 'male'),
      );
    });
    const userId = useAuthStore.getState().session!.userId;

    renderGoalsEditor(userId, 'male');

    await userEvent.clear(screen.getByLabelText(/daily calorie target/i));
    await userEvent.type(screen.getByLabelText(/daily calorie target/i), '1400');

    await userEvent.clear(screen.getByLabelText(/protein percentage/i));
    await userEvent.type(screen.getByLabelText(/protein percentage/i), '25');
    await userEvent.clear(screen.getByLabelText(/carbohydrates percentage/i));
    await userEvent.type(screen.getByLabelText(/carbohydrates percentage/i), '50');
    await userEvent.clear(screen.getByLabelText(/fat percentage/i));
    await userEvent.type(screen.getByLabelText(/fat percentage/i), '25');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    await waitFor(() => {
      expect(screen.getByText(/below the recommended minimum/i)).toBeInTheDocument();
    });

    // User can proceed — goals are persisted
    const goals = readGoals(userId);
    expect(goals).not.toBeNull();
    expect(goals!.calorieTarget).toBe(1400);
  });

  /**
   * **Validates: Requirement 7.4**
   *
   * No floor warning when calorie target is at or above the floor.
   */
  it('does not show floor warning when calorie target is above the floor', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(
        makeProfile('nofloor@example.com', 'settingsPass1', 'female'),
      );
    });
    const userId = useAuthStore.getState().session!.userId;

    renderGoalsEditor(userId, 'female');

    await userEvent.clear(screen.getByLabelText(/daily calorie target/i));
    await userEvent.type(screen.getByLabelText(/daily calorie target/i), '1500');

    await userEvent.clear(screen.getByLabelText(/protein percentage/i));
    await userEvent.type(screen.getByLabelText(/protein percentage/i), '30');
    await userEvent.clear(screen.getByLabelText(/carbohydrates percentage/i));
    await userEvent.type(screen.getByLabelText(/carbohydrates percentage/i), '40');
    await userEvent.clear(screen.getByLabelText(/fat percentage/i));
    await userEvent.type(screen.getByLabelText(/fat percentage/i), '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/goals saved/i);
    });

    expect(screen.queryByText(/below the recommended minimum/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delete account — removes only that user's data (Req 2.9)
// ---------------------------------------------------------------------------

describe('AccountSection — delete account', () => {
  /**
   * **Validates: Requirement 2.9**
   *
   * Deleting one account removes ALL of its dietsync:[userId]:* keys but
   * leaves the other account's keys intact.
   */
  it('removes only the deleted user data and preserves the other account', async () => {
    // Create two accounts
    await act(async () => {
      await useAuthStore.getState().createAccount(
        makeProfile('delete-me@example.com', 'pass1'),
      );
    });
    const userId1 = useAuthStore.getState().session!.userId;

    // Write some data for user 1
    storageRepository.set(STORAGE_KEYS.GOALS(userId1), {
      calorieTarget: 2000, proteinPct: 30, carbsPct: 40, fatPct: 30, isManual: true,
    });

    // Reset and create user 2
    useAuthStore.setState({ session: null, currentUser: null });
    await act(async () => {
      await useAuthStore.getState().createAccount(
        makeProfile('keep-me@example.com', 'pass2'),
      );
    });
    const userId2 = useAuthStore.getState().session!.userId;
    storageRepository.set(STORAGE_KEYS.GOALS(userId2), {
      calorieTarget: 1800, proteinPct: 25, carbsPct: 50, fatPct: 25, isManual: true,
    });

    // Confirm both users' data exists before deletion
    expect(localStorage.getItem(STORAGE_KEYS.GOALS(userId1))).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.GOALS(userId2))).not.toBeNull();

    // Delete user 1 via authStore (same as AccountSection calls)
    act(() => {
      useAuthStore.getState().deleteAccount(userId1);
    });

    // User 1's goals key should be gone
    expect(localStorage.getItem(STORAGE_KEYS.GOALS(userId1))).toBeNull();
    // User 1's profile should be gone from dietsync:users
    const usersRaw = localStorage.getItem(STORAGE_KEYS.USERS);
    const users = usersRaw ? JSON.parse(usersRaw) : {};
    expect(users[userId1]).toBeUndefined();

    // User 2's data should be completely intact
    expect(localStorage.getItem(STORAGE_KEYS.GOALS(userId2))).not.toBeNull();
    expect(users[userId2]).toBeDefined();
  });

  /**
   * **Validates: Requirement 2.9**
   *
   * After deleting their account via the Settings UI, the user is navigated
   * to /login and the auth store is cleared.
   */
  it('navigates to /login and clears auth store after account deletion via UI', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(
        makeProfile('ui-delete@example.com', 'pass3'),
      );
    });

    renderSettings();

    // The "Delete account" button should be visible
    const deleteBtn = screen.getByRole('button', { name: /delete account/i });
    await userEvent.click(deleteBtn);

    // Inline confirmation should appear
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /yes, delete my account/i }),
      ).toBeInTheDocument();
    });

    // Confirm deletion
    await userEvent.click(
      screen.getByRole('button', { name: /yes, delete my account/i }),
    );

    // Should navigate to /login
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });

    // Auth store should be cleared
    const { session, currentUser } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(currentUser).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StorageSection — usage indicator and warning (Req 11.4, 11.5)
// ---------------------------------------------------------------------------

describe('StorageSection — storage usage', () => {
  /**
   * **Validates: Requirement 11.4**
   *
   * StorageSection displays the current estimated usage in KB or MB.
   */
  it('displays estimated storage usage', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('storage@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    renderStorageSection(userId);

    // Should show a usage label (KB or MB suffix)
    expect(
      screen.getByText(/estimated usage/i),
    ).toBeInTheDocument();

    // The usage value contains "KB" or "MB"
    const usageEl = screen.getByText(/\d+\.\d+ (KB|MB)/i);
    expect(usageEl).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 11.5**
   *
   * When estimated usage exceeds 4 MB, a non-blocking warning banner appears.
   * The banner is dismissible.
   */
  it('shows non-blocking warning banner when usage > 4 MB', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('highstorage@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    // Write enough data to exceed 4 MB
    const largeValue = 'x'.repeat(4_100_000);
    localStorage.setItem(`dietsync:${userId}:bigkey`, largeValue);

    renderStorageSection(userId);

    // Warning banner should be visible
    await waitFor(() => {
      expect(
        screen.getByRole('alert'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/storage usage is high/i)).toBeInTheDocument();

    // Dismiss the warning
    fireEvent.click(screen.getByRole('button', { name: /dismiss storage warning/i }));

    // Banner should be gone
    await waitFor(() => {
      expect(screen.queryByText(/storage usage is high/i)).not.toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 11.5**
   *
   * No warning banner when usage is below 4 MB.
   */
  it('does not show warning banner when usage is below 4 MB', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('lowstorage@example.com'));
    });
    const userId = useAuthStore.getState().session!.userId;

    renderStorageSection(userId);

    expect(screen.queryByText(/storage usage is high/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Settings page — full render
// ---------------------------------------------------------------------------

describe('Settings page — full render', () => {
  /**
   * Smoke test: the Settings page renders all major sections when a user is
   * logged in.
   */
  it('renders all main settings sections for authenticated user', async () => {
    await act(async () => {
      await useAuthStore.getState().createAccount(makeProfile('fullpage@example.com'));
    });

    renderSettings();

    expect(screen.getByRole('heading', { name: /nutrition goals/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /custom foods/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /storage/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /account/i })).toBeInTheDocument();
  });

  /**
   * When no user is authenticated, the Settings page redirects to /login.
   */
  it('redirects to /login when not authenticated', async () => {
    // No account created — store is empty
    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });
});
