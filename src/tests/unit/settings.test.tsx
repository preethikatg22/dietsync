/**
 * Unit tests for the Settings page and its sub-components.
 *
 * Covers five key scenarios:
 * 1. GoalsEditor — macro percentages that don't sum to 100 show an error
 * 2. GoalsEditor — calorie floor warning for values below the recommended minimum
 * 3. CustomFoodsManager — empty-state message when no custom foods exist
 * 4. AccountSection — delete-account confirmation flow calls deleteAccount
 * 5. StorageSection — high-usage warning when storage > 4 MB
 *
 * Uses @testing-library/react + Vitest. The storageRepository is mocked so
 * StorageSection tests can control the reported byte usage. Auth state is
 * seeded directly into the Zustand store so no real crypto/IO is needed for
 * most tests.
 *
 * **Validates: Requirements 2.6, 2.9, 4.1–4.7, 7.1–7.8, 11.3–11.5**
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Settings } from '../../pages/Settings.tsx';
import { GoalsEditor } from '../../components/settings/GoalsEditor.tsx';
import { CustomFoodsManager } from '../../components/settings/CustomFoodsManager.tsx';
import { AccountSection } from '../../components/settings/AccountSection.tsx';
import { StorageSection } from '../../components/settings/StorageSection.tsx';
import { useAuthStore } from '../../stores/authStore.ts';
import { useFoodStore } from '../../stores/foodStore.ts';

// ---------------------------------------------------------------------------
// Mock storageRepository so component tests don't depend on real localStorage
// beyond what Zustand already handles. The mock is scoped per test via
// mockEstimatedUsageBytes.
// ---------------------------------------------------------------------------

const mockEstimatedUsageBytes = vi.fn(() => 0);
const mockStorageSet = vi.fn();

/**
 * Smart mock for storageRepository.get:
 * - custom foods keys return [] (so LocalFoodRepository iteration doesn't fail)
 * - everything else returns the provided fallback (3rd argument)
 */
// Returns [] for custom-foods keys (so LocalFoodRepository doesn't fail on spread),
// otherwise returns the fallback.
const mockStorageGet = vi.fn((_key: string, _schema: unknown, fallback: unknown): unknown => {
  if (typeof _key === 'string' && _key.includes(':customFoods')) return [];
  return fallback;
});

