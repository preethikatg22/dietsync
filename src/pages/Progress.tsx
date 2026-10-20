// ─────────────────────────────────────────────────────────────────────────────
// Progress page — weekly/monthly adherence, streak badge, weight trend
// Requirements: 8.3, 9.1–9.8, 13.1–13.4
// ─────────────────────────────────────────────────────────────────────────────
//
// Subscribes to `progressStore` and `authStore`. Calls
// `progressStore.refresh(userId)` on mount and whenever userId changes so that
// all progress slices stay fresh.
//
// An Export button opens the ExportModal, which lets the user toggle field
// visibility before downloading the progress summary card as a PNG.
// (Req 13.1-13.4)

import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore.ts';
import { useProgressStore } from '../stores/progressStore.ts';
import {
  StreakBadge,
  WeeklyChart,
  MonthlyChart,
  WeightChart,
  WeightEntryForm,
  ExportModal,
} from '../components/progress/index.ts';
import { exportService, type ExportSummaryData } from '../services/ExportService.ts';

export function Progress() {
  const session = useAuthStore((s) => s.session);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  const streak = useProgressStore((s) => s.streak);
  const weeklyStats = useProgressStore((s) => s.weeklyStats);
  const monthlyStats = useProgressStore((s) => s.monthlyStats);
  const weightLog = useProgressStore((s) => s.weightLog);
  const refresh = useProgressStore((s) => s.refresh);
  const addWeightEntry = useProgressStore((s) => s.addWeightEntry);

  const userId = session?.userId;

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSummary, setExportSummary] = useState<ExportSummaryData | null>(null);

  // Refresh all progress data on mount and when userId changes
  useEffect(() => {
    if (userId) {
      refresh(userId);
    }
  }, [userId, refresh]);

  const displayName = currentUser?.name ?? 'there';

  function handleWeightSubmit(date: string, weightKg: number) {
    if (!userId) return;
    addWeightEntry(userId, date, weightKg);
  }

  function handleExportClick() {
    if (!userId) return;
    // Assemble summary data from storage via the convenience helper (Req 13.1)
    const summary = exportService.buildSummaryData(userId);
    setExportSummary(summary);
    setShowExportModal(true);
  }

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
        {/* Page heading */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Progress</h1>
          <div className="flex items-center gap-3">
            {/* Export button (Req 13.1-13.4) */}
            <button
              type="button"
              onClick={handleExportClick}
              disabled={!userId}
              className="flex items-center gap-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              aria-label="Export progress summary card"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              Export
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Overview
            </span>
          </div>
        </div>

        {/* Streak badge (Req 9.3, 9.4, 9.6) */}
        <StreakBadge streak={streak} />

        {/* Weekly adherence bar chart (Req 9.1, 9.5, 9.8) */}
        <WeeklyChart weeklyStats={weeklyStats} monthlyStats={monthlyStats} />

        {/* Monthly adherence area chart (Req 9.2) */}
        <MonthlyChart monthlyStats={monthlyStats} />

        {/* Weight entry form (Req 8.1, 8.2) */}
        <WeightEntryForm onSubmit={handleWeightSubmit} />

        {/* Weight trend line chart (Req 8.3, 9.7) */}
        <WeightChart weightLog={weightLog} />
      </div>

      {/* Export modal (Req 13.1-13.4) */}
      {showExportModal && exportSummary && (
        <ExportModal
          summaryData={exportSummary}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </main>
  );
}
