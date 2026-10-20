// ─────────────────────────────────────────────────────────────────────────────
// FoodSearchModal — search for food and add it to a meal section
// Requirements: 5.1–5.3, 5.6, 15.1, 15.4
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import type { FoodItem, MealSection } from '../../types/index.ts';
import { useFoodStore } from '../../stores/foodStore.ts';
import { useLogStore } from '../../stores/logStore.ts';
import { foodLogService } from '../../services/FoodLogService.ts';
import { localFoodRepository } from '../../repositories/LocalFoodRepository.ts';
import type { FoodRepositoryError } from '../../repositories/IFoodRepository.ts';

interface FoodSearchModalProps {
  /** The meal section the entry will be added to */
  targetSection: MealSection;
  /** The authenticated user's ID */
  userId: string;
  /** Close the modal */
  onClose: () => void;
}

const SECTION_LABELS: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

/**
 * Modal dialog for searching the food database and adding an entry.
 *
 * Flow:
 * 1. When opened with no query, a "Recent Foods" section is shown (Req 15.1, 15.4)
 * 2. User types a query → `foodStore.search` is called → results update; recent
 *    foods section is hidden while a query is active
 * 3. User selects a food item (from search results or recent foods)
 * 4. User enters a serving size in grams (0.1–2000 g)
 * 5. User confirms → `logStore.addEntry` is called → modal closes
 *
 * (Req 5.1, 5.2, 5.3, 5.6, 15.1, 15.4)
 */
export function FoodSearchModal({ targetSection, userId, onClose }: FoodSearchModalProps) {
  const search = useFoodStore((s) => s.search);
  const searchResults = useFoodStore((s) => s.searchResults);
  const addEntry = useLogStore((s) => s.addEntry);

  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingGrams, setServingGrams] = useState<string>('100');
  const [servingError, setServingError] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string>('');

  // Recent foods: resolved FoodItem list (IDs that map to deleted foods are skipped)
  const [recentFoods, setRecentFoods] = useState<FoodItem[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Load recent foods when the modal first opens (Req 15.1, 15.4)
  useEffect(() => {
    localFoodRepository.setUserId(userId);
    const recentIds = foodLogService.getRecentFoods(userId);
    const resolved: FoodItem[] = [];
    for (const id of recentIds) {
      const result = localFoodRepository.getById(id);
      // Skip IDs that resolve to FoodRepositoryError (food was deleted)
      if (!(result as FoodRepositoryError).error) {
        resolved.push(result as FoodItem);
      }
    }
    setRecentFoods(resolved);
  }, [userId]);

  // Trigger search as user types — only when there is an active query
  useEffect(() => {
    if (query.length > 0) {
      search(query, userId);
    }
  }, [query, userId, search]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleSelectFood(food: FoodItem) {
    setSelectedFood(food);
    setServingGrams('100');
    setServingError('');
    setAddError('');
  }

  function handleServingChange(value: string) {
    setServingGrams(value);
    setServingError('');
  }

  function validateServing(): number | null {
    const num = parseFloat(servingGrams);
    if (isNaN(num) || num <= 0) {
      setServingError('Serving size must be greater than 0 g');
      return null;
    }
    if (num > 2000) {
      setServingError('Serving size cannot exceed 2000 g');
      return null;
    }
    return num;
  }

  function handleAdd() {
    if (!selectedFood) return;
    const grams = validateServing();
    if (grams === null) return;

    setIsAdding(true);
    setAddError('');
    try {
      addEntry(userId, selectedFood.id, grams, targetSection);
      onClose();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add entry');
      setIsAdding(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add food to ${SECTION_LABELS[targetSection]}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Add to {SECTION_LABELS[targetSection]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search modal"
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <label htmlFor="food-search-input" className="sr-only">
            Search foods
          </label>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="food-search-input"
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Results + serving panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {/* ── Recent Foods section (shown only when query is empty) ── */}
            {query.length === 0 && (
              <section aria-label="Recent foods">
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  {/* Clock icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-400"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Recent Foods
                  </h3>
                </div>

                {recentFoods.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                    No recent foods yet
                  </div>
                ) : (
                  <ul role="listbox" aria-label="Recent foods">
                    {recentFoods.map((food) => (
                      <li key={food.id} role="option" aria-selected={selectedFood?.id === food.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectFood(food)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700/50 border-b border-gray-50 dark:border-gray-700/50 last:border-0 transition-colors ${
                            selectedFood?.id === food.id
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-l-emerald-500'
                              : ''
                          }`}
                        >
                          <p className="font-medium text-sm text-gray-800 dark:text-gray-100">
                            {food.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {food.caloriesPer100g} kcal &middot; P {food.proteinPer100g}g &middot; C{' '}
                            {food.carbsPer100g}g &middot; F {food.fatPer100g}g{' '}
                            <span className="capitalize text-gray-400">· {food.category}</span>
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Divider before search results */}
                <div className="px-4 pt-3 pb-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Start typing to search all foods
                  </p>
                </div>
              </section>
            )}

            {/* ── Search Results section (shown only when query has ≥1 char) ── */}
            {query.length > 0 && (
              <>
                {searchResults.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">
                    {`No results for "${query}"`}
                  </div>
                ) : (
                  <ul role="listbox" aria-label="Food search results">
                    {searchResults.map((food) => (
                      <li key={food.id} role="option" aria-selected={selectedFood?.id === food.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectFood(food)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700/50 border-b border-gray-50 dark:border-gray-700/50 last:border-0 transition-colors ${
                            selectedFood?.id === food.id
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-l-emerald-500'
                              : ''
                          }`}
                        >
                          <p className="font-medium text-sm text-gray-800 dark:text-gray-100">
                            {food.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {food.caloriesPer100g} kcal &middot; P {food.proteinPer100g}g &middot; C{' '}
                            {food.carbsPer100g}g &middot; F {food.fatPer100g}g{' '}
                            <span className="capitalize text-gray-400">· {food.category}</span>
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        {/* Serving size + add button — shown when a food is selected */}
        {selectedFood && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">
                {selectedFood.name}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="serving-size-input" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Serving size (grams):
                </label>
                <input
                  id="serving-size-input"
                  type="number"
                  min="0.1"
                  max="2000"
                  step="0.1"
                  value={servingGrams}
                  onChange={(e) => handleServingChange(e.target.value)}
                  className={`w-24 rounded-lg border px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors ${
                    servingError
                      ? 'border-red-500 dark:border-red-500'
                      : 'border-gray-200 dark:border-gray-600'
                  }`}
                  aria-describedby={servingError ? 'serving-error' : undefined}
                />
                {servingGrams && !servingError && parseFloat(servingGrams) > 0 && (
                  <ServingPreview food={selectedFood} grams={parseFloat(servingGrams)} />
                )}
              </div>
              {servingError && (
                <p id="serving-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {servingError}
                </p>
              )}
            </div>

            {addError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {addError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdding}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
              >
                {isAdding ? 'Adding…' : 'Add to log'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ServingPreview — inline calorie/macro preview for the selected serving
// ─────────────────────────────────────────────────────────────────────────────

interface ServingPreviewProps {
  food: FoodItem;
  grams: number;
}

function ServingPreview({ food, grams }: ServingPreviewProps) {
  const scale = grams / 100;
  const cal = Math.round(food.caloriesPer100g * scale);
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400">
      ≈ {cal} kcal
    </span>
  );
}
