// ─────────────────────────────────────────────────────────────────────────────
// NoGoalsPrompt — shown when the user has not configured nutrition goals yet.
// Requirements: 6.7
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';

export function NoGoalsPrompt() {
  return (
    <div
      className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-6 text-center shadow-sm"
      role="alert"
    >
      <div className="text-3xl mb-3" aria-hidden="true">🎯</div>
      <h2 className="text-base font-semibold text-amber-800 dark:text-amber-300 mb-2">
        No nutrition goals set
      </h2>
      <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">
        Configure your calorie and macro targets to see your daily progress here.
      </p>
      <Link
        to="/settings"
        className="inline-flex items-center rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
      >
        Set up goals
      </Link>
    </div>
  );
}
