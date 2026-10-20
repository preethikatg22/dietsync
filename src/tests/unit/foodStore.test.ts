/**
 * Unit tests for the foodStore (Zustand).
 *
 * Verifies that each action calls LocalFoodRepository and updates the
 * `searchResults` and `customFoods` slices accordingly, and that custom-food
 * validation rejects invalid input and enforces name uniqueness. Runs against
 * the real LocalFoodRepository + StorageRepository stack (no mocking),
 * consistent with the design's integration testing guidance. An account is
 * created via authStore to obtain a real userId. localStorage is cleared
 * between tests.
 *
 * **Validates: Requirements 3.3–3.7, 4.1–4.7**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  useFoodStore,
  validateCustomFoodInput,
  type NewCustomFood,
} from '../../stores/foodStore.ts';
import { useAuthStore } from '../../stores/authStore.ts';
import { type CustomFood, type OnboardingData } from '../../types/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid onboarding profile used to create test accounts. */
function makeProfile(email: string, password = 'password123'): OnboardingData {
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

/** Create a real account and return its userId. */
async function setupUser(email: string): Promise<string> {
  await useAuthStore.getState().createAccount(makeProfile(email));
  return useAuthStore.getState().currentUser!.userId;
}

/** A valid custom-food input object. */
function validCustomFoodInput(): NewCustomFood {
  return {
    name: 'My Custom Food',
    category: 'snacks',
    caloriesPer100g: 250,
    proteinPer100g: 10,
    carbsPer100g: 30,
    fatPer100g: 8,
  };
}

/** Reset both stores to their default state. */
function resetStores(): void {
  useAuthStore.setState({ session: null, currentUser: null });
  useFoodStore.setState({ searchResults: [], customFoods: [] });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

// ---------------------------------------------------------------------------
// validateCustomFoodInput
// ---------------------------------------------------------------------------

describe('validateCustomFoodInput', () => {
  /**
   * **Validates: Requirements 4.1, 18.4 — Property 6**
   */
  it('accepts valid input and returns an empty error array', () => {
    expect(validateCustomFoodInput(validCustomFoodInput())).toEqual([]);
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   */
  it('rejects an empty name', () => {
    const errors = validateCustomFoodInput({
      ...validCustomFoodInput(),
      name: '',
    });
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   */
  it('rejects a name longer than 100 characters', () => {
    const errors = validateCustomFoodInput({
      ...validCustomFoodInput(),
      name: 'x'.repeat(101),
    });
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  /**
   * **Validates: Requirements 4.1, 4.2 — Property 6**
   */
  it('rejects negative macro values', () => {
    const errors = validateCustomFoodInput({
      ...validCustomFoodInput(),
      caloriesPer100g: -1,
    });
    expect(errors.some((e) => e.field === 'caloriesPer100g')).toBe(true);
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   */
  it('rejects macro values above 9999.9', () => {
    const errors = validateCustomFoodInput({
      ...validCustomFoodInput(),
      proteinPer100g: 10000,
    });
    expect(errors.some((e) => e.field === 'proteinPer100g')).toBe(true);
  });

  /**
   * **Validates: Requirements 4.2 — Property 6**
   */
  it('rejects non-numeric (NaN) values', () => {
    const errors = validateCustomFoodInput({
      ...validCustomFoodInput(),
      fatPer100g: NaN,
    });
    expect(errors.some((e) => e.field === 'fatPer100g')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

describe('foodStore — search', () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Search matches case-insensitively on name and category, with no false
   * positives.
   */
  it('returns only items whose name or category contains the query (case-insensitive)', async () => {
    const userId = await setupUser('search1@example.com');
    // "rice" matches bundled items like "Brown Rice (cooked)".
    useFoodStore.getState().search('RICE', userId);

    const { searchResults } = useFoodStore.getState();
    expect(searchResults.length).toBeGreaterThan(0);
    for (const item of searchResults) {
      const matches =
        item.name.toLowerCase().includes('rice') ||
        item.category.toLowerCase().includes('rice');
      expect(matches).toBe(true);
    }
  });

  /**
   * **Validates: Requirements 3.7**
   *
   * A query matching zero items returns an empty array, not an error.
   */
  it('returns an empty array when no foods match', async () => {
    const userId = await setupUser('search2@example.com');
    useFoodStore.getState().search('zzzznotfound', userId);
    expect(useFoodStore.getState().searchResults).toHaveLength(0);
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * Custom foods are merged with bundled foods at query time, so a custom
   * food appears in search results.
   */
  it('includes custom foods in search results', async () => {
    const userId = await setupUser('search3@example.com');
    useFoodStore.getState().addCustomFood(
      { ...validCustomFoodInput(), name: 'Kale Smoothie' },
      userId,
    );

    useFoodStore.getState().search('kale smoothie', userId);

    const match = useFoodStore
      .getState()
      .searchResults.find((f) => f.name === 'Kale Smoothie');
    expect(match).toBeDefined();
    expect((match as CustomFood).isCustom).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addCustomFood
// ---------------------------------------------------------------------------

describe('foodStore — addCustomFood', () => {
  /**
   * **Validates: Requirements 4.3, 4.6**
   *
   * A valid custom food is persisted, the customFoods slice is reloaded, and
   * the generated ID uses the "custom_" prefix (no collision with bundled).
   */
  it('persists a valid custom food, reloads the slice, and uses a custom_ ID', async () => {
    const userId = await setupUser('add1@example.com');
    const result = useFoodStore.getState().addCustomFood(
      validCustomFoodInput(),
      userId,
    );

    expect(result).toBeUndefined();

    const { customFoods } = useFoodStore.getState();
    expect(customFoods).toHaveLength(1);
    expect(customFoods[0].name).toBe('My Custom Food');
    expect(customFoods[0].isCustom).toBe(true);
    expect(customFoods[0].id).toMatch(/^custom_/);
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * Invalid input returns validation errors and does not persist.
   */
  it('returns validation errors for invalid input and does not persist', async () => {
    const userId = await setupUser('add2@example.com');
    const errors = useFoodStore.getState().addCustomFood(
      { ...validCustomFoodInput(), name: '', caloriesPer100g: -5 },
      userId,
    );

    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
    expect(useFoodStore.getState().customFoods).toHaveLength(0);
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * Two custom foods with the same name (case-insensitive) are prevented.
   */
  it('prevents creating a custom food with a duplicate name (case-insensitive)', async () => {
    const userId = await setupUser('add3@example.com');
    useFoodStore.getState().addCustomFood(validCustomFoodInput(), userId);

    const duplicate = { ...validCustomFoodInput(), name: 'MY CUSTOM FOOD' };
    const errors = useFoodStore.getState().addCustomFood(duplicate, userId);

    expect(errors).toBeDefined();
    expect(errors![0].field).toBe('name');
    expect(useFoodStore.getState().customFoods).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// editCustomFood
// ---------------------------------------------------------------------------

describe('foodStore — editCustomFood', () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * Editing updates the stored record and the slice reflects the change.
   */
  it('updates a custom food and reflects the change in the slice', async () => {
    const userId = await setupUser('edit1@example.com');
    useFoodStore.getState().addCustomFood(validCustomFoodInput(), userId);
    const id = useFoodStore.getState().customFoods[0].id;

    const result = useFoodStore.getState().editCustomFood(
      id,
      { caloriesPer100g: 300 },
      userId,
    );

    expect(result).toBeUndefined();
    expect(useFoodStore.getState().customFoods[0].caloriesPer100g).toBe(300);
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * Invalid updates return validation errors and do not persist.
   */
  it('returns validation errors for invalid updates', async () => {
    const userId = await setupUser('edit2@example.com');
    useFoodStore.getState().addCustomFood(validCustomFoodInput(), userId);
    const id = useFoodStore.getState().customFoods[0].id;

    const errors = useFoodStore.getState().editCustomFood(
      id,
      { proteinPer100g: -10 },
      userId,
    );

    expect(errors).toBeDefined();
    expect(errors!.some((e) => e.field === 'proteinPer100g')).toBe(true);
    // Original value unchanged.
    expect(useFoodStore.getState().customFoods[0].proteinPer100g).toBe(10);
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * Editing to a name that another custom food already has is prevented.
   */
  it('prevents editing to a duplicate name', async () => {
    const userId = await setupUser('edit3@example.com');
    useFoodStore.getState().addCustomFood(
      { ...validCustomFoodInput(), name: 'Food One' },
      userId,
    );
    useFoodStore.getState().addCustomFood(
      { ...validCustomFoodInput(), name: 'Food Two' },
      userId,
    );

    const id1 = useFoodStore.getState().customFoods[0].id;
    const errors = useFoodStore.getState().editCustomFood(
      id1,
      { name: 'FOOD TWO' },
      userId,
    );

    expect(errors).toBeDefined();
    expect(errors![0].field).toBe('name');
  });

  /**
   * Editing a non-existent food returns an error.
   */
  it('returns an error when the food is not found', async () => {
    const userId = await setupUser('edit4@example.com');
    const errors = useFoodStore.getState().editCustomFood(
      'custom_nonexistent',
      { name: 'X' },
      userId,
    );
    expect(errors).toBeDefined();
    expect(errors![0].field).toBe('id');
  });

  /**
   * **Validates: Requirements 4.4**
   *
   * Updated values are reflected in subsequent search queries.
   */
  it('reflects updated values in subsequent search queries', async () => {
    const userId = await setupUser('edit5@example.com');
    useFoodStore.getState().addCustomFood(
      { ...validCustomFoodInput(), name: 'Original Name' },
      userId,
    );
    const id = useFoodStore.getState().customFoods[0].id;

    useFoodStore.getState().editCustomFood(id, { name: 'Renamed Food' }, userId);
    useFoodStore.getState().search('renamed food', userId);

    expect(
      useFoodStore.getState().searchResults.find((f) => f.name === 'Renamed Food'),
    ).toBeDefined();
    expect(
      useFoodStore.getState().searchResults.find((f) => f.name === 'Original Name'),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteCustomFood
// ---------------------------------------------------------------------------

describe('foodStore — deleteCustomFood', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * Deleting removes the food from storage and the slice.
   */
  it('removes a custom food and updates the slice', async () => {
    const userId = await setupUser('del1@example.com');
    useFoodStore.getState().addCustomFood(validCustomFoodInput(), userId);
    const id = useFoodStore.getState().customFoods[0].id;

    useFoodStore.getState().deleteCustomFood(id, userId);

    expect(useFoodStore.getState().customFoods).toHaveLength(0);
  });

  /**
   * **Validates: Requirements 4.5**
   *
   * A deleted custom food no longer appears in search results.
   */
  it('deleted food no longer appears in search results', async () => {
    const userId = await setupUser('del2@example.com');
    useFoodStore.getState().addCustomFood(
      { ...validCustomFoodInput(), name: 'Delete Me' },
      userId,
    );
    const id = useFoodStore.getState().customFoods[0].id;

    useFoodStore.getState().deleteCustomFood(id, userId);
    useFoodStore.getState().search('delete me', userId);

    expect(
      useFoodStore.getState().searchResults.find((f) => f.name === 'Delete Me'),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loadCustomFoods
// ---------------------------------------------------------------------------

describe('foodStore — loadCustomFoods', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * loadCustomFoods reads the persisted custom foods into the slice, even
   * when the slice was stale.
   */
  it('loads custom foods from storage into the slice', async () => {
    const userId = await setupUser('load1@example.com');
    useFoodStore.getState().addCustomFood(validCustomFoodInput(), userId);

    // Simulate a stale slice.
    useFoodStore.setState({ customFoods: [] });
    expect(useFoodStore.getState().customFoods).toHaveLength(0);

    useFoodStore.getState().loadCustomFoods(userId);
    expect(useFoodStore.getState().customFoods).toHaveLength(1);
  });

  /**
   * A user with no custom foods loads an empty array.
   */
  it('loads an empty array when the user has no custom foods', async () => {
    const userId = await setupUser('load2@example.com');
    useFoodStore.getState().loadCustomFoods(userId);
    expect(useFoodStore.getState().customFoods).toHaveLength(0);
  });
});
