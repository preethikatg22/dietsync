/**
 * Integration tests — Authentication flows
 *
 * Tests run against the REAL authStore → AuthService → StorageRepository stack.
 * No mocks of AuthService or StorageRepository are used.
 *
 * Covered flows (Requirements 2.2–2.6):
 *  1. Login succeeds with correct credentials — session written to storage and
 *     store state updated.
 *  2. Login fails with wrong password — no session created, store state
 *     unchanged, generic error returned.
 *  3. Expired session is invalidated — validateSession() returns null and the
 *     session key is removed from storage.
 *  4. Logout clears the session from both the Zustand store and LocalStorage.
 *  5. Login with a non-existent email fails with a generic error (no leak of
 *     which field was wrong).
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/authStore.ts';
import { authService } from '../../services/AuthService.ts';
import { STORAGE_KEYS, type OnboardingData, type Session } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid onboarding profile factory. */
function makeProfile(
  email: string,
  password = 'IntegrationPass1!',
): OnboardingData {
  return {
    name: 'Integration User',
    email,
    password,
    dob: '1990-03-15',
    sex: 'male',
    heightCm: 178,
    weightKg: 75,
    activityLevel: 'moderately_active',
    goal: 'maintain',
  };
}

/** Reset Zustand auth store to a known logged-out state. */
function resetStore(): void {
  useAuthStore.setState({ session: null, currentUser: null });
}

/**
 * Create a real account in storage via the auth store, then reset the
 * store and remove the active session to simulate a fresh (logged-out)
 * state before the actual test.
 *
 * `createAccount` internally calls `authService.login` which writes a
 * session to LocalStorage. Removing it here ensures pre-conditions that
 * assert "no session in storage" start from a clean slate.
 */
async function seedAccount(email: string, password: string): Promise<void> {
  await useAuthStore.getState().createAccount(makeProfile(email, password));
  resetStore();
  // Remove the session that createAccount auto-created so each test can
  // verify from a fully logged-out state.
  localStorage.removeItem(STORAGE_KEYS.SESSION);
}

// ---------------------------------------------------------------------------
// Setup — start each test with clean storage and a logged-out store
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ---------------------------------------------------------------------------
// 1. Login succeeds with correct credentials
// ---------------------------------------------------------------------------

describe('Requirement 2.2 / 2.4 — successful login', () => {
  it('creates a session in LocalStorage and updates both store slices', async () => {
    const email = 'success@example.com';
    const password = 'CorrectPass1!';
    await seedAccount(email, password);

    // Pre-condition: store is empty, storage has no session key
    expect(useAuthStore.getState().session).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();

    await useAuthStore.getState().login(email, password);

    const { session, currentUser } = useAuthStore.getState();

    // Store slices are populated
    expect(session).not.toBeNull();
    expect(currentUser).not.toBeNull();
    expect(currentUser?.email).toBe(email);
    expect(currentUser?.userId).toBe(session?.userId);

    // Session is persisted to LocalStorage
    const rawSession = localStorage.getItem(STORAGE_KEYS.SESSION);
    expect(rawSession).not.toBeNull();
    const parsedSession: Session = JSON.parse(rawSession!);
    expect(parsedSession.userId).toBe(session?.userId);

    // Session expiry is roughly 30 days from now (within ±5 s tolerance)
    const expiresMs = new Date(parsedSession.expiresAt).getTime();
    const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(5000);
  });
});

// ---------------------------------------------------------------------------
// 2. Login fails with wrong password
// ---------------------------------------------------------------------------

