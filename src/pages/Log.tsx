// ─────────────────────────────────────────────────────────────────────────────
// Log page — daily food log with date navigation and meal sections
// Requirements: 5.1–5.8, 16.1–16.4
// ─────────────────────────────────────────────────────────────────────────────
//
// Subscribes to `logStore` and `authStore`. On mount (and on date change) it
// loads the DayLog for the active date. Users can navigate to previous days,
// add food entries via a search modal, edit serving sizes, and remove entries.
// All mutations delegate to `logStore` which calls `FoodLogService` and
// persists to `dietsync:[userId]:logs`. (Req 5.6)
//
// Copy Yesterday feature (Req 16.1-16.4):
// - "Copy Yesterday" button invokes foodLogService.copyYesterday.
// - On "success": reloads the day log and shows a brief success message.
// - On "no_previous_log": shows an informational message.
// - On "needs_confirmation": shows a modal to choose Append or Replace.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogStore } from '../stores/logStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { aggregateDayLog } from '../services/NutritionCalculator.ts';
import { foodLogService } from '../services/FoodLogService.ts';
import type { LogEntry, MealSection as MealSectionType } from '../types/index.ts';
import {
  DateNavigator,
  MealSection,
  FoodSearchModal,
  EditEntryModal,
} from '../components/food-log/index.ts';

// Ordered list of meal sections per Req 5.1
const MEAL_SECTIONS: MealSectionType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

// ─────────────────────────────────────────────────────────────────────────────
// CopyYesterdayConfirmModal — shown when today already has entries (Req 16.4)
// ─────────────────────────────────────────────────────────────────────────────

interface CopyYesterdayConfirmModalProps {
  message: string;
  onAppend: () => void;
  onReplace: () => void;
  onDismiss: () => void;
}

