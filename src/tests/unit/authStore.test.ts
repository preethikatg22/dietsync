/**
 * Unit tests for the authStore (Zustand).
 *
 * Verifies that each action calls AuthService and updates the `currentUser`
 * and `session` slices accordingly. Runs against the real AuthService +
 * StorageRepository stack (no mocking), consistent with the design's
 * integration testing guidance. localStorage is cleared between tests.
 *
 * **Validates: Requirements 2.1–2.9**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/authStore.ts';
import { STORAGE_KEYS, type OnboardingData } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid onboarding profile used to create test accounts. */
function makeProfile(
  email: string,
  password = 'password123',
): OnboardingData {
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

/** Reset the store slices to a logged-out state. */
function resetStore(): void {
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
// Tests
// ---------------------------------------------------------------------------

describe('authStore', () => {
  describe('login', () => {
    /**
     * **Validates: Requirements 2.2, 2.4**
     *
     * After a successful login, the store holds a session and the matching
     * user profile.
     */
    it('sets session and currentUser on successful login', async () => {
      const profile = makeProfile('alice@example.com');
      await useAuthStore.getState().createAccount(profile);
      resetStore();

      await useAuthStore.getState().login('alice@example.com', 'password123');

      const { session, currentUser } = useAuthStore.getState();
      expect(session).not.toBeNull();
      expect(session?.userId).toBeTruthy();
      expect(currentUser).not.toBeNull();
      expect(currentUser?.email).toBe('alice@example.com');
      expect(currentUser?.userId).toBe(session?.userId);
    });

    /**
     * **Validates: Requirements 2.3**
     *
     * A wrong password is rejected and leaves the store untouched.
     */
    it('rejects wrong password and leaves state unchanged', async () => {
      const profile = makeProfile('bob@example.com');
      await useAuthStore.getState().createAccount(profile);
      resetStore();

      await expect(
        useAuthStore.getState().login('bob@example.com', 'wrong-password'),
      ).rejects.toThrow();

      const { session, currentUser } = useAuthStore.getState();
      expect(session).toBeNull();
      expect(currentUser).toBeNull();
    });
  });

  describe('logout', () => {
    /**
     * **Validates: Requirements 2.6**
     *
     * Logout removes the session and clears both slices.
     */
    it('clears session and currentUser', async () => {
      await useAuthStore
        .getState()
        .createAccount(makeProfile('carol@example.com'));
      expect(useAuthStore.getState().session).not.toBeNull();

      useAuthStore.getState().logout();

      const { session, currentUser } = useAuthStore.getState();
      expect(session).toBeNull();
      expect(currentUser).toBeNull();
      // The persisted session is also gone.
      expect(localStorage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
    });
  });

  describe('createAccount', () => {
    /**
     * **Validates: Requirements 1.5, 2.1, 2.4**
     *
     * Creating an account immediately establishes a session and loads the
     * newly persisted profile into the store.
     */
    it('sets session and currentUser after account creation', async () => {
      await useAuthStore
        .getState()
        .createAccount(makeProfile('dave@example.com'));

      const { session, currentUser } = useAuthStore.getState();
      expect(session).not.toBeNull();
      expect(currentUser).not.toBeNull();
      expect(currentUser?.email).toBe('dave@example.com');
      expect(currentUser?.userId).toBe(session?.userId);
      // A 30-day session is persisted to storage (Req 2.4).
      expect(localStorage.getItem(STORAGE_KEYS.SESSION)).not.toBeNull();
    });
  });

  describe('deleteAccount', () => {
    /**
     * **Validates: Requirements 2.9**
     *
     * Deleting the current account clears the auth state.
     */
    it('clears session and currentUser', async () => {
      await useAuthStore
        .getState()
        .createAccount(makeProfile('erin@example.com'));
      const userId = useAuthStore.getState().currentUser!.userId;

      useAuthStore.getState().deleteAccount(userId);

      const { session, currentUser } = useAuthStore.getState();
      expect(session).toBeNull();
      expect(currentUser).toBeNull();
    });
  });

  describe('validateSession', () => {
    /**
     * **Validates: Requirements 2.5**
     *
     * With a valid, unexpired persisted session, validateSession restores
     * both the session and the current user.
     */
    it('restores session and currentUser when a valid session exists', async () => {
      await useAuthStore
        .getState()
        .createAccount(makeProfile('frank@example.com'));
      const expectedUserId = useAuthStore.getState().currentUser!.userId;
      resetStore();

      useAuthStore.getState().validateSession();

      const { session, currentUser } = useAuthStore.getState();
      expect(session).not.toBeNull();
      expect(session?.userId).toBe(expectedUserId);
      expect(currentUser).not.toBeNull();
      expect(currentUser?.userId).toBe(expectedUserId);
    });

    /**
     * **Validates: Requirements 2.5**
     *
     * With no persisted session, validateSession leaves the store logged out.
     */
    it('clears state when no session exists', () => {
      useAuthStore.getState().validateSession();

      const { session, currentUser } = useAuthStore.getState();
      expect(session).toBeNull();
      expect(currentUser).toBeNull();
    });
  });
});
