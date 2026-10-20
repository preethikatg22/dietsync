// ─────────────────────────────────────────────────────────────────────────────
// DietSync — LocalFoodRepository
// Requirements: 3.3, 3.4, 3.6, 3.7, 4.6
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { FoodItem, CustomFood } from '../types/index';
import { STORAGE_KEYS } from '../types/index';
import type { IFoodRepository, FoodRepositoryError } from './IFoodRepository';
import { storageRepository } from './StorageRepository';

// ---------------------------------------------------------------------------
// Zod schema for custom foods stored in LocalStorage
// ---------------------------------------------------------------------------

const CustomFoodSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  caloriesPer100g: z.number(),
  proteinPer100g: z.number(),
  carbsPer100g: z.number(),
  fatPer100g: z.number(),
  isCustom: z.literal(true),
  source: z.string().optional(),
});

const CustomFoodArraySchema = z.array(CustomFoodSchema);

// ---------------------------------------------------------------------------
// Load bundled foods.json at module initialisation time (Req 3.1, 3.5)
// ---------------------------------------------------------------------------

import foodsData from '../data/foods.json';

const BUNDLED_FOODS: FoodItem[] = (foodsData as { version: string; items: FoodItem[] }).items;

// ---------------------------------------------------------------------------
// LocalFoodRepository
// ---------------------------------------------------------------------------

/**
 * Concrete implementation of `IFoodRepository`.
 *
 * Bundles are loaded once at module initialisation. Custom foods are loaded
 * from `StorageRepository` at query time so they always reflect the latest
 * state without needing a manual refresh call.
 *
 * Pass a `userId` to the constructor (or call `setUserId`) to enable custom
 * food operations. Without a userId, all queries operate on bundled foods
 * only and custom-food mutations throw.
 */
export class LocalFoodRepository implements IFoodRepository {
  private userId: string | null;

  constructor(userId: string | null = null) {
    this.userId = userId;
  }

  // ── userId management ────────────────────────────────────────────────────

  /**
   * Updates the active userId. Subsequent queries will load custom foods for
   * the new user. Pass `null` to revert to bundled-only mode.
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  getuserId(): string | null {
    return this.userId;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Loads the current user's custom foods from LocalStorage.
   * Returns an empty array when no userId is set or the key is absent /
   * fails validation.
   */
  private loadCustomFoods(): CustomFood[] {
    if (!this.userId) return [];
    const key = STORAGE_KEYS.CUSTOM_FOODS(this.userId);
    return storageRepository.get(key, CustomFoodArraySchema, []);
  }

  /**
   * Persists the provided custom foods array back to LocalStorage.
   * Throws if no userId is set.
   */
  private saveCustomFoods(foods: CustomFood[]): void {
    if (!this.userId) {
      throw new Error('[LocalFoodRepository] Cannot persist custom foods without a userId.');
    }
    const key = STORAGE_KEYS.CUSTOM_FOODS(this.userId);
    storageRepository.set(key, foods);
  }

  // ── IFoodRepository ──────────────────────────────────────────────────────

  /**
   * Case-insensitive substring search on `name` and `category`.
   * Merges bundled + custom foods at query time.
   * Returns all items when `query` is an empty string. (Req 3.3, 3.4)
   */
  search(query: string): FoodItem[] {
    const customFoods = this.loadCustomFoods();
    const allFoods: FoodItem[] = [...BUNDLED_FOODS, ...customFoods];

    if (query === '') {
      return allFoods;
    }

    const lower = query.toLowerCase();
    return allFoods.filter(
      (item) =>
        item.name.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower),
    );
  }

  /**
   * Looks up a food item by ID — bundled first, then custom.
   * Returns a `FoodRepositoryError` (never null/undefined) if not found. (Req 3.6)
   */
  getById(id: string): FoodItem | FoodRepositoryError {
    const bundled = BUNDLED_FOODS.find((item) => item.id === id);
    if (bundled) return bundled;

    const customFoods = this.loadCustomFoods();
    const custom = customFoods.find((item) => item.id === id);
    if (custom) return custom;

    return {
      error: true,
      message: `No food item found with id "${id}".`,
      id,
    };
  }

  /**
   * Returns the de-duplicated, sorted list of all category values present
   * in bundled + custom foods. (Req 3.4)
   */
  getCategories(): string[] {
    const customFoods = this.loadCustomFoods();
    const allFoods: FoodItem[] = [...BUNDLED_FOODS, ...customFoods];
    const categorySet = new Set(allFoods.map((item) => item.category));
    return [...categorySet].sort();
  }

  // ── Custom food CRUD ─────────────────────────────────────────────────────

  /**
   * Creates a new `CustomFood` record with a `"custom_"` + UUID v4 ID,
   * guaranteeing no collision with bundled food IDs. (Req 4.6)
   *
   * Does NOT persist — call `addCustomFood` to persist immediately, or
   * use the returned object to stage multiple changes before saving.
   */
  createCustomFood(
    name: string,
    caloriesPer100g: number,
    proteinPer100g: number,
    carbsPer100g: number,
    fatPer100g: number,
    category = 'custom',
  ): CustomFood {
    return {
      id: `custom_${crypto.randomUUID()}`,
      name,
      category,
      caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      isCustom: true,
    };
  }

  /**
   * Persists a new custom food to LocalStorage. (Req 4.3)
   * The food should be created via `createCustomFood` to ensure the ID format.
   */
  addCustomFood(food: CustomFood): void {
    const existing = this.loadCustomFoods();
    this.saveCustomFoods([...existing, food]);
  }

  /**
   * Replaces the stored custom food record whose `id` matches `updatedFood.id`.
   * Throws if no matching food is found. (Req 4.4)
   */
  editCustomFood(updatedFood: CustomFood): void {
    const existing = this.loadCustomFoods();
    const index = existing.findIndex((f) => f.id === updatedFood.id);
    if (index === -1) {
      throw new Error(
        `[LocalFoodRepository] Cannot edit: no custom food found with id "${updatedFood.id}".`,
      );
    }
    const updated = [...existing];
    updated[index] = updatedFood;
    this.saveCustomFoods(updated);
  }

  /**
   * Removes the custom food with the given `id` from LocalStorage.
   * No-op if the id is not found. (Req 4.5)
   */
  deleteCustomFood(id: string): void {
    const existing = this.loadCustomFoods();
    const filtered = existing.filter((f) => f.id !== id);
    this.saveCustomFoods(filtered);
  }
}

// ---------------------------------------------------------------------------
// Default singleton — use this unless you need a user-scoped instance
// ---------------------------------------------------------------------------

/**
 * App-wide singleton. Call `localFoodRepository.setUserId(userId)` after
 * login to enable custom food operations.
 */
export const localFoodRepository = new LocalFoodRepository();

/**
 * Factory function for creating user-scoped instances in tests or
 * multi-user scenarios.
 */
export function createLocalFoodRepository(userId: string | null = null): LocalFoodRepository {
  return new LocalFoodRepository(userId);
}
