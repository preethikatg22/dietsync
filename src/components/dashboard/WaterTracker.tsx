// ─────────────────────────────────────────────────────────────────────────────
// WaterTracker — displays daily water intake vs target and lets the user
// increment by a configurable step.
// Requirements: 14.1, 14.2, 14.4
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore.ts';
import { waterService } from '../../services/WaterService.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — return today's date as YYYY-MM-DD (Req 14.4)
// ─────────────────────────────────────────────────────────────────────────────

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// WaterTracker component
// ─────────────────────────────────────────────────────────────────────────────

export function WaterTracker() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.userId ?? '';

  // Always uses today's date so crossing midnight always shows 0 for the new
  // day while the previous day's total is preserved in storage. (Req 14.4)
  const [today] = useState<string>(getTodayDate);

  // Water settings — step size (Req 14.1) and target (Req 14.2)
  const [stepMl, setStepMl] = useState<number>(250);
  const [targetMl, setTargetMl] = useState<number>(2000);

  // Today's accumulated total (Req 14.2, 14.5)
  const [consumedMl, setConsumedMl] = useState<number>(0);

  // Load settings and current day's total on mount / when userId changes
  useEffect(() => {
    if (!userId) return;
    const settings = waterService.getSettings(userId);
    setStepMl(settings.waterStepMl);
    setTargetMl(settings.waterTargetMl);
    setConsumedMl(waterService.getWater(userId, today));
  }, [userId, today]);

  // Increment handler — adds one step and updates state from the returned
  // total so the component always reflects the source-of-truth value. (Req 14.5)
  const handleAdd = useCallback(() => {
    if (!userId) return;
    const newTotal = waterService.addWater(userId, today, stepMl);
    setConsumedMl(newTotal);
  }, [userId, today, stepMl]);

  // Progress percentage (unclamped for aria, clamped for the visual bar)
  const progressPct = targetMl > 0 ? (consumedMl / targetMl) * 100 : 0;
  const barWidth = Math.min(progressPct, 100);
  const isOver = consumedMl >= targetMl;

  // Number of full "cups" to show as visual indicators (max 8 bubbles)
  const totalBubbles = 8;
  const filledBubbles = Math.min(
    Math.round((consumedMl / targetMl) * totalBubbles),
    totalBubbles,
  );

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Water Intake
        </h2>
        {isOver && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
            Goal reached 🎉
          </span>
        )}
      </div>

      {/* Consumed vs Target (Req 14.2) */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            {consumedMl}
          </span>
          <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">ml consumed</span>
        </div>
        <div className="text-right">
          <span className="text-sm text-gray-500 dark:text-gray-400">of </span>
          <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {targetMl}
          </span>
          <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">ml</span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-4"
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(progressPct)}% of daily water target consumed`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOver ? 'bg-emerald-500' : 'bg-sky-500'
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Bubble indicators — one bubble per 1/8 of the target */}
      <div
        className="flex items-center gap-1.5 mb-4"
        aria-hidden="true"
      >
        {Array.from({ length: totalBubbles }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-2 rounded-full transition-colors duration-200 ${
              i < filledBubbles
                ? 'bg-sky-400 dark:bg-sky-500'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>

      {/* Remaining or over-target label */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {isOver ? 'Target exceeded' : 'Remaining'}
        </span>
        <span
          className={`text-sm font-semibold ${
            isOver
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-sky-600 dark:text-sky-400'
          }`}
        >
          {isOver
            ? `+${consumedMl - targetMl} ml`
            : `${targetMl - consumedMl} ml`}
        </span>
      </div>

      {/* Add water button — step size configurable per Req 14.1 */}
      <button
        type="button"
        onClick={handleAdd}
        disabled={!userId}
        className="w-full rounded-xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        aria-label={`Add ${stepMl} ml of water`}
      >
        + {stepMl} ml
      </button>
    </div>
  );
}
