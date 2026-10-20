// ─────────────────────────────────────────────────────────────────────────────
// DietSync — Shared TypeScript Types
// All types are exported. File is strict TypeScript with no `any`.
// ─────────────────────────────────────────────────────────────────────────────

// ── Union types ───────────────────────────────────────────────────────────────

export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

export type Goal = 'lose' | 'maintain' | 'gain';

export type MealSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

// ── Activity multipliers (used by NutritionCalculator) ────────────────────────

export const ActivityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
} as const;

// ── Food items ────────────────────────────────────────────────────────────────

export interface FoodItem {
  id: string;
  name: string;
  category: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source?: string;
}

export interface CustomFood extends FoodItem {
  isCustom: true;
}

// ── Food log ──────────────────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  foodId: string;
  foodName: string;
  servingGrams: number;
  mealSection: MealSection;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayLog {
  /** YYYY-MM-DD */
  date: string;
  entries: LogEntry[];
}

// ── User profile and account ──────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  /** YYYY-MM-DD */
  dob: string;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  createdAt: string;
}

export interface NutritionGoals {
  calorieTarget: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  isManual: boolean;
}

export interface UserSettings {
  /** Default 90 */
  logPruningDays: number;
  /** Default 250 */
  waterStepMl: number;
  /** Default 2000 */
  waterTargetMl: number;
}

export interface Session {
  userId: string;
  /** ISO timestamp string */
  expiresAt: string;
}

export interface WeightEntry {
  /** YYYY-MM-DD */
  date: string;
  weightKg: number;
}

// ── Authentication ─────────────────────────────────────────────────────────────

export interface AuthRecord {
  /** Hex string */
  hash: string;
  /** Hex string */
  salt: string;
  userId: string;
}

// ── Progress and stats ────────────────────────────────────────────────────────

export interface WeeklyStats {
  /** YYYY-MM-DD (Monday of the week) */
  weekOf: string;
  averageCalories: number;
  daysLogged: number;
  targetCalories: number;
}

export interface DailyAdherence {
  /** YYYY-MM-DD */
  date: string;
  /** Percentage (0–∞, unclamped) */
  adherencePct: number;
}

// ── Computed nutrition values ─────────────────────────────────────────────────

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ScaledNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationError {
  message: string;
  field: string;
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/** All UserProfile fields except userId and createdAt, plus a password. */
export interface OnboardingData {
  name: string;
  email: string;
  /** YYYY-MM-DD */
  dob: string;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  password: string;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

/** Prefix shared by every DietSync LocalStorage key. */
export const DIETSYNC_KEY_PREFIX = 'dietsync:' as const;

/**
 * Centralised LocalStorage key registry.
 *
 * Static keys (global, no userId):
 *   STORAGE_KEYS.USERS   → 'dietsync:users'
 *   STORAGE_KEYS.AUTH    → 'dietsync:auth'
 *   STORAGE_KEYS.SESSION → 'dietsync:session'
 *
 * Per-user key factories (call with a userId string):
 *   STORAGE_KEYS.LOGS(userId)         → `dietsync:${userId}:logs`
 *   STORAGE_KEYS.WEIGHT(userId)       → `dietsync:${userId}:weight`
 *   STORAGE_KEYS.WATER(userId)        → `dietsync:${userId}:water`
 *   STORAGE_KEYS.CUSTOM_FOODS(userId) → `dietsync:${userId}:customFoods`
 *   STORAGE_KEYS.GOALS(userId)        → `dietsync:${userId}:goals`
 *   STORAGE_KEYS.SETTINGS(userId)     → `dietsync:${userId}:settings`
 */
export const STORAGE_KEYS = {
  // ── Global keys ─────────────────────────────────────────────────────────────
  USERS: 'dietsync:users',
  AUTH: 'dietsync:auth',
  SESSION: 'dietsync:session',

  // ── Per-user key factories ───────────────────────────────────────────────────
  LOGS: (userId: string) => `dietsync:${userId}:logs` as const,
  WEIGHT: (userId: string) => `dietsync:${userId}:weight` as const,
  WATER: (userId: string) => `dietsync:${userId}:water` as const,
  CUSTOM_FOODS: (userId: string) => `dietsync:${userId}:customFoods` as const,
  GOALS: (userId: string) => `dietsync:${userId}:goals` as const,
  SETTINGS: (userId: string) => `dietsync:${userId}:settings` as const,
  RECENT_FOODS: (userId: string) => `dietsync:${userId}:recentFoods` as const,
} as const;
