// ─────────────────────────────────────────────────────────────────────────────
// DateNavigator — previous/next day navigation with a date label
// Requirements: 5.7
// ─────────────────────────────────────────────────────────────────────────────


interface DateNavigatorProps {
  /** Currently displayed date as YYYY-MM-DD */
  activeDate: string;
  /** Called when the user navigates to a different date */
  onChange: (date: string) => void;
}

/**
 * Renders a date heading with left (previous day) and right (next day)
 * arrow buttons. Future dates beyond today are disabled. (Req 5.7)
 */
export function DateNavigator({ activeDate, onChange }: DateNavigatorProps) {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = activeDate === today;

  function shiftDay(delta: number) {
    // Parse date in local time to avoid UTC offset issues
    const [year, month, day] = activeDate.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + delta);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(next);
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => shiftDay(-1)}
        aria-label="Previous day"
        className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
      >
        {/* Left chevron */}
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
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-0 text-center">
        {formatDateLabel(activeDate)}
      </h2>

      <button
        type="button"
        onClick={() => shiftDay(1)}
        disabled={isToday}
        aria-label="Next day"
        className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
      >
        {/* Right chevron */}
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
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';

  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
