// ─────────────────────────────────────────────────────────────────────────────
// StreakBadge — displays the user's current consecutive-day logging streak.
// Requirements: 9.3, 9.4, 9.6
// ─────────────────────────────────────────────────────────────────────────────

interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  const hasStreak = streak > 0;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm flex items-center gap-4">
      <div
        className={`text-4xl ${hasStreak ? 'animate-pulse' : 'grayscale opacity-50'}`}
        aria-hidden="true"
      >
        🔥
      </div>
      <div
        role="status"
        aria-label={hasStreak ? `${streak}-day streak` : 'No streak yet'}
      >
        {hasStreak ? (
          <>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {streak}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {streak === 1 ? 'day streak' : 'day streak'}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-gray-400 dark:text-gray-500">
              No streak yet
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Log food today to start one!
            </p>
          </>
        )}
      </div>
    </div>
  );
}
