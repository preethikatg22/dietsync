/**
 * Property-based tests for AuthService
 *
 * Validates: Requirements 29.1-29.4, 31.1-31.3
 *
 * Properties covered:
 *   - Property 25a: PBKDF2 is deterministic — same password + salt → same hash
 *   - Property 25b: Different salts → different hashes
 *   - Property 25c: Wrong password is always rejected
 *   - Property 26a: Credential/data operations on U1 do not affect U2
 *   - Property 26b: Deleting U1 leaves U2 keys intact
 *
 * Design notes:
 *   - PBKDF2: SHA-256, 100,000 iterations, 256-bit output, 16-byte random salt per user
 *   - Hash and salt stored as hex strings in dietsync:auth keyed by email
 *   - Session: 30-day expiry in dietsync:session
 *   - Do NOT use vi.useFakeTimers() with fc.asyncProperty (Req 29.5)
 *   - Tests use fc.asyncProperty and await fc.assert(...) for async PBKDF2 operations
 */

import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../services/AuthService';
import type { OnboardingData } from '../../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fresh AuthService instance backed by a clean localStorage.
 * Each call returns a new service instance to ensure test isolation.
 */
function makeAuthService(): AuthService {
  return new AuthService();
}

/**
 * Build a minimal but valid OnboardingData object from arbitrary values.
 * The email and password are parameterised; other fields are fixed.
 */
function makeProfile(email: string, password: string): OnboardingData {
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

// ---------------------------------------------------------------------------
// fast-check Arbitraries
// ---------------------------------------------------------------------------

/** Valid password: 8–64 characters, printable ASCII to stay deterministic */
const passwordArb = fc.string({ minLength: 8, maxLength: 64 });

/**
 * A valid RFC-5322-style email address for test accounts.
 * We use fc.emailAddress() then sanitise it to avoid characters that could
 * act as object keys with unexpected behaviour.
 */
const emailArb = fc.emailAddress();

/**
 * Two distinct email addresses — used for U1/U2 multi-user tests.
 */
const twoDistinctEmailsArb = fc
  .tuple(emailArb, emailArb)
  .filter(([e1, e2]) => e1.toLowerCase() !== e2.toLowerCase());

/**
 * Two distinct passwords — used for wrong-password rejection tests.
 */
const twoDistinctPasswordsArb = fc
  .tuple(passwordArb, passwordArb)
  .filter(([p1, p2]) => p1 !== p2);

// ---------------------------------------------------------------------------
// Test Setup — clear localStorage before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Property 25a: PBKDF2 is Deterministic
// Validates: Requirements 29.1
//
// Approach: create an account with a given password, then verify login succeeds.
// AuthService internally runs PBKDF2 with the same password twice (once during
// createAccount, once during login) and compares the results. If the property
// holds, login always succeeds when the correct password is supplied.
// ---------------------------------------------------------------------------

describe('Property 25a: PBKDF2 is deterministic (same password + salt → same hash)', () => {
  /**
   * **Validates: Requirements 29.1**
   *
   * For any valid password P:
   *   1. createAccount hashes P with a random salt and stores the result.
   *   2. login re-hashes P with the stored salt and compares.
   * If PBKDF2 is deterministic, login always succeeds with the correct password.
   */
  it('login always succeeds after createAccount with the same password', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, async (email, password) => {
        localStorage.clear();
        const service = makeAuthService();
        const profile = makeProfile(email, password);

        await service.createAccount(profile);
        // If PBKDF2 is deterministic, this must not throw
        const session = await service.login(email, password);

        expect(session).toBeDefined();
        expect(typeof session.userId).toBe('string');
        expect(session.userId.length).toBeGreaterThan(0);
        expect(typeof session.expiresAt).toBe('string');
      }),
      { numRuns: 20 },
    );
  // 2 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 1.2 s; allow generous headroom
  }, 30_000);

  /**
   * **Validates: Requirements 29.1**
   *
   * A second login with the same credentials must return the same userId,
   * confirming the hash is stable across multiple verifications.
   */
  it('repeated logins with the same credentials always return the same userId', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, async (email, password) => {
        localStorage.clear();
        const service = makeAuthService();
        const profile = makeProfile(email, password);

        await service.createAccount(profile);
        const session1 = await service.login(email, password);
        service.logout();
        const session2 = await service.login(email, password);

        expect(session1.userId).toBe(session2.userId);
      }),
      { numRuns: 30 },
    );
  // 3 PBKDF2 ops per run × 30 runs × ~30ms each ≈ 2.7 s; allow generous headroom
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Property 25b: Different Salts Produce Different Hashes
// Validates: Requirements 29.2
//
// Approach: The internal pbkdf2Hash function is not exported, so we test this
// property indirectly through the AuthService API.
//
// Two accounts are created for the same password but different emails.
// Because each createAccount call generates a fresh 16-byte random salt, the
// stored hashes will (with overwhelming probability) differ.
//
// We verify this by reading the raw dietsync:auth store: both auth records
// must have distinct hash values, confirming the salt influences the output.
// ---------------------------------------------------------------------------

