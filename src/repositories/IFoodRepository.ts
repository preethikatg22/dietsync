// ─────────────────────────────────────────────────────────────────────────────
// DietSync — IFoodRepository Interface
// Requirements: 3.3, 3.6
// ─────────────────────────────────────────────────────────────────────────────

import type { FoodItem } from '../types/index';

/**
 * Returned by `getById` when no food item is found with the given ID.
 * Never null or undefined — callers always get a typed result.
 */
export type FoodRepositoryError = {
  error: true;
  message: string;
  id: string;
};

/**
 * Contract for food item data access.
 *
 * Implementations must merge bundled food data with user-created custom foods
 * at query time.
 */
export interface IFoodRepository {
  /**
   * Case-insensitive substring search against `name` and `category`.
   * Returns only items that match the query. Returns all items when query
   * is an empty string. (Req 3.3)
   */
  search(query: string): FoodItem[];

  /**
   * Looks up a food item by its unique ID across bundled and custom foods.
   * Returns the matching `FoodItem` or a `FoodRepositoryError` — never null
   * or undefined. (Req 3.6)
   */
  getById(id: string): FoodItem | FoodRepositoryError;

  /**
   * Returns the de-duplicated, sorted list of all category values present
   * in bundled and custom foods. (Req 3.4)
   */
  getCategories(): string[];
}
