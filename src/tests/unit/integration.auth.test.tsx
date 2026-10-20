/**
 * Integration tests for authentication flow.
 *
 * Tests run against the real AuthStore + AuthService + StorageRepository stack
 * (no mocking of business logic). The Login and Onboarding React components
 * are rendered via @testing-library/react with MemoryRouter so that navigation
 * assertions work with react-router-dom.
 *
 * **Validates: Requirements 2.2–2.6, 1.5**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from '../../pages/Login.tsx';
import { Onboarding } from '../../pages/Onboarding.tsx';
import { useAuthStore } from '../../stores/authStore.ts';
import type { OnboardingData } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders Login and Onboarding pages inside a MemoryRouter with a stubbed
 * /dashboard route so navigation assertions work.
 */
function renderApp(initialPath: '/login' | '/onboarding' = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/dashboard"
          element={<div data-testid="dashboard-page">Dashboard</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Minimal valid onboarding profile factory. */
function makeProfile(
  email: string,
  password = 'integrationPass1',
): OnboardingData {
  return {
    name: 'Integration User',
    email,
    password,
    dob: '1988-07-20',
    sex: 'female',
    heightCm: 163,
    weightKg: 60,
    activityLevel: 'lightly_active',
    goal: 'maintain',
  };
}

/** Reset Zustand auth store to logged-out state. */
function resetStore() {
  useAuthStore.setState({ session: null, currentUser: null });
}

/** Create a real account in storage for subsequent login tests. */
async function createTestAccount(email: string, password: string) {
  await useAuthStore.getState().createAccount(makeProfile(email, password));
  resetStore();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ---------------------------------------------------------------------------
// Login integration tests
// ---------------------------------------------------------------------------

describe('Login integration', () => {
  /**
   * **Validates: Requirements 2.2, 2.4**
   *
   * Submitting correct credentials via the Login form sets the session and
   * currentUser slices in authStore.
   */
  it('login succeeds with correct credentials and updates auth store', async () => {
    const email = 'correct@example.com';
    const password = 'correctPass1';
    await createTestAccount(email, password);

    renderApp('/login');

    await userEvent.type(screen.getByLabelText(/email address/i), email);
    await userEvent.type(screen.getByLabelText(/password/i), password);
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));

    await waitFor(
      () => {
        const { session, currentUser } = useAuthStore.getState();
        expect(session).not.toBeNull();
        expect(currentUser).not.toBeNull();
        expect(currentUser?.email).toBe(email);
      },
      { timeout: 8000 },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * Submitting wrong credentials shows a generic error message that does not
   * reveal whether the email or password was incorrect.
   */
  it('displays generic error on wrong password without revealing which field failed', async () => {
    const email = 'wrongpwd@example.com';
    await createTestAccount(email, 'correctPassword1');

    renderApp('/login');

    await userEvent.type(screen.getByLabelText(/email address/i), email);
    await userEvent.type(screen.getByLabelText(/password/i), 'totallyWrong99');
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));

    await waitFor(
      () => {
        expect(
          screen.getByText(/email or password is incorrect/i),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );

    // Confirm no "email" or "password" field-specific hint in the error text
    const errorEl = screen.getByText(/email or password is incorrect/i);
    expect(errorEl.textContent).not.toMatch(/your email/i);
    expect(errorEl.textContent).not.toMatch(/your password/i);
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * After a successful login the app navigates to /dashboard.
   */
  it('navigates to /dashboard after successful login', async () => {
    const email = 'navigate@example.com';
    const password = 'navPassword1';
    await createTestAccount(email, password);

    renderApp('/login');

    await userEvent.type(screen.getByLabelText(/email address/i), email);
    await userEvent.type(screen.getByLabelText(/password/i), password);
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));

    await waitFor(
      () => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * Failed login does NOT navigate away from the login page.
   */
  it('stays on login page after failed login', async () => {
    const email = 'stay@example.com';
    await createTestAccount(email, 'realPassword1');

    renderApp('/login');

    await userEvent.type(screen.getByLabelText(/email address/i), email);
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongPassword');
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));

    await waitFor(
      () => {
        expect(
          screen.getByText(/email or password is incorrect/i),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );

    // Dashboard should NOT be rendered
    expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
    // Sign-in form still visible
    expect(
      screen.getByRole('form', { name: /sign in form/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Onboarding integration tests
// ---------------------------------------------------------------------------

describe('Onboarding integration', () => {
  /**
   * **Validates: Requirements 1.5, 2.1, 2.4**
   *
   * Completing the onboarding wizard creates an account, establishes a
   * session, and navigates to /dashboard.
   */
  it('navigates to /dashboard after successful account creation', async () => {
    renderApp('/onboarding');

    // ── Step 1: fill profile ──────────────────────────────────────────────
    await userEvent.type(screen.getByLabelText(/full name/i), 'New User');
    await userEvent.type(
      screen.getByLabelText(/email address/i),
      'newuser@example.com',
    );
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1992-11-25');
    await userEvent.selectOptions(
      screen.getByLabelText(/biological sex/i),
      'female',
    );
    await userEvent.type(screen.getByLabelText(/height \(cm\)/i), '168');
    await userEvent.type(screen.getByLabelText(/current weight \(kg\)/i), '62');
    await userEvent.selectOptions(
      screen.getByLabelText(/activity level/i),
      'sedentary',
    );
    await userEvent.selectOptions(screen.getByLabelText(/goal/i), 'lose');

    fireEvent.submit(
      screen.getByRole('form', { name: /profile information form/i }),
    );

    // ── Step 2: TDEE preview ──────────────────────────────────────────────
    await waitFor(() => {
      expect(
        screen.getByText(/estimated calorie needs/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    // ── Step 3: set password ──────────────────────────────────────────────
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /create your account/i }),
      ).toBeInTheDocument();
    });

    await userEvent.type(
      screen.getByLabelText(/^password$/i),
      'strongPassw0rd',
    );
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      'strongPassw0rd',
    );

    fireEvent.submit(
      screen.getByRole('form', { name: /create account form/i }),
    );

    // ── Verify navigation ──────────────────────────────────────────────────
    await waitFor(
      () => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.4**
   *
   * After a successful onboarding the auth store contains a valid session
   * and the new user's profile.
   */
  it('auth store holds session and user profile after account creation', async () => {
    renderApp('/onboarding');

    const email = 'storecheck@example.com';

    await userEvent.type(screen.getByLabelText(/full name/i), 'Store Check');
    await userEvent.type(screen.getByLabelText(/email address/i), email);
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1995-04-12');
    await userEvent.selectOptions(
      screen.getByLabelText(/biological sex/i),
      'male',
    );
    await userEvent.type(screen.getByLabelText(/height \(cm\)/i), '175');
    await userEvent.type(screen.getByLabelText(/current weight \(kg\)/i), '75');
    await userEvent.selectOptions(
      screen.getByLabelText(/activity level/i),
      'moderately_active',
    );
    await userEvent.selectOptions(screen.getByLabelText(/goal/i), 'gain');

    fireEvent.submit(
      screen.getByRole('form', { name: /profile information form/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/estimated calorie needs/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /create your account/i }),
      ).toBeInTheDocument();
    });

    await userEvent.type(
      screen.getByLabelText(/^password$/i),
      'anotherGoodPass1',
    );
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      'anotherGoodPass1',
    );

    fireEvent.submit(
      screen.getByRole('form', { name: /create account form/i }),
    );

    await waitFor(
      () => {
        const { session, currentUser } = useAuthStore.getState();
        expect(session).not.toBeNull();
        expect(currentUser).not.toBeNull();
        expect(currentUser?.email).toBe(email);
        expect(currentUser?.userId).toBe(session?.userId);
      },
      { timeout: 10000 },
    );
  });
});