function CopyYesterdayConfirmModal({
  message,
  onAppend,
  onReplace,
  onDismiss,
}: CopyYesterdayConfirmModalProps) {
  // Trap focus within the modal when open
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-xl p-6 space-y-4">
        <h2
          id="copy-confirm-title"
          className="text-base font-semibold text-gray-900 dark:text-gray-100"
        >
          Today already has entries
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={firstButtonRef}
            type="button"
            onClick={onAppend}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
          >
            Append
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Log component
// ─────────────────────────────────────────────────────────────────────────────

export function Log() {
  const navigate = useNavigate();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = useAuthStore((s) => s.session);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  // ── Log store ─────────────────────────────────────────────────────────────
  const activeDate = useLogStore((s) => s.activeDate);
  const dayLog = useLogStore((s) => s.dayLog);
  const setDate = useLogStore((s) => s.setDate);
  const loadDayLog = useLogStore((s) => s.loadDayLog);
  const removeEntry = useLogStore((s) => s.removeEntry);

  // ── Modal state ───────────────────────────────────────────────────────────
  /** When non-null, the FoodSearchModal is shown for this meal section */
  const [addingToSection, setAddingToSection] = useState<MealSectionType | null>(null);
  /** When non-null, the EditEntryModal is shown for this entry */
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);

  // ── Copy Yesterday state (Req 16.1–16.4) ──────────────────────────────────
  /** Whether the copy-yesterday operation is in-flight */
  const [isCopying, setIsCopying] = useState(false);
  /**
   * When non-null, the confirmation modal is open with this message.
   * Stores the message from the `needs_confirmation` response.
   */
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  /**
   * Transient feedback message shown below the date navigator.
   * null = hidden; object = shown with type ("success" | "info")
   */
  const [copyFeedback, setCopyFeedback] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);
  /** Timer ref for auto-dismissing the feedback message */
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load log on mount and date change ─────────────────────────────────────
  useEffect(() => {
    if (session?.userId) {
      loadDayLog(session.userId, activeDate);
    }
  }, [session?.userId, activeDate, loadDayLog]);

  // ── Redirect to login if no session ──────────────────────────────────────
  useEffect(() => {
    if (!session) {
      navigate('/login', { replace: true });
    }
  }, [session, navigate]);

  // ── Clean up feedback timer on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  if (!session) return null;

  const userId = session.userId;
  const displayName = currentUser?.name ?? 'there';

  // Derive all entries and totals for this day
  const entries = dayLog?.entries ?? [];
  const totals = aggregateDayLog(entries);

  // Filter entries per section
  function sectionEntries(section: MealSectionType): LogEntry[] {
    return entries.filter((e) => e.mealSection === section);
  }

  function handleDateChange(date: string) {
    setDate(date);
  }

  function handleRemoveEntry(entryId: string) {
    removeEntry(userId, activeDate, entryId);
  }

  function handleCloseSearchModal() {
    setAddingToSection(null);
  }

  function handleCloseEditModal() {
    setEditingEntry(null);
  }

  // ── Copy Yesterday handlers (Req 16.1–16.4) ───────────────────────────────

  /**
   * Show a transient feedback banner that auto-dismisses after 4 seconds.
   */
  function showFeedback(type: 'success' | 'info', text: string) {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setCopyFeedback({ type, text });
    feedbackTimerRef.current = setTimeout(() => setCopyFeedback(null), 4000);
  }

  /**
   * Invoke copyYesterday with an optional mode and handle all result states.
   * (Req 16.1–16.4)
   */
  async function handleCopyYesterday(mode?: 'append' | 'replace') {
    setIsCopying(true);
    try {
      const result = foodLogService.copyYesterday(userId, activeDate, mode);

      if (result.status === 'success') {
        // Req 16.1/16.2: reload the log and show success feedback
        loadDayLog(userId, activeDate);
        setConfirmMsg(null);
        showFeedback(
          'success',
          `Copied ${result.copiedCount} entr${result.copiedCount === 1 ? 'y' : 'ies'} from yesterday.`,
        );
      } else if (result.status === 'no_previous_log') {
        // Req 16.3: informational — no empty log created
        setConfirmMsg(null);
        showFeedback('info', result.message);
      } else {
        // result.status === 'needs_confirmation' (Req 16.4)
        setConfirmMsg(result.message);
      }
    } finally {
      setIsCopying(false);
    }
  }

  function handleConfirmAppend() {
    void handleCopyYesterday('append');
  }

  function handleConfirmReplace() {
    void handleCopyYesterday('replace');
  }

  function handleDismissConfirm() {
    setConfirmMsg(null);
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
            onClick={() => navigate('/dashboard')}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            Dashboard
          </button>
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
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-4">
        {/* Date navigator (Req 5.7) */}
        <DateNavigator activeDate={activeDate} onChange={handleDateChange} />

        {/* Copy Yesterday button (Req 16.1–16.4) */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleCopyYesterday()}
            disabled={isCopying}
            aria-label="Copy food entries from yesterday into today's log"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
          >
            {/* clipboard icon */}
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <rect x="9" y="2" width="6" height="4" rx="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
            {isCopying ? 'Copying…' : 'Copy Yesterday'}
          </button>
        </div>

        {/* Copy Yesterday feedback banner (Req 16.1–16.3) */}
        {copyFeedback && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-2 ${
              copyFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                : 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200'
            }`}
          >
            <span>{copyFeedback.text}</span>
            <button
              type="button"
              onClick={() => setCopyFeedback(null)}
              aria-label="Dismiss message"
              className="shrink-0 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current transition-colors"
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Daily summary strip */}
        {entries.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3 flex items-center justify-between gap-2">
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Calories</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {Math.round(totals.calories)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Protein</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {totals.protein.toFixed(1)}g
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Carbs</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {totals.carbs.toFixed(1)}g
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Fat</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {totals.fat.toFixed(1)}g
              </p>
            </div>
          </div>
        )}

        {/* Meal sections (Req 5.1) */}
        {MEAL_SECTIONS.map((section) => (
          <MealSection
            key={section}
            section={section}
            entries={sectionEntries(section)}
            onAddFood={setAddingToSection}
            onEditEntry={setEditingEntry}
            onRemoveEntry={handleRemoveEntry}
          />
        ))}
      </div>

      {/* Food search modal (Req 5.2, 5.3, 5.6) */}
      {addingToSection && (
        <FoodSearchModal
          targetSection={addingToSection}
          userId={userId}
          onClose={handleCloseSearchModal}
        />
      )}

      {/* Edit entry modal (Req 5.4) */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          date={activeDate}
          userId={userId}
          onClose={handleCloseEditModal}
        />
      )}

      {/* Copy Yesterday confirmation modal (Req 16.4) */}
      {confirmMsg && (
        <CopyYesterdayConfirmModal
          message={confirmMsg}
          onAppend={handleConfirmAppend}
          onReplace={handleConfirmReplace}
          onDismiss={handleDismissConfirm}
        />
      )}
    </main>
  );
}
