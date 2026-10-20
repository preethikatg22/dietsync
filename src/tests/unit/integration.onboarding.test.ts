/**
 * Integration tests — full onboarding flow.
 *
 * Runs against the real authStore + AuthService + StorageRepository stack
 * (no mocking of business logic). jsdom provides localStorage.
 *
 * Key scenarios:
 *  - Full flow: createAccount stores an auth record with a PBKDF2-hashed
 *    password and a user profile with all fields intact.
 *  - Stored password hash differs from the plaintext input (hashing happened).
 *  - The session and currentUser slices in authStore are set immediately after
 *    account creation.
 *  - TDEE-based goal values can be derived from the stored profile (BMR/TDEE
 *    computation using persisted profile fields is deterministic).
 *
 * **Validates: Requirements 1.1–1.7**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/authStore.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';
import {
  STORAGE_KEYS,
  type OnboardingData,
  type NutritionGoals,
} from '../../types/index.ts';
import {
  computeBMR,
  computeTDEE,
  computeGoalTarget,
} from '../../services/NutritionCalculator.ts';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schemas (mirrors AuthService's private schemas)
// ---------------------------------------------------------------------------

const AuthRecordSchema = z.object({
  hash: z.string(),
  salt: z.string(),
  userId: z.string(),
});

const AuthStoreSchema = z.record(z.string(), AuthRecordSchema);

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

const NutritionGoalsSchema = z.object({
  calorieTarget: z.number(),
  proteinPct: z.number(),
  carbsPct: z.number(),
  fatPct: z.number(),
  isManual: z.boolean(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid onboarding profile factory. (Req 1.1) */
function makeProfile(
  overrides: Partial<OnboardingData> = {},
): OnboardingData {
  return {
    name: 'Integration User',
    email: 'onboarding@example.com',
    password: 'securePass1!',
    dob: '1990-06-15',
    sex: 'female',
    heightCm: 165,
    weightKg: 62,
    activityLevel: 'lightly_active',
    goal: 'maintain',
    ...overrides,
  };
}

/** Reset Zustand auth store to logged-out state. */
function resetStore(): void {
  useAuthStore.setState({ session: null, currentUser: null });
}

/** Read the raw auth store from localStorage. */
function readAuthStore(): Record<
  string,
  { hash: string; salt: string; userId: string }
> {
  return storageRepository.get(STORAGE_KEYS.AUTH, AuthStoreSchema, {});
}

/** Read the raw users record from localStorage. */
function readUsers(): Record<string, z.infer<typeof UserProfileSchema>> {
  return storageRepository.get(STORAGE_KEYS.USERS, UsersSchema, {});
}