describe('Requirement 2.3 — wrong password', () => {
  it('rejects and returns a generic error without creating a session', async () => {
    const email = 'wrongpwd@example.com';
    await seedAccount(email, 'CorrectPassword1!');

    let thrownError: unknown;
    try {
      await useAuthStore.getState().login(email, 'TotallyWrongPassword!');
    } catch (err) {
      thrownError = err;
    }

    // The store action should have thrown
    expect(thrownError).toBeInstanceOf(Error);

    // Generic message — does not indicate which field (email vs password)
    const message = (thrownError as Error).message;
    expect(message).toMatch(/email or password is incorrect/i);
    expect(message).not.toMatch(/your email/i);
    expect(message).not.toMatch(/your password/i);

    // Store state unchanged — still logged out
    const { session, currentUser } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(currentUser).toBeNull();

    // No session written to LocalStorage
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Expired session is invalidated by validateSession()
// ---------------------------------------------------------------------------

describe('Requirement 2.5 — expired session', () => {
  it('validateSession() returns null and removes the session from storage', async () => {
    // Write a session whose expiry is 1 hour in the past
    const email = 'expired@example.com';
    await seedAccount(email, 'ExpiredPass1!');

    // Login to get a real userId, then manually overwrite with an expired session
    await useAuthStore.getState().login(email, 'ExpiredPass1!');
    const userId = useAuthStore.getState().session!.userId;
    resetStore();

    const expiredSession: Session = {
      userId,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(expiredSession));

    // validateSession via authService (the method called by the store)
    const result = authService.validateSession();

    // Must return null for an expired session
    expect(result).toBeNull();

    // Session must be removed from LocalStorage
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });

  it('store validateSession() clears both slices when session is expired', async () => {
    const email = 'expiredstore@example.com';
    await seedAccount(email, 'ExpiredPass2!');

    await useAuthStore.getState().login(email, 'ExpiredPass2!');
    const userId = useAuthStore.getState().session!.userId;

    // Overwrite the session in storage with an expired one
    const expiredSession: Session = {
      userId,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(expiredSession));

    // Call validateSession through the store (mimics app-load behaviour)
    useAuthStore.getState().validateSession();

    // Both slices should be cleared
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().currentUser).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Logout clears session from store and LocalStorage
// ---------------------------------------------------------------------------

describe('Requirement 2.6 — logout', () => {
  it('removes session from LocalStorage and clears both store slices', async () => {
    const email = 'logout@example.com';
    const password = 'LogoutPass1!';
    await seedAccount(email, password);

    await useAuthStore.getState().login(email, password);

    // Pre-condition: logged in
    expect(useAuthStore.getState().session).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).not.toBeNull();

    useAuthStore.getState().logout();

    // Store slices cleared
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().currentUser).toBeNull();

    // Session key removed from LocalStorage
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });

  it('logout is a no-op when already logged out', () => {
    // Should not throw when called without an active session
    expect(() => useAuthStore.getState().logout()).not.toThrow();

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Login with a non-existent email fails with a generic error
// ---------------------------------------------------------------------------

describe('Requirement 2.3 — non-existent email', () => {
  it('returns a generic error without revealing that the email does not exist', async () => {
    let thrownError: unknown;
    try {
      await useAuthStore.getState().login('ghost@example.com', 'AnyPassword1!');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(Error);

    // Same generic message as a wrong-password attempt — no field leak
    const message = (thrownError as Error).message;
    expect(message).toMatch(/email or password is incorrect/i);
    expect(message).not.toMatch(/email does not exist/i);
    expect(message).not.toMatch(/no account/i);
    expect(message).not.toMatch(/not found/i);

    // Store remains logged out
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().currentUser).toBeNull();

    // Nothing written to LocalStorage
    expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bonus: validateSession() returns the valid session when not expired
// ---------------------------------------------------------------------------

describe('Requirement 2.5 — valid session survives validateSession()', () => {
  it('returns session and keeps store populated when session is still valid', async () => {
    const email = 'valid@example.com';
    const password = 'ValidPass1!';
    await seedAccount(email, password);

    await useAuthStore.getState().login(email, password);

    const sessionBefore = useAuthStore.getState().session;
    expect(sessionBefore).not.toBeNull();

    // Reset in-memory store but leave LocalStorage intact (simulates page reload)
    resetStore();
    expect(useAuthStore.getState().session).toBeNull();

    // Validate from storage — should restore both slices
    useAuthStore.getState().validateSession();

    const { session, currentUser } = useAuthStore.getState();
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(sessionBefore?.userId);
    expect(currentUser?.email).toBe(email);
  });
});
