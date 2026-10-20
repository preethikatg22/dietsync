// ─────────────────────────────────────────────────────────────────────────────
// GoalsEditor — edit calorie target and macro-percentage split
// Requirements: 7.1–7.8
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { z } from 'zod';
import {
  STORAGE_KEYS,
  type NutritionGoals,
  type Sex,
} from '../../types/index.ts';
import { checkCalorieFloor } from '../../services/NutritionCalculator.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';

// ── Zod schema ────────────────────────────────────────────────────────────────

const NutritionGoalsSchema = z.object({
  calorieTarget: z.number(),
  proteinPct: z.number(),
  carbsPct: z.number(),
  fatPct: z.number(),
  isManual: z.boolean(),
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoalsEditorProps {
  userId: string;
  sex: Sex;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoalsEditor({ userId, sex }: GoalsEditorProps) {
  const [calorieTarget, setCalorieTarget] = useState('');
  const [proteinPct, setProteinPct] = useState('');
  const [carbsPct, setCarbsPct] = useState('');
  const [fatPct, setFatPct] = useState('');

  const [macroError, setMacroError] = useState('');
  const [floorWarning, setFloorWarning] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load existing goals on mount (Req 7.4–7.7)
  useEffect(() => {
    const goals = storageRepository.get<NutritionGoals | null>(
      STORAGE_KEYS.GOALS(userId),
      NutritionGoalsSchema as z.ZodType<NutritionGoals | null>,
      null,
    );
    if (goals) {
      setCalorieTarget(String(Math.round(goals.calorieTarget)));
      setProteinPct(String(goals.proteinPct));
      setCarbsPct(String(goals.carbsPct));
      setFatPct(String(goals.fatPct));
    }
  }, [userId]);

  function handleSave() {
    setMacroError('');
    setFloorWarning('');
    setSaveSuccess(false);

    const cal = Number(calorieTarget);
    const protein = Number(proteinPct);
    const carbs = Number(carbsPct);
    const fat = Number(fatPct);

    // Macro percentages must sum to 100 (Req 7.3)
    const sum = protein + carbs + fat;
    if (Math.abs(sum - 100) > 0.001) {
      setMacroError('Macro percentages must sum to 100.');
      return;
    }

    // Calorie floor warning — non-blocking; user can still save (Req 7.4, 7.5)
    if (checkCalorieFloor(cal, sex)) {
      const floor = sex === 'female' ? 1200 : 1500;
      setFloorWarning(
        `${cal} kcal is below the recommended minimum of ${floor} kcal for ${sex === 'female' ? 'women' : 'men'}. This is below the recommended minimum. Are you sure?`,
      );
      // Warning is non-blocking — proceed to save below
    }

    const goals: NutritionGoals = {
      calorieTarget: cal,
      proteinPct: protein,
      carbsPct: carbs,
      fatPct: fat,
      isManual: true,
    };

    storageRepository.set(STORAGE_KEYS.GOALS(userId), goals);
    setSaveSuccess(true);
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Nutrition Goals
      </h2>

      {/* Calorie target (Req 7.8 — show target kcal) */}
      <div>
        <label
          htmlFor="calorie-target"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Daily calorie target (kcal)
        </label>
        <input
          id="calorie-target"
          type="number"
          min="0"
          step="1"
          value={calorieTarget}
          onChange={(e) => setCalorieTarget(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Daily calorie target in kilocalories"
        />
        {/* Floor warning — non-blocking (Req 7.4, 7.5) */}
        {floorWarning && (
          <p
            role="alert"
            className="mt-1 text-sm text-amber-600 dark:text-amber-400"
          >
            {floorWarning}
          </p>
        )}
      </div>

      {/* Macro % split (Req 7.2, 7.3) */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Macro split (must sum to 100%)
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="protein-pct"
              className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
            >
              Protein %
            </label>
            <input
              id="protein-pct"
              type="number"
              min="0"
              max="100"
              step="1"
              value={proteinPct}
              onChange={(e) => setProteinPct(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Protein percentage"
            />
          </div>
          <div>
            <label
              htmlFor="carbs-pct"
              className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
            >
              Carbs %
            </label>
            <input
              id="carbs-pct"
              type="number"
              min="0"
              max="100"
              step="1"
              value={carbsPct}
              onChange={(e) => setCarbsPct(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Carbohydrates percentage"
            />
          </div>
          <div>
            <label
              htmlFor="fat-pct"
              className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
            >
              Fat %
            </label>
            <input
              id="fat-pct"
              type="number"
              min="0"
              max="100"
              step="1"
              value={fatPct}
              onChange={(e) => setFatPct(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Fat percentage"
            />
          </div>
        </div>

        {/* Macro sum error (Req 7.3) */}
        {macroError && (
          <p
            role="alert"
            className="mt-2 text-sm text-red-600 dark:text-red-400"
          >
            {macroError}
          </p>
        )}
      </fieldset>

      {/* Success message */}
      {saveSuccess && (
        <p
          role="status"
          className="text-sm text-emerald-600 dark:text-emerald-400"
        >
          Goals saved successfully.
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
      >
        Save goals
      </button>
    </div>
  );
}
