// ─────────────────────────────────────────────────────────────────────────────
// CalorieProgress — displays total calories consumed vs target with a
// progress bar and remaining calories indicator.
// Requirements: 6.1, 6.4
// ─────────────────────────────────────────────────────────────────────────────

import { computeProgressPct, computeRemaining } from '../../services/NutritionCalculator.ts';

interface CalorieProgressProps {
  consumed: number;
  target: number;
}

export function CalorieProgress({ consumed, target }: CalorieProgressProps) {
  const remaining = computeRemaining(consumed, target);
  const progressPct = computeProgressPct(consumed, target);
  // Clamp the visual bar width to 100% — the actual value can exceed 100
  const barWidth = Math.min(progressPct, 100);
  const isOver = remaining < 0;

  return (
    <div data-testid="calorie-progress" className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        Today's Calories
      </h2>

      {/* Consumed / Target */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            {Math.round(consumed)}
          </span>
          <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">kcal consumed</span>
        </div>
        <div className="text-right">
          <span className="text-sm text-gray-500 dark:text-gray-400">of </span>
          <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {Math.round(target)}
          </span>
          <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">kcal</span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(progressPct)}% of daily calorie target consumed`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOver
              ? 'bg-red-500'
              : progressPct >= 90
                ? 'bg-amber-500'
                : 'bg-emerald-500'
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Remaining */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {isOver ? 'Over target by' : 'Remaining'}
        </span>
        <span
          className={`text-sm font-semibold ${
            isOver ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {isOver ? `+${Math.round(Math.abs(remaining))} kcal` : `${Math.round(remaining)} kcal`}
        </span>
      </div>
    </div>
  );
}
