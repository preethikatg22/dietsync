/**
 * Unit tests for src/data/foods.json
 *
 * Validates: Requirements 3.1, 3.2
 *
 * Verifies:
 *  - Item count is within the 300–400 range (Req 3.1)
 *  - Every item has required fields with correct types (Req 3.1)
 *  - All numeric fields are non-negative (Req 3.1)
 *  - All category values belong to the allowed set (Req 3.2)
 *  - No duplicate IDs exist across the database
 */

import { describe, expect, it } from 'vitest';
import foodsData from '../../data/foods.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FoodItem {
  id: string;
  name: string;
  category: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: string;
}

const ALLOWED_CATEGORIES = new Set([
  'grains',
  'dairy',
  'proteins',
  'fruits',
  'vegetables',
  'snacks',
  'indian_staples',
]);

const NUMERIC_FIELDS: Array<keyof FoodItem> = [
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
];

const items: FoodItem[] = (foodsData as { version: string; items: FoodItem[] }).items;

// ---------------------------------------------------------------------------
// Top-level structure
// ---------------------------------------------------------------------------

describe('foods.json — top-level structure', () => {
  it('has a version field equal to "1.0.0"', () => {
    expect((foodsData as { version: string }).version).toBe('1.0.0');
  });

  it('has an "items" array', () => {
    expect(Array.isArray(items)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item count (Req 3.1)
// ---------------------------------------------------------------------------

describe('foods.json — item count', () => {
  it('contains between 300 and 400 items inclusive', () => {
    expect(items.length).toBeGreaterThanOrEqual(300);
    expect(items.length).toBeLessThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Required fields and types (Req 3.1)
// ---------------------------------------------------------------------------

describe('foods.json — required fields and types', () => {
  it('every item has an "id" field that is a non-empty string', () => {
    const bad = items.filter((item) => typeof item.id !== 'string' || item.id.trim() === '');
    expect(bad).toHaveLength(0);
  });

  it('every item has a "name" field that is a non-empty string', () => {
    const bad = items.filter((item) => typeof item.name !== 'string' || item.name.trim() === '');
    expect(bad).toHaveLength(0);
  });

  it('every item has a "category" field that is a non-empty string', () => {
    const bad = items.filter(
      (item) => typeof item.category !== 'string' || item.category.trim() === '',
    );
    expect(bad).toHaveLength(0);
  });

  it('every item has a "source" field that is a non-empty string', () => {
    const bad = items.filter(
      (item) => typeof item.source !== 'string' || item.source.trim() === '',
    );
    expect(bad).toHaveLength(0);
  });

  it.each(NUMERIC_FIELDS)('every item has "%s" as a finite number', (field) => {
    const bad = items.filter(
      (item) => typeof item[field] !== 'number' || !Number.isFinite(item[field] as number),
    );
    expect(bad).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Non-negative numeric values (Req 3.1)
// ---------------------------------------------------------------------------

describe('foods.json — non-negative numeric values', () => {
  it.each(NUMERIC_FIELDS)('every item has a non-negative value for "%s"', (field) => {
    const bad = items.filter((item) => (item[field] as number) < 0);
    expect(bad).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Allowed categories (Req 3.2)
// ---------------------------------------------------------------------------

describe('foods.json — allowed categories', () => {
  it('every item has a category from the allowed set', () => {
    const bad = items.filter((item) => !ALLOWED_CATEGORIES.has(item.category));
    expect(bad).toHaveLength(0);
  });

  it('contains items in each of the 7 allowed categories', () => {
    const usedCategories = new Set(items.map((item) => item.category));
    for (const cat of ALLOWED_CATEGORIES) {
      expect(usedCategories.has(cat)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Duplicate IDs
// ---------------------------------------------------------------------------

describe('foods.json — unique IDs', () => {
  it('has no duplicate IDs', () => {
    const ids = items.map((item) => item.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
