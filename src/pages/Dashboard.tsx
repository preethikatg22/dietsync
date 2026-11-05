// ─────────────────────────────────────────────────────────────────────────────
// Dashboard page — daily nutrition summary
// Requirements: 6.1–6.7
// ─────────────────────────────────────────────────────────────────────────────
//
// Subscribes to `logStore` and `authStore` via the `useNutritionSummary` hook.
// Re-renders on every log change without a page reload (Req 6.5).

import { useAuthStore } from '../stores/authStore.ts';
import { useLogStore } from '../stores/logStore.ts';
import { useNutritionSummary } from '../hooks/useNutritionSummary.ts';
import {
  CalorieProgress,
  MacroRing,
  MealBreakdown,
  NoGoalsPrompt,
  WaterTracker,
} from '../components/dashboard/index.ts';
import { NutritionCoach } from '../components/dashboard/NutritionCoach.tsx';
import { CloudSync } from '../components/dashboard/CloudSync.tsx';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard component
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const logout = useAuthStore((s) => s.logout);
  const session = useAuthStore((s) => s.session);
  const dayLog = useLogStore((s) => s.dayLog);

  // All nutrition logic in one hook
  const {
    totals,
    goals,
    hasGoals,
    activeDate,
    displayName,
    userId,
  } = useNutritionSummary();

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top nav */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">DietSync</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
            Hi, {displayName}
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Date heading */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {formatDate(activeDate)}
          </h1>
          <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            Dashboard
          </span>
        </div>

        {/* No goals configured — prompt (Req 6.7) */}
        {!hasGoals ? (
          <NoGoalsPrompt />
        ) : (
          <>
            {/* Calorie progress (Req 6.1, 6.4) */}
            <CalorieProgress consumed={totals.calories} target={goals!.calorieTarget} />

            {/* Macro ring (Req 6.2) */}
            <MacroRing
              protein={totals.protein}
              carbs={totals.carbs}
              fat={totals.fat}
            />
          </>
        )}

        {/* Meal breakdown (Req 6.3) */}
        {dayLog && <MealBreakdown dayLog={dayLog} />}

        {/* Placeholder when no dayLog loaded yet */}
        {!dayLog && hasGoals && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No food logged for this date yet.
            </p>
          </div>
        )}

        {/* Water tracker (Req 14.1, 14.2, 14.4) */}
        <WaterTracker />

        {/* Cloud Sync — save/load data to S3 */}
        {userId && (
          <CloudSync
            userId={userId}
            onDataRestored={() => {
              useLogStore.getState().loadDayLog(userId, activeDate);
            }}
          />
        )}
      </div>

      {/* AI Nutrition Coach — Bedrock Nova Lite */}
      {session?.userId && (
        <NutritionCoach
          context={{
            userName: displayName,
            calorieTarget: goals?.calorieTarget,
            caloriesConsumed: totals.calories,
            proteinConsumed: totals.protein,
            carbsConsumed: totals.carbs,
            fatConsumed: totals.fat,
            goal: goals ? (hasGoals ? 'configured' : undefined) : undefined,
          }}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
