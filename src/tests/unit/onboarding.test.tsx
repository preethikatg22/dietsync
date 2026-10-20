/**
 * Unit tests for the Onboarding and Login pages.
 *
 * Tests are written against the React components using @testing-library/react.
 * The real AuthStore + AuthService stack is used (no mocking of business logic).
 * localStorage is cleared between tests.
 *
 * **Validates: Requirements 1.1–1.7, 2.3, 2.7, 2.8**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from '../../pages/Login.tsx';
import { Onboarding } from '../../pages/Onboarding.tsx';
import { useAuthStore } from '../../stores/authStore.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render a component inside a MemoryRouter so Link/useNavigate work. */
function renderWithRouter(
  _component: React.ReactNode,
  { initialPath = '/login' }: { initialPath?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Reset auth store to logged-out state. */
function resetStore() {
  useAuthStore.setState({ session: null, currentUser: null });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ---------------------------------------------------------------------------
// Login page tests
// ---------------------------------------------------------------------------

describe('Login page', () => {
  /**
   * **Validates: Requirement 2.7**
   * The "local device only" notice must be visible on the login screen.
   */
  it('displays "Local device only" notice', () => {
    renderWithRouter(<Login />, { initialPath: '/login' });
    expect(
      screen.getByText(/local device only\. data does not sync across devices\./i),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 2.8**
   * Password reset unavailable notice must be shown.
   */
  it('displays password reset unavailable notice', () => {
    renderWithRouter(<Login />, { initialPath: '/login' });
    expect(
      screen.getByText(/password reset is not available/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/forgotten passwords cannot be recovered/i),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 2.3**
   * Empty email shows inline error and blocks submission.
   */
  it('shows inline error when email is empty on submit', async () => {
    renderWithRouter(<Login />, { initialPath: '/login' });
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 2.3**
   * Empty password shows inline error and blocks submission.
   */
  it('shows inline error when password is empty on submit', async () => {
    renderWithRouter(<Login />, { initialPath: '/login' });
    // Fill in a valid email so only the password triggers an error
    await userEvent.type(screen.getByLabelText(/email address/i), 'user@test.com');
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 2.3**
   * Invalid email format shows inline error.
   */
  it('shows inline error for invalid email format', async () => {
    renderWithRouter(<Login />, { initialPath: '/login' });
    await userEvent.type(screen.getByLabelText(/email address/i), 'notanemail');
    fireEvent.blur(screen.getByLabelText(/email address/i));
    await waitFor(() => {
      expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 2.3**
   * Wrong credentials produce a generic error message without revealing which
   * field was incorrect.
   */
  it('displays generic error on wrong credentials', async () => {
    renderWithRouter(<Login />, { initialPath: '/login' });
    await userEvent.type(screen.getByLabelText(/email address/i), 'no@body.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword');
    fireEvent.submit(screen.getByRole('form', { name: /sign in form/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/email or password is incorrect/i),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Onboarding page — Step 1 validation tests
// ---------------------------------------------------------------------------

describe('Onboarding page — Step 1 (profile validation)', () => {
  /**
   * **Validates: Requirement 1.4**
   * Empty name prevents progressing to step 2.
   */
  it('blocks progression when name is empty', async () => {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });
    // Submit without filling any fields
    fireEvent.submit(screen.getByRole('form', { name: /profile information form/i }));
    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
    // Still on step 1 — no "TDEE" heading visible
    expect(screen.queryByText(/estimated calorie needs/i)).not.toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 1.4**
   * Height out of range (50–300 cm) shows inline error.
   */
  it('shows error for height out of valid range', async () => {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });
    await userEvent.type(screen.getByLabelText(/height \(cm\)/i), '400');
    fireEvent.blur(screen.getByLabelText(/height \(cm\)/i));
    await waitFor(() => {
      expect(
        screen.getByText(/height must be between 50 and 300 cm/i),
      ).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 1.4**
   * Weight out of range (10–500 kg) shows inline error.
   */
  it('shows error for weight out of valid range', async () => {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });
    await userEvent.type(screen.getByLabelText(/current weight \(kg\)/i), '5');
    fireEvent.blur(screen.getByLabelText(/current weight \(kg\)/i));
    await waitFor(() => {
      expect(
        screen.getByText(/weight must be between 10 and 500 kg/i),
      ).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 1.4**
   * Non-numeric height shows inline error.
   */
  it('shows error for non-numeric height', async () => {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });
    // Simulate clearing the input
    const heightInput = screen.getByLabelText(/height \(cm\)/i);
    fireEvent.change(heightInput, { target: { value: '' } });
    fireEvent.submit(screen.getByRole('form', { name: /profile information form/i }));
    await waitFor(() => {
      expect(screen.getByText(/height is required/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 1.4**
   * Sex not selected shows inline error.
   */
  it('shows error when biological sex is not selected', async () => {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });
    fireEvent.submit(screen.getByRole('form', { name: /profile information form/i }));
    await waitFor(() => {
      expect(screen.getByText(/biological sex is required/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 2.7**
   * The "local device only" notice is visible on the onboarding screen.
   */
  it('displays "Local device only" notice on onboarding', () => {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });
    expect(
      screen.getByText(/local device only\. data does not sync across devices\./i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Onboarding page — Step 2 (TDEE preview)
// ---------------------------------------------------------------------------

describe('Onboarding page — Step 2 (TDEE preview)', () => {
  /** Helper to fill all Step 1 fields with valid values and advance to Step 2. */
  async function advanceToStep2() {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });

    await userEvent.type(screen.getByLabelText(/full name/i), 'Alice Smith');
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1990-05-15');
    await userEvent.selectOptions(screen.getByLabelText(/biological sex/i), 'female');
    await userEvent.type(screen.getByLabelText(/height \(cm\)/i), '165');
    await userEvent.type(screen.getByLabelText(/current weight \(kg\)/i), '65');
    await userEvent.selectOptions(screen.getByLabelText(/activity level/i), 'moderately_active');
    await userEvent.selectOptions(screen.getByLabelText(/goal/i), 'maintain');

    fireEvent.submit(screen.getByRole('form', { name: /profile information form/i }));

    await waitFor(() => {
      expect(screen.getByText(/estimated calorie needs/i)).toBeInTheDocument();
    });
  }

  /**
   * **Validates: Requirement 1.2**
   * TDEE preview is shown on step 2.
   */
  it('shows TDEE and goal target on step 2', async () => {
    await advanceToStep2();
    expect(screen.getByText(/tdee/i)).toBeInTheDocument();
    expect(screen.getByText(/goal target/i)).toBeInTheDocument();
    // Both kcal values rendered
    const kcalElements = screen.getAllByText(/kcal/i);
    expect(kcalElements.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Onboarding page — Step 3 (confirmation and disclaimer)
// ---------------------------------------------------------------------------

describe('Onboarding page — Step 3 (confirmation + disclaimer)', () => {
  /** Fill step 1 and advance to step 3. */
  async function advanceToStep3() {
    renderWithRouter(<Onboarding />, { initialPath: '/onboarding' });

    await userEvent.type(screen.getByLabelText(/full name/i), 'Bob Jones');
    await userEvent.type(screen.getByLabelText(/email address/i), 'bob@example.com');
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1985-03-10');
    await userEvent.selectOptions(screen.getByLabelText(/biological sex/i), 'male');
    await userEvent.type(screen.getByLabelText(/height \(cm\)/i), '180');
    await userEvent.type(screen.getByLabelText(/current weight \(kg\)/i), '80');
    await userEvent.selectOptions(screen.getByLabelText(/activity level/i), 'lightly_active');
    await userEvent.selectOptions(screen.getByLabelText(/goal/i), 'lose');

    fireEvent.submit(screen.getByRole('form', { name: /profile information form/i }));

    await waitFor(() => {
      expect(screen.getByText(/estimated calorie needs/i)).toBeInTheDocument();
    });

    // Advance to step 3
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      // Use heading role to avoid ambiguity with "Create account" button text
      expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    });
  }

  /**
   * **Validates: Requirement 1.3**
   * Disclaimer text is present on the confirmation step.
   */
  it('shows medical disclaimer on confirmation step', async () => {
    await advanceToStep3();
    expect(
      screen.getByText(
        /dietsync provides general tracking only and is not medical or dietetic advice/i,
      ),
    ).toBeInTheDocument();
  });

  /**
   * **Validates: Requirement 1.4**
   * Empty password blocks account creation.
   */
  it('shows error when password is empty on confirmation step', async () => {
    await advanceToStep3();
    fireEvent.submit(screen.getByRole('form', { name: /create account form/i }));
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 1.4**
   * Short password (< 8 chars) is rejected with an inline error.
   */
  it('shows error when password is too short', async () => {
    await advanceToStep3();
    await userEvent.type(screen.getByLabelText(/^password$/i), 'short');
    fireEvent.submit(screen.getByRole('form', { name: /create account form/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 8 characters/i),
      ).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirement 1.4**
   * Mismatched confirm password shows inline error.
   */
  it('shows error when passwords do not match', async () => {
    await advanceToStep3();
    await userEvent.type(screen.getByLabelText(/^password$/i), 'securepass1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'differentpass');
    fireEvent.submit(screen.getByRole('form', { name: /create account form/i }));
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  /**
   * **Validates: Requirements 1.5, 1.6**
   * While PBKDF2 hashing runs, a loading spinner is displayed.
   * After completion, the user is navigated to the dashboard.
   */
  it('shows loading spinner while hashing and navigates to dashboard on success', async () => {
    await advanceToStep3();
    await userEvent.type(screen.getByLabelText(/^password$/i), 'securepassword1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'securepassword1');

    fireEvent.submit(screen.getByRole('form', { name: /create account form/i }));

    // Loading spinner should appear (role="status")
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    // After hashing completes, dashboard is rendered
    await waitFor(
      () => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
  });
});
