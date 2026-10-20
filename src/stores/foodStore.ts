// ─────────────────────────────────────────────────────────────────────────────
// DietSync — foodStore (Zustand)
// Requirements: 3.3–3.7, 4.1–4.7
// ─────────────────────────────────────────────────────────────────────────────
//
// Thin store that wires components to LocalFoodRepository. It owns two slices —
// `searchResults` and `customFoods` — and keeps them in sync with the
// repository. The store never implements business logic itself; it delegates
// search and custom-food CRUD to LocalFoodRepository, validates custom-food
// inputs before persisting (Req 4.1, 4.2), enforces name uniqueness (Req 4.7),
// and reloads the `customFoods` slice after every mutation so subscribed
// components re-render with fresh data. (Req 3.3–3.7, 4.1–4.7)

import { create } from 'zustand';
import {
  type CustomFood,
  type FoodItem,
  type ValidationError,
} from '../types/index.ts';
import { localFoodRepository } from '../repositories/LocalFoodRepository.ts';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Input shape accepted by {@link validateCustomFoodInput}.
 *
 * Every field is typed `unknown` and optional so the validator can detect
 * missing, null, or wrongly-typed values and report them as
 * {@link ValidationError}s. Valid inputs (e.g. a {@link NewCustomFood}) satisfy
 * this shape structurally.
 */
export interface CustomFoodValidationInput {
  name?: unknown;
  category?: unknown;
  caloriesPer100g?: unknown;
  proteinPer100g?: unknown;
  carbsPer100g?: unknown;
  fatPer100g?: unknown;
}

/** Maximum allowed length for a custom food name. (Req 4.1) */
const MAX_NAME_LENGTH = 100;

/** Maximum allowed value for per-100g macro fields. (Req 4.1) */
const MAX_MACRO_VALUE = 9999.9;

/**
 * Validate a custom food's required fields against the constraints in
 * Requirements 4.1 and 4.2.
 *
 * `name` must be a string of 1–100 characters. `caloriesPer100g`,
 * `proteinPer100g`, `carbsPer100g`, and `fatPer100g` must each be a present,
 * finite number in the range 0–9999.9. `category` is optional and not
 * validated here.
 *
 * Returns one `ValidationError` per invalid field; an empty array signals a
 * fully valid input.
 *
 * **Validates: Requirements 4.1, 4.2, 18.4 — Property 6**
 */
export function validateCustomFoodInput(
  food: CustomFoodValidationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // name — required string, 1–100 characters (Req 4.1)
  if (typeof food.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'Name is required and must be a string',
    });
  } else if (food.name.length < 1 || food.name.length > MAX_NAME_LENGTH) {
    errors.push({
      field: 'name',
      message: 'Name must be between 1 and 100 characters',
    });
  }

  // Numeric macro fields — present, a number, 0–9999.9 (Req 4.1, 4.2)
  validateMacroValue(
    food.caloriesPer100g,
    'caloriesPer100g',
    'Calories per 100g',
    errors,
  );
  validateMacroValue(
    food.proteinPer100g,
    'proteinPer100g',
    'Protein per 100g',
    errors,
  );
  validateMacroValue(food.carbsPer100g, 'carbsPer100g', 'Carbs per 100g', errors);
  validateMacroValue(food.fatPer100g, 'fatPer100g', 'Fat per 100g', errors);

  return errors;
}

/**
 * Internal helper: pushes a {@link ValidationError} when `value` is missing,
 * not a number, `NaN`, negative, or above the maximum allowed value.
 * (Req 4.2 — reject negative, non-numeric, out-of-range)
 */