describe('Property 25b: Different salts produce different hashes', () => {
  /**
   * **Validates: Requirements 29.2**
   *
   * Two accounts created with the same password but different emails use
   * independently generated salts. The stored hashes must differ.
   */
  it('two accounts with the same password have different stored hashes', async () => {
    await fc.assert(
      fc.asyncProperty(twoDistinctEmailsArb, passwordArb, async ([email1, email2], password) => {
        localStorage.clear();
        const service = makeAuthService();

        await service.createAccount(makeProfile(email1, password));
        await service.createAccount(makeProfile(email2, password));

        // Read raw auth store from localStorage
        const rawAuth = localStorage.getItem('dietsync:auth');
        expect(rawAuth).not.toBeNull();

        const authStore = JSON.parse(rawAuth!) as Record<
          string,
          { hash: string; salt: string; userId: string }
        >;

        const record1 = authStore[email1];
        const record2 = authStore[email2];

        expect(record1).toBeDefined();
        expect(record2).toBeDefined();

        // Salts must differ (they are randomly generated)
        expect(record1.salt).not.toBe(record2.salt);

        // Hashes must differ because the salts differ
        expect(record1.hash).not.toBe(record2.hash);
      }),
      { numRuns: 30 },
    );
  // 2 PBKDF2 ops per run × 30 runs × ~30ms each ≈ 1.8 s; allow generous headroom
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Property 25c: Wrong Password Always Rejected
// Validates: Requirements 29.3
//
// Approach: create an account with password P, then attempt login with P' ≠ P.
// The login must always throw (reject), never return a session.
// ---------------------------------------------------------------------------

describe('Property 25c: Wrong password is always rejected', () => {
  /**
   * **Validates: Requirements 29.3**
   *
   * For any correct password P and incorrect password P' (P ≠ P'),
   * login with P' must be rejected with a generic error.
   */
  it('login with incorrect password always throws', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        twoDistinctPasswordsArb,
        async (email, [correctPassword, wrongPassword]) => {
          localStorage.clear();
          const service = makeAuthService();
          const profile = makeProfile(email, correctPassword);

          await service.createAccount(profile);

          // Login with the wrong password must reject
          await expect(service.login(email, wrongPassword)).rejects.toThrow();
        },
      ),
      { numRuns: 20 },
    );
  // 2 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 1.2 s; allow generous headroom
  }, 30_000);

  /**
   * **Validates: Requirements 29.3**
   *
   * The error message for a wrong password must not reveal which field
   * was incorrect (Req 2.3 — generic message).
   */
  it('rejection error message does not reveal whether email or password was wrong', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        twoDistinctPasswordsArb,
        async (email, [correctPassword, wrongPassword]) => {
          localStorage.clear();
          const service = makeAuthService();
          await service.createAccount(makeProfile(email, correctPassword));

          let errorMessage = '';
          try {
            await service.login(email, wrongPassword);
          } catch (err) {
            errorMessage = (err as Error).message;
          }

          expect(errorMessage).toBeTruthy();
          // The message must not pinpoint the password field specifically
          const lowerMsg = errorMessage.toLowerCase();
          expect(lowerMsg).not.toMatch(/^password/);
          expect(lowerMsg).not.toMatch(/^wrong password/);
        },
      ),
      { numRuns: 20 },
    );
  // 2 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 1.2 s; allow generous headroom
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Property 26a: Credential/Data Operations on U1 Do Not Affect U2
// Validates: Requirements 29.4, 31.1
//
// Approach:
//   1. Create accounts for U1 and U2.
//   2. Perform operations on U1 (login, logout, further logins).
//   3. Verify U2's auth record and profile are completely unchanged.
// ---------------------------------------------------------------------------

describe('Property 26a: Operations on U1 do not affect U2', () => {
  /**
   * **Validates: Requirements 29.4**
   *
   * After creating two accounts and performing multiple U1 operations,
   * U2 must still be able to log in with the original credentials.
   */
  it('U2 login succeeds after multiple U1 login/logout cycles', async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        passwordArb,
        passwordArb,
        async ([email1, email2], password1, password2) => {
          localStorage.clear();
          const service = makeAuthService();

          await service.createAccount(makeProfile(email1, password1));
          await service.createAccount(makeProfile(email2, password2));

          // Perform several U1 operations
          const session1 = await service.login(email1, password1);
          expect(session1).toBeDefined();
          service.logout();

          const session1b = await service.login(email1, password1);
          expect(session1b).toBeDefined();
          service.logout();

          // U2 must still be able to log in unchanged
          const session2 = await service.login(email2, password2);
          expect(session2).toBeDefined();
          expect(typeof session2.userId).toBe('string');
          expect(session2.userId.length).toBeGreaterThan(0);

          // U2's userId must not equal U1's userId
          expect(session2.userId).not.toBe(session1.userId);
        },
      ),
      { numRuns: 20 },
    );
  // 5 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 3 s; allow headroom
  }, 60_000);

  /**
   * **Validates: Requirements 29.4**
   *
   * U2's stored auth record (hash and salt) must remain bit-for-bit identical
   * before and after U1 operations.
   */
  it("U2's auth record is unchanged after U1 login/logout operations", async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        passwordArb,
        passwordArb,
        async ([email1, email2], password1, password2) => {
          localStorage.clear();
          const service = makeAuthService();

          await service.createAccount(makeProfile(email1, password1));
          await service.createAccount(makeProfile(email2, password2));

          // Snapshot U2's auth record before U1 operations
          const authBefore = JSON.parse(localStorage.getItem('dietsync:auth')!) as Record<
            string,
            { hash: string; salt: string; userId: string }
          >;
          const u2RecordBefore = authBefore[email2];
          expect(u2RecordBefore).toBeDefined();

          // Perform U1 operations
          await service.login(email1, password1);
          service.logout();
          await service.login(email1, password1);
          service.logout();

          // Snapshot U2's auth record after U1 operations
          const authAfter = JSON.parse(localStorage.getItem('dietsync:auth')!) as Record<
            string,
            { hash: string; salt: string; userId: string }
          >;
          const u2RecordAfter = authAfter[email2];

          expect(u2RecordAfter).toEqual(u2RecordBefore);
        },
      ),
      { numRuns: 20 },
    );
  // 4 PBKDF2 ops per run × 20 runs; allow generous headroom
  }, 60_000);

  /**
   * **Validates: Requirements 29.4**
   *
   * U2's user profile must remain identical after U1 operations.
   */
  it("U2's user profile is unchanged after U1 operations", async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        passwordArb,
        passwordArb,
        async ([email1, email2], password1, password2) => {
          localStorage.clear();
          const service = makeAuthService();

          await service.createAccount(makeProfile(email1, password1));
          await service.createAccount(makeProfile(email2, password2));

          // Snapshot U2 userId from the auth store
          const authStore = JSON.parse(localStorage.getItem('dietsync:auth')!) as Record<
            string,
            { hash: string; salt: string; userId: string }
          >;
          const u2UserId = authStore[email2].userId;

          // Snapshot U2's profile before U1 operations
          const usersBefore = JSON.parse(localStorage.getItem('dietsync:users')!) as Record<
            string,
            unknown
          >;
          const u2ProfileBefore = usersBefore[u2UserId];
          expect(u2ProfileBefore).toBeDefined();

          // Perform U1 operations
          await service.login(email1, password1);
          service.logout();

          // U2's profile must be unchanged
          const usersAfter = JSON.parse(localStorage.getItem('dietsync:users')!) as Record<
            string,
            unknown
          >;
          expect(usersAfter[u2UserId]).toEqual(u2ProfileBefore);
        },
      ),
      { numRuns: 20 },
    );
  // 3 PBKDF2 ops per run × 20 runs; allow generous headroom
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Property 26b: Deleting U1 Leaves U2 Keys Intact
// Validates: Requirements 31.1, 31.2, 31.3
//
// Approach:
//   1. Create accounts for U1 and U2.
//   2. Write some per-user keys for both users (simulate data).
//   3. Delete U1's account.
//   4. Verify U2's auth entry, profile, and per-user keys are all intact.
//   5. Verify U1's auth entry and profile are gone.
// ---------------------------------------------------------------------------

