// ─────────────────────────────────────────────────────────────────────────────
// DietSync — authStore (Zustand)
// Requirements: 2.1–2.9
// ─────────────────────────────────────────────────────────────────────────────
//
// Thin store that wires components to AuthService. It owns two slices —
// `currentUser` and `session` — and updates them in response to auth actions.
// The store never implements business logic itself; it delegates to
// AuthService (credentials, sessions) and reads the persisted profile from
// `dietsync:users` to populate `currentUser`. (Req 2.1–2.9)

import { create } from 'zustand';
import { z } from 'zod';
import {
  STORAGE_KEYS,
  type OnboardingData,
  type Session,
  type UserProfile,
} from '../types/index.ts';
import { authService } from '../services/AuthService.ts';
import { storageRepository } from '../repositories/StorageRepository.ts';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
// Mirrors the `UserProfile` shape persisted by `AuthService.createAccount`.
// Defined locally (as in AuthService / FoodLogService) so the store can read a
// validated profile from `dietsync:users` without coupling to the service's
// private schema.

const UserProfileSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  dob: z.string(),
  sex: z.enum(['male', 'female']),
  heightCm: z.number(),
  weightKg: z.number(),
  activityLevel: z.enum([
    'sedentary',
    'lightly_active',
    'moderately_active',
    'very_active',
    'extra_active',
  ]),
  goal: z.enum(['lose', 'maintain', 'gain']),
  createdAt: z.string(),
});

const UsersSchema = z.record(z.string(), UserProfileSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a single {@link UserProfile} for `userId` from `dietsync:users`.
 *
 * Returns `null` when no profile exists for the user (or storage is invalid),
 * which keeps the "no current user" state representable. The store reads the
 * persisted profile here to populate the `currentUser` slice — AuthService
 * only returns a `Session`/`{ userId }` from its auth methods.
 */
function loadUserProfile(userId: string): UserProfile | null {
  const users = storageRepository.get(STORAGE_KEYS.USERS, UsersSchema, {});
  return users[userId] ?? null;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AuthState {
  // ── Slices ──────────────────────────────────────────────────────────────────
  /** The authenticated user's profile, or `null` when logged out. */
  currentUser: UserProfile | null;
  /** The active session, or `null` when logged out. (Req 2.4) */
  session: Session | null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Verifies credentials via AuthService and establishes a 30-day session.
   * Sets `session` and `currentUser` on success; rethrows on failure so the
   * caller can surface the generic error. (Req 2.2, 2.3, 2.4)
   */
  login: (email: string, password: string) => Promise<void>;

  /**
   * Ends the active session and clears both slices. (Req 2.6)
   */
  logout: () => void;

  /**
   * Creates a new account and immediately logs the user in, establishing a
   * 30-day session. Sets `session` and `currentUser`. (Req 1.5, 2.1, 2.4)
   */
  createAccount: (profile: OnboardingData) => Promise<void>;

  /**
   * Deletes the account for `userId` — removing all of its `dietsync:*` keys
   * — and clears both slices. (Req 2.9)
   */
  deleteAccount: (userId: string) => void;

  /**
   * Validates the persisted session. If it exists and has not expired,
   * refreshes `session` and `currentUser`; otherwise clears both. Intended
   * to run on app load. (Req 2.5)
   */
  validateSession: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  session: null,

  login: async (email, password) => {
    // AuthService.login creates + persists the 30-day session (Req 2.4) and
    // throws a generic error on bad credentials (Req 2.3). The set() below is
    // only reached on success, so a failed login leaves state untouched.
    const session = await authService.login(email, password);
    const currentUser = loadUserProfile(session.userId);
    set({ session, currentUser });
  },

  logout: () => {
    authService.logout();
    set({ session: null, currentUser: null });
  },

  createAccount: async (profile) => {
    const { userId } = await authService.createAccount(profile);
    // Establish a session immediately after creation by reusing the
    // validated login path, which persists a 30-day session (Req 2.4).
    const session = await authService.login(profile.email, profile.password);
    const currentUser = loadUserProfile(userId);
    set({ session, currentUser });
  },

  deleteAccount: (userId) => {
    authService.deleteAccount(userId);
    set({ session: null, currentUser: null });
  },

  validateSession: () => {
    const session = authService.validateSession();
    if (session) {
      set({ session, currentUser: loadUserProfile(session.userId) });
    } else {
      // Expired or absent session — clear auth state (Req 2.5).
      set({ session: null, currentUser: null });
    }
  },
}));