/** Read persisted goals for a user (may be null if not yet set). */
function readGoals(userId: string): NutritionGoals | null {
  const raw = localStorage.getItem(STORAGE_KEYS.GOALS(userId));
  if (!raw) return null;
  const parsed = NutritionGoalsSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ---------------------------------------------------------------------------
// Full onboarding flow
// ---------------------------------------------------------------------------

describe('Full onboarding flow', () => {
  /**
   * **Validates: Requirements 1.1, 1.5, 2.1**
   *
   * After createAccount completes, the `dietsync:auth` key contains an entry
   * for the user's email with a non-empty hash and salt (PBKDF2 was invoked).
   * The `dietsync:users` key contains the persisted user profile.
   */
  it('persists auth record and user profile to storage on account creation', async () => {
    const profile = makeProfile({ email: 'persist@example.com' });

    await useAuthStore.getState().createAccount(profile);

    // Auth record should exist keyed by email
    const authStore = readAuthStore();
    expect(authStore[profile.email]).toBeDefined();
    const record = authStore[profile.email];
    expect(record.hash).toBeTruthy();
    expect(record.salt).toBeTruthy();
    expect(record.userId).toBeTruthy();

    // User profile should exist keyed by userId
    const users = readUsers();
    const userId = record.userId;
    expect(users[userId]).toBeDefined();
    const storedProfile = users[userId];
    expect(storedProfile.name).toBe(profile.name);
    expect(storedProfile.email).toBe(profile.email);
    expect(storedProfile.sex).toBe(profile.sex);
    expect(storedProfile.heightCm).toBe(profile.heightCm);
    expect(storedProfile.weightKg).toBe(profile.weightKg);
    expect(storedProfile.activityLevel).toBe(profile.activityLevel);
    expect(storedProfile.goal).toBe(profile.goal);
    expect(storedProfile.dob).toBe(profile.dob);
    expect(storedProfile.createdAt).toBeTruthy();
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * The stored hash must differ from the plaintext password — PBKDF2 hashing
   * was applied before persistence.
   */
  it('stores a hashed password that is different from the plaintext input', async () => {
    const profile = makeProfile({
      email: 'hashcheck@example.com',
      password: 'myPlaintextPassword1',
    });

    await useAuthStore.getState().createAccount(profile);

    const authStore = readAuthStore();
    const record = authStore[profile.email];
    expect(record).toBeDefined();

    // Hash must not contain the plaintext password
    expect(record.hash).not.toBe(profile.password);
    expect(record.hash).not.toContain(profile.password);

    // Hash and salt are 64-char hex strings (PBKDF2-SHA-256 / 16-byte salt)
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  /**
   * **Validates: Requirements 2.1, 2.4**
   *
   * After a successful createAccount call the authStore exposes a non-null
   * session and a currentUser that matches the registered profile.
   */
  it('sets session and currentUser in authStore immediately after account creation', async () => {
    const profile = makeProfile({ email: 'session@example.com' });

    await useAuthStore.getState().createAccount(profile);

    const { session, currentUser } = useAuthStore.getState();

    expect(session).not.toBeNull();
    expect(session!.userId).toBeTruthy();
    expect(new Date(session!.expiresAt) > new Date()).toBe(true);

    expect(currentUser).not.toBeNull();
    expect(currentUser!.email).toBe(profile.email);
    expect(currentUser!.name).toBe(profile.name);
    expect(currentUser!.userId).toBe(session!.userId);
  });

  /**
   * **Validates: Requirements 1.2, 2.1**
   *
   * The stored user profile contains all fields required to deterministically
   * compute BMR and TDEE. Calling NutritionCalculator with the stored profile
   * produces the same result as calling it with the original input — confirming
   * the profile data was persisted intact.
   */
  it('stores complete profile data that reproduces the TDEE calculation', async () => {
    const profile = makeProfile({
      email: 'tdee@example.com',
      sex: 'male',
      dob: '1985-03-20',
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderately_active',
      goal: 'lose',
    });

    // Pre-compute expected TDEE from the original profile data
    const expectedBMR = computeBMR({
      sex: profile.sex,
      dob: profile.dob,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
    });
    const expectedTDEE = computeTDEE(expectedBMR, profile.activityLevel);
    const expectedGoalTarget = computeGoalTarget(expectedTDEE, profile.goal);

    await useAuthStore.getState().createAccount(profile);

    // Read back the stored profile and recompute TDEE
    const users = readUsers();
    const userId = useAuthStore.getState().session!.userId;
    const storedProfile = users[userId];
    expect(storedProfile).toBeDefined();

    const storedBMR = computeBMR({
      sex: storedProfile.sex,
      dob: storedProfile.dob,
      heightCm: storedProfile.heightCm,
      weightKg: storedProfile.weightKg,
    });
    const storedTDEE = computeTDEE(storedBMR, storedProfile.activityLevel);
    const storedGoalTarget = computeGoalTarget(storedTDEE, storedProfile.goal);

    expect(storedBMR).toBeCloseTo(expectedBMR, 5);
    expect(storedTDEE).toBeCloseTo(expectedTDEE, 5);
    expect(storedGoalTarget).toBeCloseTo(expectedGoalTarget, 5);
  });

  /**
   * **Validates: Requirements 1.2**
   *
   * TDEE-based nutrition goals can be computed and stored from the persisted
   * profile. When goals are written (e.g. by the app after onboarding), they
   * reflect the correct calorie target derived from the user's TDEE and goal.
   */
  it('allows TDEE-based goals to be stored and retrieved for the created account', async () => {
    const profile = makeProfile({
      email: 'goals@example.com',
      sex: 'female',
      dob: '1992-09-10',
      heightCm: 162,
      weightKg: 58,
      activityLevel: 'sedentary',
      goal: 'lose',
    });

    await useAuthStore.getState().createAccount(profile);
    const userId = useAuthStore.getState().session!.userId;

    // Compute the TDEE-based calorie target from the stored profile
    const storedProfile = readUsers()[userId];
    const bmr = computeBMR({
      sex: storedProfile.sex,
      dob: storedProfile.dob,
      heightCm: storedProfile.heightCm,
      weightKg: storedProfile.weightKg,
    });
    const tdee = computeTDEE(bmr, storedProfile.activityLevel);
    const calorieTarget = computeGoalTarget(tdee, storedProfile.goal);

    // Persist TDEE-derived goals to the user's goals key
    const goals: NutritionGoals = {
      calorieTarget: Math.round(calorieTarget),
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
      isManual: false,
    };
    storageRepository.set(STORAGE_KEYS.GOALS(userId), goals);

    // Retrieve and verify
    const stored = readGoals(userId);
    expect(stored).not.toBeNull();
    expect(stored!.calorieTarget).toBe(Math.round(calorieTarget));
    expect(stored!.isManual).toBe(false);

    // TDEE for sedentary female losing weight should be TDEE − 500
    // BMR (female): 10×58 + 6.25×162 − 5×age − 161
    // TDEE = BMR × 1.2; goalTarget = TDEE − 500
    expect(stored!.calorieTarget).toBeLessThan(Math.round(tdee));
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * Two separate accounts on the same device remain fully isolated: each has
   * its own auth record and user profile, keyed by distinct userIds.
   */
  it('supports multiple independent accounts on the same device', async () => {
    const profile1 = makeProfile({ email: 'user1@example.com', name: 'Alice' });
    const profile2 = makeProfile({
      email: 'user2@example.com',
      name: 'Bob',
      sex: 'male',
    });

    await useAuthStore.getState().createAccount(profile1);
    const userId1 = useAuthStore.getState().session!.userId;

    resetStore();
    localStorage.removeItem(STORAGE_KEYS.SESSION);

    await useAuthStore.getState().createAccount(profile2);
    const userId2 = useAuthStore.getState().session!.userId;

    // Each user should have a distinct ID
    expect(userId1).not.toBe(userId2);

    // Both auth records should exist in storage
    const authStore = readAuthStore();
    expect(authStore[profile1.email]).toBeDefined();
    expect(authStore[profile2.email]).toBeDefined();

    // Each auth record should reference the correct userId
    expect(authStore[profile1.email].userId).toBe(userId1);
    expect(authStore[profile2.email].userId).toBe(userId2);

    // Both user profiles should exist and be distinct
    const users = readUsers();
    expect(users[userId1]).toBeDefined();
    expect(users[userId2]).toBeDefined();
    expect(users[userId1].name).toBe('Alice');
    expect(users[userId2].name).toBe('Bob');
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Two accounts with the same password produce different stored hashes
   * because each uses a unique random salt.
   */
  it('generates a unique salt per account so identical passwords hash differently', async () => {
    const sharedPassword = 'SamePassword99!';
    const profile1 = makeProfile({
      email: 'salt1@example.com',
      password: sharedPassword,
    });
    const profile2 = makeProfile({
      email: 'salt2@example.com',
      password: sharedPassword,
    });

    await useAuthStore.getState().createAccount(profile1);
    resetStore();
    localStorage.removeItem(STORAGE_KEYS.SESSION);

    await useAuthStore.getState().createAccount(profile2);

    const authStore = readAuthStore();
    const record1 = authStore[profile1.email];
    const record2 = authStore[profile2.email];

    expect(record1.salt).not.toBe(record2.salt);
    expect(record1.hash).not.toBe(record2.hash);
  });

  /**
   * **Validates: Requirements 1.1**
   *
   * All profile fields accepted by the onboarding wizard are present in the
   * stored UserProfile with the correct values.
   */
  it('stores all required profile fields collected during onboarding', async () => {
    const profile: OnboardingData = {
      name: 'Full Field User',
      email: 'fullfields@example.com',
      password: 'fullFieldPass1',
      dob: '1978-12-01',
      sex: 'male',
      heightCm: 178,
      weightKg: 85,
      activityLevel: 'very_active',
      goal: 'gain',
    };

    await useAuthStore.getState().createAccount(profile);

    const userId = useAuthStore.getState().session!.userId;
    const users = readUsers();
    const stored = users[userId];

    expect(stored.name).toBe(profile.name);
    expect(stored.email).toBe(profile.email);
    expect(stored.dob).toBe(profile.dob);
    expect(stored.sex).toBe(profile.sex);
    expect(stored.heightCm).toBe(profile.heightCm);
    expect(stored.weightKg).toBe(profile.weightKg);
    expect(stored.activityLevel).toBe(profile.activityLevel);
    expect(stored.goal).toBe(profile.goal);
    // Password must NOT be stored in the user profile
    expect(JSON.stringify(stored)).not.toContain(profile.password);
  });
});