function validateMacroValue(
  value: unknown,
  field: string,
  label: string,
  errors: ValidationError[],
): void {
  if (value == null || typeof value !== 'number' || Number.isNaN(value)) {
    errors.push({ field, message: `${label} is required and must be a number` });
    return;
  }
  if (value < 0) {
    errors.push({
      field,
      message: `${label} must be greater than or equal to zero`,
    });
    return;
  }
  if (value > MAX_MACRO_VALUE) {
    errors.push({
      field,
      message: `${label} must be at most ${MAX_MACRO_VALUE}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Loads the current user's custom foods from the repository.
 *
 * Sets the active userId on the repository singleton (so custom foods are
 * merged at query time — Req 3.4) and returns only the custom items by
 * filtering the merged search results. Bundled foods never carry `isCustom`,
 * so filtering on `isCustom === true` reliably isolates custom foods.
 */
function getCustomFoods(userId: string): CustomFood[] {
  localFoodRepository.setUserId(userId);
  return localFoodRepository
    .search('')
    .filter((f): f is CustomFood => (f as CustomFood).isCustom === true);
}

/**
 * Returns a category string, defaulting to `'custom'` when the supplied
 * category is missing or empty. (Req 4.1 — optional category)
 */
function resolveCategory(category: unknown): string {
  if (typeof category === 'string' && category !== '') return category;
  return 'custom';
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/** The input shape for creating a custom food (id and isCustom are assigned). */
export type NewCustomFood = Omit<CustomFood, 'id' | 'isCustom'>;

/** The partial-update shape for editing a custom food. */
export type CustomFoodUpdates = Partial<NewCustomFood>;

interface FoodState {
  // ── Slices ──────────────────────────────────────────────────────────────────
  /** Results from the most recent search. (Req 3.3, 3.7) */
  searchResults: FoodItem[];
  /** The current user's custom food items. (Req 4.3) */
  customFoods: CustomFood[];

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Searches bundled + custom foods for `query` (case-insensitive substring
   * on name and category) and stores the results in `searchResults`. An empty
   * query returns all items; zero matches returns an empty array. (Req 3.3,
   * 3.4, 3.7)
   */
  search: (query: string, userId: string) => void;

  /**
   * Validates and persists a new custom food. Returns `ValidationError[]`
   * when validation fails (invalid fields or a duplicate name — Req 4.1, 4.2,
   * 4.7); returns `void` on success after persisting and reloading the
   * `customFoods` slice. (Req 4.3, 4.6)
   */
  addCustomFood: (
    food: NewCustomFood,
    userId: string,
  ) => ValidationError[] | void;

  /**
   * Validates and applies `updates` to the custom food with `id`. Returns
   * `ValidationError[]` on validation failure or when the food is not found;
   * returns `void` on success after persisting and reloading the
   * `customFoods` slice. (Req 4.4, 4.7)
   */
  editCustomFood: (
    id: string,
    updates: CustomFoodUpdates,
    userId: string,
  ) => ValidationError[] | void;

  /**
   * Removes the custom food with `id` from storage and reloads the
   * `customFoods` slice. (Req 4.5)
   */
  deleteCustomFood: (id: string, userId: string) => void;

  /**
   * Loads the current user's custom foods from storage into the
   * `customFoods` slice. (Req 4.3)
   */
  loadCustomFoods: (userId: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useFoodStore = create<FoodState>((set) => ({
  searchResults: [],
  customFoods: [],

  search: (query, userId) => {
    // Set the userId so the repository merges the user's custom foods at
    // query time (Req 3.4), then run the case-insensitive substring search
    // (Req 3.3). Zero matches yields an empty array (Req 3.7).
    localFoodRepository.setUserId(userId);
    set({ searchResults: localFoodRepository.search(query) });
  },

  addCustomFood: (food, userId) => {
    // Validate required fields and ranges before persisting (Req 4.1, 4.2).
    const errors = validateCustomFoodInput(food);
    if (errors.length > 0) return errors;

    // Ensure the repository targets this user's custom foods (Req 3.4) and
    // load the existing list to check for name collisions.
    const existing = getCustomFoods(userId);

    // Prevent two custom foods with the same name (case-insensitive). (Req 4.7)
    const nameLower = food.name.toLowerCase();
    if (existing.some((f) => f.name.toLowerCase() === nameLower)) {
      return [
        {
          field: 'name',
          message: 'A custom food with this name already exists',
        },
      ];
    }

    // Create a custom food with a "custom_"-prefixed ID (Req 4.6) and
    // persist it to dietsync:[userId]:customFoods (Req 4.3).
    const customFood = localFoodRepository.createCustomFood(
      food.name,
      food.caloriesPer100g,
      food.proteinPer100g,
      food.carbsPer100g,
      food.fatPer100g,
      resolveCategory(food.category),
    );
    localFoodRepository.addCustomFood(customFood);

    // Reload the slice so components show the new food immediately. (Req 4.3)
    set({ customFoods: getCustomFoods(userId) });
  },

  editCustomFood: (id, updates, userId) => {
    const existing = getCustomFoods(userId);
    const current = existing.find((f) => f.id === id);
    if (!current) {
      return [{ field: 'id', message: 'Custom food not found' }];
    }

    // Merge only the provided updates over the current record (Req 4.4).
    const merged: NewCustomFood = {
      name: updates.name !== undefined ? updates.name : current.name,
      category:
        updates.category !== undefined ? updates.category : current.category,
      caloriesPer100g:
        updates.caloriesPer100g !== undefined
          ? updates.caloriesPer100g
          : current.caloriesPer100g,
      proteinPer100g:
        updates.proteinPer100g !== undefined
          ? updates.proteinPer100g
          : current.proteinPer100g,
      carbsPer100g:
        updates.carbsPer100g !== undefined
          ? updates.carbsPer100g
          : current.carbsPer100g,
      fatPer100g:
        updates.fatPer100g !== undefined ? updates.fatPer100g : current.fatPer100g,
      source: updates.source !== undefined ? updates.source : current.source,
    };

    // Validate the merged record (Req 4.1, 4.2).
    const errors = validateCustomFoodInput(merged);
    if (errors.length > 0) return errors;

    // Prevent a duplicate name among the *other* custom foods (Req 4.7).
    const nameLower = merged.name.toLowerCase();
    if (
      existing.some((f) => f.id !== id && f.name.toLowerCase() === nameLower)
    ) {
      return [
        {
          field: 'name',
          message: 'A custom food with this name already exists',
        },
      ];
    }

    // Persist the updated record (Req 4.4) and reload the slice.
    const updatedFood: CustomFood = {
      ...current,
      ...merged,
      id: current.id,
      isCustom: true,
    };
    localFoodRepository.editCustomFood(updatedFood);

    set({ customFoods: getCustomFoods(userId) });
  },

  deleteCustomFood: (id, userId) => {
    // Remove from storage (Req 4.5) and reload the slice.
    localFoodRepository.setUserId(userId);
    localFoodRepository.deleteCustomFood(id);
    set({ customFoods: getCustomFoods(userId) });
  },

  loadCustomFoods: (userId) => {
    set({ customFoods: getCustomFoods(userId) });
  },
}));