vi.mock('../../repositories/StorageRepository.ts', () => ({
  storageRepository: {
    estimatedUsageBytes: () => mockEstimatedUsageBytes(),
    get: (key: string, schema: unknown, fallback: unknown) =>
      mockStorageGet(key, schema, fallback),
    set: (...args: unknown[]) => mockStorageSet(...args),
    remove: vi.fn(),
  },
  // Re-export STORAGE_KEYS so any code that imports it from this module still
  // works. The actual keys are strings so we just re-export the real ones.
  STORAGE_KEYS: {
    USERS: 'dietsync:users',
    AUTH: 'dietsync:auth',
    SESSION: 'dietsync:session',
    LOGS: (id: string) => `dietsync:${id}:logs`,
    WEIGHT: (id: string) => `dietsync:${id}:weight`,
    WATER: (id: string) => `dietsync:${id}:water`,
    CUSTOM_FOODS: (id: string) => `dietsync:${id}:customFoods`,
    GOALS: (id: string) => `dietsync:${id}:goals`,
    SETTINGS: (id: string) => `dietsync:${id}:settings`,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed the authStore with a known user so pages don't redirect to /login. */
function seedAuth({
  userId = 'test-user-1',
  sex = 'male' as const,
  name = 'Test User',
} = {}) {
  const expiresAt = new Date(Date.now() + 86400 * 1000 * 30).toISOString();
  useAuthStore.setState({
    session: { userId, expiresAt },
    currentUser: {
      userId,
      name,
      email: 'test@example.com',
      dob: '1990-01-01',
      sex,
      heightCm: 175,
      weightKg: 70,
      activityLevel: 'moderately_active',
      goal: 'maintain',
      createdAt: new Date().toISOString(),
    },
  });
}

/** Reset all stores to logged-out / empty state. */
function resetStores() {
  useAuthStore.setState({ session: null, currentUser: null });
  useFoodStore.setState({ searchResults: [], customFoods: [] });
}

/** Render the full Settings page inside a MemoryRouter. */
function renderSettingsPage() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Render GoalsEditor standalone with default props. */
function renderGoalsEditor(sex: 'male' | 'female' = 'male') {
  return render(
    <MemoryRouter>
      <GoalsEditor userId="test-user-1" sex={sex} />
    </MemoryRouter>,
  );
}

/** Render StorageSection standalone. */
function renderStorageSection() {
  return render(
    <MemoryRouter>
      <StorageSection userId="test-user-1" />
    </MemoryRouter>,
  );
}

/** Render AccountSection standalone with a given userId. */
function renderAccountSection(userId = 'test-user-1') {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route
          path="/settings"
          element={<AccountSection userId={userId} />}
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Render CustomFoodsManager standalone. */
function renderCustomFoodsManager() {
  return render(
    <MemoryRouter>
      <CustomFoodsManager userId="test-user-1" />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
  vi.clearAllMocks();
  // Restore the custom-foods-aware implementation after clearAllMocks resets it
  mockStorageGet.mockImplementation((_key: string, _schema: unknown, fallback: unknown) => {
    if (typeof _key === 'string' && _key.includes(':customFoods')) return [];
    return fallback;
  });
  // Default: report 0 bytes used
  mockEstimatedUsageBytes.mockReturnValue(0);
});

// ---------------------------------------------------------------------------
// 1. GoalsEditor — macro percentages must sum to 100
// ---------------------------------------------------------------------------

describe('GoalsEditor — macro sum validation (Req 7.3)', () => {
  /**
   * **Validates: Requirement 7.3**
   *
   * Clicking "Save goals" when protein + carbs + fat ≠ 100 shows the error
   * message "Macro percentages must sum to 100."
   */
  it('shows macro-sum error when percentages do not add up to 100', async () => {
    renderGoalsEditor();

    // Fill in a calorie target
    const caloriesInput = screen.getByLabelText(/daily calorie target/i);
    await userEvent.clear(caloriesInput);
    await userEvent.type(caloriesInput, '2000');

    // Enter percentages that sum to 110 (not 100)
    const proteinInput = screen.getByLabelText(/protein percentage/i);
    const carbsInput = screen.getByLabelText(/carbohydrates percentage/i);
    const fatInput = screen.getByLabelText(/fat percentage/i);

    await userEvent.clear(proteinInput);
    await userEvent.type(proteinInput, '50');
    await userEvent.clear(carbsInput);
    await userEvent.type(carbsInput, '40');
    await userEvent.clear(fatInput);
    await userEvent.type(fatInput, '20');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    expect(
      screen.getByText(/macro percentages must sum to 100/i),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 7.3**
   *
   * When the percentages DO sum to 100, no macro error is displayed and
   * the save success message appears instead.
   */
  it('does not show the macro error when percentages sum to exactly 100', async () => {
    renderGoalsEditor();

    const caloriesInput = screen.getByLabelText(/daily calorie target/i);
    await userEvent.clear(caloriesInput);
    await userEvent.type(caloriesInput, '2000');

    const proteinInput = screen.getByLabelText(/protein percentage/i);
    const carbsInput = screen.getByLabelText(/carbohydrates percentage/i);
    const fatInput = screen.getByLabelText(/fat percentage/i);

    await userEvent.clear(proteinInput);
    await userEvent.type(proteinInput, '30');
    await userEvent.clear(carbsInput);
    await userEvent.type(carbsInput, '40');
    await userEvent.clear(fatInput);
    await userEvent.type(fatInput, '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    expect(
      screen.queryByText(/macro percentages must sum to 100/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/goals saved successfully/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. GoalsEditor — calorie floor warning
// ---------------------------------------------------------------------------

describe('GoalsEditor — calorie floor warning (Req 7.4, 7.5)', () => {
  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For a male user, entering a calorie target below 1500 and clicking
   * "Save goals" (with valid macros) shows a non-blocking floor warning.
   */
  it('shows floor warning for male user below 1500 kcal', async () => {
    renderGoalsEditor('male');

    const caloriesInput = screen.getByLabelText(/daily calorie target/i);
    await userEvent.clear(caloriesInput);
    await userEvent.type(caloriesInput, '1000');

    // Valid macro split
    const proteinInput = screen.getByLabelText(/protein percentage/i);
    const carbsInput = screen.getByLabelText(/carbohydrates percentage/i);
    const fatInput = screen.getByLabelText(/fat percentage/i);

    await userEvent.clear(proteinInput);
    await userEvent.type(proteinInput, '30');
    await userEvent.clear(carbsInput);
    await userEvent.type(carbsInput, '40');
    await userEvent.clear(fatInput);
    await userEvent.type(fatInput, '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    // Warning should mention "below the recommended minimum"
    expect(screen.getByRole('alert')).toHaveTextContent(
      /below the recommended minimum/i,
    );
  });

  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For a female user, entering a calorie target below 1200 and clicking
   * "Save goals" shows a non-blocking floor warning.
   */
  it('shows floor warning for female user below 1200 kcal', async () => {
    renderGoalsEditor('female');

    const caloriesInput = screen.getByLabelText(/daily calorie target/i);
    await userEvent.clear(caloriesInput);
    await userEvent.type(caloriesInput, '1000');

    const proteinInput = screen.getByLabelText(/protein percentage/i);
    const carbsInput = screen.getByLabelText(/carbohydrates percentage/i);
    const fatInput = screen.getByLabelText(/fat percentage/i);

    await userEvent.clear(proteinInput);
    await userEvent.type(proteinInput, '30');
    await userEvent.clear(carbsInput);
    await userEvent.type(carbsInput, '40');
    await userEvent.clear(fatInput);
    await userEvent.type(fatInput, '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /below the recommended minimum/i,
    );
  });

  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * The floor warning is non-blocking: saving still succeeds (success message
   * is also shown alongside the warning).
   */
  it('still saves successfully when floor warning is present (non-blocking)', async () => {
    renderGoalsEditor('male');

    const caloriesInput = screen.getByLabelText(/daily calorie target/i);
    await userEvent.clear(caloriesInput);
    await userEvent.type(caloriesInput, '1000');

    const proteinInput = screen.getByLabelText(/protein percentage/i);
    const carbsInput = screen.getByLabelText(/carbohydrates percentage/i);
    const fatInput = screen.getByLabelText(/fat percentage/i);

    await userEvent.clear(proteinInput);
    await userEvent.type(proteinInput, '30');
    await userEvent.clear(carbsInput);
    await userEvent.type(carbsInput, '40');
    await userEvent.clear(fatInput);
    await userEvent.type(fatInput, '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    // Both warning AND success message are visible
    expect(screen.getByRole('alert')).toHaveTextContent(
      /below the recommended minimum/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/goals saved successfully/i);
  });

  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * No floor warning is shown when the calorie target is at or above the
   * recommended minimum for the user's sex.
   */
  it('does not show floor warning when calorie target is above the minimum', async () => {
    renderGoalsEditor('male');

    const caloriesInput = screen.getByLabelText(/daily calorie target/i);
    await userEvent.clear(caloriesInput);
    await userEvent.type(caloriesInput, '2000');

    const proteinInput = screen.getByLabelText(/protein percentage/i);
    const carbsInput = screen.getByLabelText(/carbohydrates percentage/i);
    const fatInput = screen.getByLabelText(/fat percentage/i);

    await userEvent.clear(proteinInput);
    await userEvent.type(proteinInput, '30');
    await userEvent.clear(carbsInput);
    await userEvent.type(carbsInput, '40');
    await userEvent.clear(fatInput);
    await userEvent.type(fatInput, '30');

    fireEvent.click(screen.getByRole('button', { name: /save goals/i }));

    expect(
      screen.queryByText(/below the recommended minimum/i),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. CustomFoodsManager — empty state
// ---------------------------------------------------------------------------

describe('CustomFoodsManager — empty state (Req 4.3)', () => {
  /**
   * **Validates: Requirement 4.3**
   *
   * When customFoods is empty the component shows the empty-state message.
   */
  it('shows "No custom foods yet. Add one below." when there are no custom foods', () => {
    // foodStore.customFoods is already [] from resetStores()
    renderCustomFoodsManager();

    expect(
      screen.getByText(/no custom foods yet\. add one below\./i),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 4.3**
   *
   * When customFoods has items the empty-state message is not shown.
   */
  it('does not show empty-state message when custom foods exist', () => {
    const myFood = {
      id: 'custom_abc',
      name: 'My Granola',
      category: 'snacks',
      caloriesPer100g: 400,
      proteinPer100g: 10,
      carbsPer100g: 60,
      fatPer100g: 15,
      isCustom: true,
    };

    // Make storageRepository.get return [myFood] for the custom foods key
    // so that loadCustomFoods (called on mount) populates the store correctly.
    mockStorageGet.mockImplementation((_key: string, _schema: unknown, fallback: unknown) => {
      if (typeof _key === 'string' && _key.includes(':customFoods')) return [myFood];
      return fallback;
    });

    renderCustomFoodsManager();

    expect(
      screen.queryByText(/no custom foods yet/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('My Granola')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. AccountSection — delete-account confirmation flow
// ---------------------------------------------------------------------------

describe('AccountSection — delete-account confirmation (Req 2.9)', () => {
  /**
   * **Validates: Requirement 2.9**
   *
   * Clicking the "Delete account" button reveals the inline confirmation
   * panel with "Yes, delete my account" and "Cancel" buttons.
   */
  it('shows inline confirmation panel when "Delete account" is clicked', async () => {
    seedAuth();
    renderAccountSection();

    // The inline confirmation panel should NOT be visible initially
    expect(
      screen.queryByText(/yes, delete my account/i),
    ).not.toBeInTheDocument();

    // Click the "Delete account" button
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));

    // The confirmation panel is now visible
    expect(
      screen.getByRole('button', { name: /yes, delete my account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^cancel$/i }),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 2.9**
   *
   * Clicking "Cancel" in the confirmation panel hides it again without
   * calling deleteAccount.
   */
  it('hides the confirmation panel when "Cancel" is clicked', async () => {
    seedAuth();
    renderAccountSection();

    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    // Panel is now open; click Cancel
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(
      screen.queryByText(/yes, delete my account/i),
    ).not.toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 2.9**
   *
   * Clicking "Yes, delete my account" calls the authStore.deleteAccount
   * action with the correct userId.
   */
  it('calls deleteAccount when "Yes, delete my account" is confirmed', async () => {
    seedAuth({ userId: 'user-to-delete' });

    // Spy on the store's deleteAccount action
    const deleteAccountSpy = vi.fn();
    useAuthStore.setState({ deleteAccount: deleteAccountSpy } as Partial<ReturnType<typeof useAuthStore.getState>>);

    // Pass the same userId used in seedAuth so the component calls deleteAccount('user-to-delete')
    renderAccountSection('user-to-delete');

    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete my account/i }));

    expect(deleteAccountSpy).toHaveBeenCalledWith('user-to-delete');
  });
});

// ---------------------------------------------------------------------------
// 5. StorageSection — high-usage warning
// ---------------------------------------------------------------------------

describe('StorageSection — high-usage warning (Req 11.4, 11.5)', () => {
  /**
   * **Validates: Requirements 11.4, 11.5**
   *
   * When estimatedUsageBytes() returns a value > 4,000,000 the component
   * renders the high-usage warning alert.
   */
  it('shows high-usage warning when storage exceeds 4 MB', () => {
    mockEstimatedUsageBytes.mockReturnValue(4_500_000); // 4.5 MB

    renderStorageSection();

    // The warning alert is rendered
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/storage usage is high/i);
    expect(alert).toHaveTextContent(/4 MB/i);
  });

  /**
   * **Validates: Requirements 11.4, 11.5**
   *
   * When usage is at or below 4 MB the warning is NOT shown.
   */
  it('does not show the warning when storage usage is within the limit', () => {
    mockEstimatedUsageBytes.mockReturnValue(1_000_000); // 1 MB

    renderStorageSection();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * **Validates: Requirements 11.4, 11.5**
   *
   * The warning can be dismissed by clicking the × button; after dismissal
   * the alert is no longer in the DOM.
   */
  it('hides the warning when the dismiss button is clicked', async () => {
    mockEstimatedUsageBytes.mockReturnValue(5_000_000); // 5 MB

    renderStorageSection();

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();

    // Click the dismiss button (aria-label "Dismiss storage warning")
    fireEvent.click(
      screen.getByRole('button', { name: /dismiss storage warning/i }),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 11.3**
   *
   * The pruning-days selector is rendered with all expected options.
   */
  it('renders the log pruning days selector with 30/60/90/180 options', () => {
    renderStorageSection();

    const select = screen.getByLabelText(/keep log history for/i);
    expect(select).toBeInTheDocument();

    const options = Array.from(
      (select as HTMLSelectElement).options,
    ).map((o) => Number(o.value));
    expect(options).toEqual(expect.arrayContaining([30, 60, 90, 180]));
  });

  /**
   * **Validates: Requirement 11.3**
   *
   * After saving, the "Settings saved." success message appears.
   */
  it('shows "Settings saved." after clicking Save settings', async () => {
    renderStorageSection();

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/settings saved/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Settings page — redirects unauthenticated users
// ---------------------------------------------------------------------------

describe('Settings page — authentication guard', () => {
  /**
   * **Validates: (implicit auth guard in Settings.tsx)**
   *
   * When no session is present the Settings page redirects to /login.
   */
  it('redirects to /login when unauthenticated', async () => {
    // No seedAuth — stores are already reset to null session
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText(/login page/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: (implicit auth guard in Settings.tsx)**
   *
   * When a session is present the Settings page renders its content.
   */
  it('renders the Settings page when authenticated', async () => {
    seedAuth();

    await act(async () => {
      renderSettingsPage();
    });

    expect(screen.getByRole('heading', { name: /^settings$/i })).toBeInTheDocument();
  });
});
