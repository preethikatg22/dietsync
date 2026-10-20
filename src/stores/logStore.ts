// ─────────────────────────────────────────────────────────────────────────────
// DietSync — logStore (Zustand)
// Requirements: 5.1–5.8
// ─────────────────────────────────────────────────────────────────────────────
//
// Thin store that wires components to FoodLogService. It owns two slices —
// `activeDate` and `dayLog` — and keeps `dayLog` in sync with the persisted
// log for `activeDate`. The store never implements business logic itself; it
// delegates to FoodLogService (add/edit/remove/getDayLog) and stores the
// returned DayLog so subscribed components re-render with fresh totals.
// (Req 5.1–5.8)
//
// `dayLog` always reflects the log for `activeDate`. After every mutation the
// store reloads `dayLog` from the service, so dashboards pick up recalculated
// totals without a page reload. (Req 5.4, 5.5, 6.5)
//
// `setDate` reads the current user from the auth store so it can reload the
// log for the newly selected date without an explicit `userId` argument.
// (Req 5.7)

import { create } from 'zustand';
import { type DayLog, type LogEntry, type MealSection } from '../types/index.ts';
import { foodLogService } from '../services/FoodLogService.ts';
import { useAuthStore } from './authStore.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's date as a `YYYY-MM-DD` string — the default `activeDate`. (Req 5.7) */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface LogState {
  // ── Slices ──────────────────────────────────────────────────────────────────
  /** The date whose log is currently displayed, as `YYYY-MM-DD`. (Req 5.7) */
  activeDate: string;
  /** The DayLog for `activeDate`, or `null` when no user is loaded. */
  dayLog: DayLog | null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Adds a food entry to `activeDate`'s log in the given meal section.
   * Delegates to `FoodLogService.addEntry` (which resolves the food, scales
   * nutrients, and persists) and then reloads `dayLog`. Returns the new
   * entry. (Req 5.1, 5.2, 5.3, 5.6)
   */
  addEntry: (
    userId: string,
    foodId: string,
    grams: number,
    section: MealSection,
  ) => LogEntry;

  /**
   * Edits an existing entry's serving size on `date`, recalculating its
   * nutrient values, then reloads `dayLog`. Returns the updated entry.
   * (Req 5.4)
   */
  editEntry: (
    userId: string,
    date: string,
    entryId: string,
    grams: number,
  ) => LogEntry;

  /**
   * Removes an entry from `date`'s log, then reloads `dayLog`. (Req 5.5)
   */
  removeEntry: (userId: string, date: string, entryId: string) => void;

  /**
   * Sets `activeDate` and reloads `dayLog` for that date. (Req 5.7)
   */
  setDate: (date: string) => void;

  /**
   * Loads the DayLog for `userId`/`date` from the service and updates the
   * `dayLog` slice. (Req 5.6)
   */
  loadDayLog: (userId: string, date: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useLogStore = create<LogState>((set, get) => ({
  activeDate: todayDate(),
  dayLog: null,

  addEntry: (userId, foodId, grams, section) => {
    // addEntry operates on the active date — the entry's macros are scaled
    // and persisted by FoodLogService, then the slice is refreshed.
    const date = get().activeDate;
    const entry = foodLogService.addEntry(userId, date, foodId, grams, section);
    set({ dayLog: foodLogService.getDayLog(userId, date) });
    return entry;
  },

  editEntry: (userId, date, entryId, grams) => {
    const entry = foodLogService.editEntry(userId, date, entryId, grams);
    // dayLog represents activeDate; reload it so totals recompute.
    set({ dayLog: foodLogService.getDayLog(userId, get().activeDate) });
    return entry;
  },

  removeEntry: (userId, date, entryId) => {
    foodLogService.removeEntry(userId, date, entryId);
    set({ dayLog: foodLogService.getDayLog(userId, get().activeDate) });
  },

  setDate: (date) => {
    set({ activeDate: date });
    // Reload the log for the new date. The active user id comes from the
    // auth store so the caller only needs to pass the date.
    const userId = useAuthStore.getState().session?.userId;
    if (userId) {
      get().loadDayLog(userId, date);
    } else {
      // No authenticated user — nothing to load.
      set({ dayLog: null });
    }
  },

  loadDayLog: (userId, date) => {
    set({ dayLog: foodLogService.getDayLog(userId, date) });
  },
}));
