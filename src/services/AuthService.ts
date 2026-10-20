// ─────────────────────────────────────────────────────────────────────────────
// AuthService
// Requirements: 1.5, 2.1–2.9
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import {
  STORAGE_KEYS,
  type AuthRecord,
  type OnboardingData,
  type Session,
  type UserProfile,
} from '../types/index.ts';
import { storageRepository } from '../repositories/StorageRepository.ts';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

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

const AuthRecordSchema = z.object({
  hash: z.string(),
  salt: z.string(),
  userId: z.string(),
});

const AuthStoreSchema = z.record(z.string(), AuthRecordSchema);

const SessionSchema = z.object({
  userId: z.string(),
  expiresAt: z.string(),
});

// ---------------------------------------------------------------------------
// PBKDF2 helpers (Web Crypto API)
// ---------------------------------------------------------------------------

/**
 * Encode a hex string as a Uint8Array backed by a plain ArrayBuffer.
 * The explicit `ArrayBuffer` allocation avoids the `SharedArrayBuffer`
 * union issue that arises when TypeScript infers `ArrayBufferLike`.
 */
function hexToBytes(hex: string): Uint8Array {
  const buffer = new ArrayBuffer(hex.length / 2);
  const result = new Uint8Array(buffer);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

/**
 * Encode a Uint8Array as a lowercase hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a 16-byte random salt and return it as a 32-character hex string.
 * (Req 1.5)
 */
function generateSaltHex(): string {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  return bytesToHex(saltBytes);
}

/**
 * Derive a PBKDF2-SHA-256 hash from `password` and `saltHex`.
 * Returns the 256-bit (32-byte) output as a 64-character hex string.
 * (Req 1.5, 2.2)
 */
async function pbkdf2Hash(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      // Pass the plain ArrayBuffer to satisfy the strict BufferSource type
      salt: hexToBytes(saltHex).buffer as ArrayBuffer,
      iterations: 100_000,
    },
    keyMaterial,
    256, // 256 bits → 32 bytes
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

/**
 * Manages account creation, login, logout, session validation, and account
 * deletion. All credential data is stored in LocalStorage using
 * `StorageRepository`. Password hashing is done with PBKDF2 via the Web
 * Crypto API.
 *
 * (Req 2.1–2.9)
 */
export class AuthService {
  // ── Account creation ───────────────────────────────────────────────────────

  /**
   * Creates a new user account.
   *
   * Steps:
   *  1. Generate a UUID v4 userId.
   *  2. Hash the password with PBKDF2 using a fresh 16-byte random salt.
   *  3. Persist the `AuthRecord` to `dietsync:auth` keyed by email.
   *  4. Build and persist the `UserProfile` to `dietsync:users` keyed by userId.
   *
   * Returns `{ userId }` on success. Rejects on PBKDF2 failure. (Req 1.5)
   */
  async createAccount(profile: OnboardingData): Promise<{ userId: string }> {
    const userId = crypto.randomUUID();
    const saltHex = generateSaltHex();
    const hashHex = await pbkdf2Hash(profile.password, saltHex);

    // Persist auth record (Req 2.2)
    const authStore = storageRepository.get(
      STORAGE_KEYS.AUTH,
      AuthStoreSchema,
      {},
    );
    const authRecord: AuthRecord = {
      hash: hashHex,
      salt: saltHex,
      userId,
    };
    storageRepository.set(STORAGE_KEYS.AUTH, {
      ...authStore,
      [profile.email]: authRecord,
    });

    // Persist user profile (Req 2.1)
    const users = storageRepository.get(STORAGE_KEYS.USERS, UsersSchema, {});
    const userProfile: UserProfile = {
      userId,
      name: profile.name,
      email: profile.email,
      dob: profile.dob,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      createdAt: new Date().toISOString(),
    };
    storageRepository.set(STORAGE_KEYS.USERS, {
      ...users,
      [userId]: userProfile,
    });

    return { userId };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  /**
   * Attempts to log in with `email` and `password`.
   *
   * - Looks up the `AuthRecord` by email.
   * - Hashes `password` with the stored salt and compares.
   * - On success: creates a `Session` with a 30-day expiry and persists it.
   * - On failure: rejects with a generic message (no hint as to which field
   *   was wrong). (Req 2.2, 2.3, 2.4)
   */
  async login(email: string, password: string): Promise<Session> {
    const authStore = storageRepository.get(
      STORAGE_KEYS.AUTH,
      AuthStoreSchema,
      {},
    );

    const record = authStore[email];
    if (!record) {
      throw new Error('Email or password is incorrect.');
    }

    const hashHex = await pbkdf2Hash(password, record.salt);
    if (hashHex !== record.hash) {
      throw new Error('Email or password is incorrect.');
    }

    // Build a 30-day session (Req 2.4)
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const session: Session = { userId: record.userId, expiresAt };
    storageRepository.set(STORAGE_KEYS.SESSION, session);

    return session;
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  /**
   * Removes the active session from LocalStorage. (Req 2.6)
   */
  logout(): void {
    storageRepository.remove(STORAGE_KEYS.SESSION);
  }

  // ── Session validation ─────────────────────────────────────────────────────

  /**
   * Returns the active `Session` if one exists and has not expired.
   *
   * - If no session is found, returns `null`.
   * - If a session is found but its `expiresAt` is in the past, removes it
   *   and returns `null`. (Req 2.5)
   */
  validateSession(): Session | null {
    const session = storageRepository.get<Session | null>(
      STORAGE_KEYS.SESSION,
      SessionSchema as z.ZodType<Session | null>,
      null,
    );

    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
      storageRepository.remove(STORAGE_KEYS.SESSION);
      return null;
    }

    return session;
  }

  // ── Account deletion ───────────────────────────────────────────────────────

  /**
   * Deletes the account for `userId`.
   *
   * - Removes all `dietsync:[userId]:*` keys from LocalStorage.
   * - Removes the `dietsync:auth` entry for this user's email.
   * - Does NOT touch any key belonging to a different user. (Req 2.9)
   */
  deleteAccount(userId: string): void {
    // Remove all per-user keys (Req 2.9)
    const userPrefix = `dietsync:${userId}:`;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(userPrefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      storageRepository.remove(key);
    }

    // Remove auth entry keyed by this user's email (Req 2.9, 31.3)
    const authStore = storageRepository.get(
      STORAGE_KEYS.AUTH,
      AuthStoreSchema,
      {},
    );

    const emailToRemove = Object.entries(authStore).find(
      ([, record]) => record.userId === userId,
    )?.[0];

    if (emailToRemove !== undefined) {
      const { [emailToRemove]: _removed, ...remaining } = authStore;
      storageRepository.set(STORAGE_KEYS.AUTH, remaining);
    }

    // Remove user profile entry
    const users = storageRepository.get(STORAGE_KEYS.USERS, UsersSchema, {});
    const { [userId]: _removedUser, ...remainingUsers } = users;
    storageRepository.set(STORAGE_KEYS.USERS, remainingUsers);
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const authService = new AuthService();
