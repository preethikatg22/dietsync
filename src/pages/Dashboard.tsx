// ─────────────────────────────────────────────────────────────────────────────
// Dashboard page — daily nutrition summary
// Requirements: 6.1–6.7
// ─────────────────────────────────────────────────────────────────────────────
//
// Subscribes to `logStore` and `authStore`. Re-renders on every log change
// without a page reload (Req 6.5). Reads the user's NutritionGoals from
// LocalStorage via `StorageRepository`. When no goals are set, shows a prompt
// to configure them (Req 6.7).

import { z } from 'zod';
import { useLogStore } from '../stores/logStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { aggregateDayLog } from '../services/NutritionCalculator.ts';
import { storageRepository } from '../repositories/StorageRepository.ts';
import { STORAGE_KEYS, type NutritionGoals } from '../types/index.ts';
import {
  CalorieProgress,
  MacroRing,
  MealBreakdown,
  NoGoalsPrompt,
  WaterTracker,
} from '../components/dashboard/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Schema for reading NutritionGoals from storage
// ─────────────────────────────────────────────────────────────────────────────

const NutritionGoalsSchema = z.object({
  calorieTarget: z.number(),
  proteinPct: z.number(),
  carbsPct: z.number(),
  fatPct: z.number(),
  isManual: z.boolean(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — load goals for the current user
// ─────────────────────────────────────────────────────────────────────────────

function loadGoals(userId: string): NutritionGoals | null {
  return storageRepository.get<NutritionGoals | null>(
    STORAGE_KEYS.GOALS(userId),
    NutritionGoalsSchema as z.ZodType<NutritionGoals | null>,
    null,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard component
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);

  // Subscribe to dayLog so the component re-renders whenever a log entry is
  // added / edited / removed without a page reload. (Req 6.5)
  const dayLog = useLogStore((s) => s.dayLog);
  const activeDate = useLogStore((s) => s.activeDate);

  // Derive daily totals from all entries (Req 6.6)
  const entries = dayLog?.entries ?? [];
  const totals = aggregateDayLog(entries);

  // Load goals from storage — null means not yet configured (Req 6.7)
  const goals = session?.userId ? loadGoals(session.userId) : null;

  const displayName = currentUser?.name ?? 'there';

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
        {!goals ? (
          <NoGoalsPrompt />
        ) : (
          <>
            {/* Calorie progress (Req 6.1, 6.4) */}
            <CalorieProgress consumed={totals.calories} target={goals.calorieTarget} />

            {/* Macro ring (Req 6.2) */}
            <MacroRing
              protein={totals.protein}
              carbs={totals.carbs}
              fat={totals.fat}
            />
          </>
        )}

        {/* Meal breakdown — always shown so the user can see their meals (Req 6.3) */}
        {dayLog && <MealBreakdown dayLog={dayLog} />}

        {/* Placeholder when no dayLog has been loaded yet */}
        {!dayLog && goals && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No food logged for this date yet.
            </p>
          </div>
        )}

        {/* Water tracker (Req 14.1, 14.2, 14.4) */}
        <WaterTracker />
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string as a human-readable label.
 * Returns "Today" for today, "Yesterday" for yesterday, otherwise the
 * locale-formatted date.
 */
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