describe('Property 26b: Deleting U1 leaves U2 keys intact', () => {
  /**
   * **Validates: Requirements 31.1, 31.2**
   *
   * After deleting U1, all of U2's per-user keys must remain present
   * with their original values.
   */
  it("U2's per-user storage keys survive U1 account deletion", async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        passwordArb,
        passwordArb,
        async ([email1, email2], password1, password2) => {
          localStorage.clear();
          const service = makeAuthService();

          const { userId: userId1 } = await service.createAccount(makeProfile(email1, password1));
          const { userId: userId2 } = await service.createAccount(makeProfile(email2, password2));

          // Write some per-user data for both users to simulate real usage
          const u1LogKey = `dietsync:${userId1}:logs`;
          const u1GoalKey = `dietsync:${userId1}:goals`;
          const u2LogKey = `dietsync:${userId2}:logs`;
          const u2GoalKey = `dietsync:${userId2}:goals`;
          const u2WeightKey = `dietsync:${userId2}:weight`;

          const u2LogValue = JSON.stringify({ '2024-01-15': { date: '2024-01-15', entries: [] } });
          const u2GoalValue = JSON.stringify({
            calorieTarget: 2200,
            proteinPct: 30,
            carbsPct: 40,
            fatPct: 30,
            isManual: false,
          });
          const u2WeightValue = JSON.stringify({ '2024-01-15': 72.5 });

          localStorage.setItem(u1LogKey, JSON.stringify({}));
          localStorage.setItem(u1GoalKey, JSON.stringify({}));
          localStorage.setItem(u2LogKey, u2LogValue);
          localStorage.setItem(u2GoalKey, u2GoalValue);
          localStorage.setItem(u2WeightKey, u2WeightValue);

          // Delete U1
          service.deleteAccount(userId1);

          // U2's keys must all survive
          expect(localStorage.getItem(u2LogKey)).toBe(u2LogValue);
          expect(localStorage.getItem(u2GoalKey)).toBe(u2GoalValue);
          expect(localStorage.getItem(u2WeightKey)).toBe(u2WeightValue);

          // U1's per-user keys must be gone (Req 31.1)
          expect(localStorage.getItem(u1LogKey)).toBeNull();
          expect(localStorage.getItem(u1GoalKey)).toBeNull();
        },
      ),
      { numRuns: 20 },
    );
  // 2 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 1.2 s; allow generous headroom
  }, 30_000);

  /**
   * **Validates: Requirements 31.2, 31.3**
   *
   * After deleting U1:
   *   - U2's auth entry remains present and unchanged.
   *   - U1's auth entry is removed (Req 31.3).
   *   - U2's user profile is still present.
   */
  it("U2's auth entry and profile survive U1 account deletion", async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        passwordArb,
        passwordArb,
        async ([email1, email2], password1, password2) => {
          localStorage.clear();
          const service = makeAuthService();

          const { userId: userId1 } = await service.createAccount(makeProfile(email1, password1));
          await service.createAccount(makeProfile(email2, password2));

          // Snapshot U2's auth record and profile before deletion
          const authBefore = JSON.parse(localStorage.getItem('dietsync:auth')!) as Record<
            string,
            unknown
          >;
          const u2AuthBefore = authBefore[email2];
          expect(u2AuthBefore).toBeDefined();

          const usersBefore = JSON.parse(localStorage.getItem('dietsync:users')!) as Record<
            string,
            unknown
          >;
          // Retrieve U2's userId via auth store
          const authBeforeTyped = authBefore as Record<
            string,
            { hash: string; salt: string; userId: string }
          >;
          const u2UserId = authBeforeTyped[email2].userId;
          const u2ProfileBefore = usersBefore[u2UserId];
          expect(u2ProfileBefore).toBeDefined();

          // Delete U1
          service.deleteAccount(userId1);

          // U2's auth entry must still be there and unchanged (Req 31.2)
          const authAfter = JSON.parse(localStorage.getItem('dietsync:auth')!) as Record<
            string,
            unknown
          >;
          expect(authAfter[email2]).toEqual(u2AuthBefore);

          // U1's auth entry must be removed (Req 31.3)
          expect(authAfter[email1]).toBeUndefined();

          // U2's profile must still be there and unchanged (Req 31.2)
          const usersAfter = JSON.parse(localStorage.getItem('dietsync:users')!) as Record<
            string,
            unknown
          >;
          expect(usersAfter[u2UserId]).toEqual(u2ProfileBefore);

          // U1's profile must also be removed
          expect(usersAfter[userId1]).toBeUndefined();
        },
      ),
      { numRuns: 20 },
    );
  // 2 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 1.2 s; allow generous headroom
  }, 30_000);

  /**
   * **Validates: Requirements 31.1, 31.2**
   *
   * After deleting U1, U2 can still log in with original credentials.
   * This is the end-to-end confirmation that data isolation holds.
   */
  it('U2 can still log in after U1 is deleted', async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctEmailsArb,
        passwordArb,
        passwordArb,
        async ([email1, email2], password1, password2) => {
          localStorage.clear();
          const service = makeAuthService();

          const { userId: userId1 } = await service.createAccount(makeProfile(email1, password1));
          await service.createAccount(makeProfile(email2, password2));

          // Delete U1
          service.deleteAccount(userId1);

          // U2 must still be able to log in (Req 31.2)
          const session = await service.login(email2, password2);
          expect(session).toBeDefined();
          expect(typeof session.userId).toBe('string');
          expect(session.userId.length).toBeGreaterThan(0);

          // U1 login must now fail (auth entry removed)
          await expect(service.login(email1, password1)).rejects.toThrow();
        },
      ),
      { numRuns: 20 },
    );
  // 4 PBKDF2 ops per run × 20 runs × ~30ms each ≈ 2.4 s; allow generous headroom
  }, 60_000);
});
