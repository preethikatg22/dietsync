// ─────────────────────────────────────────────────────────────────────────────
// DietSync — progressStore (Zustand)
// Requirements: 8.1-8.4, 9.1-9.8
// ─────────────────────────────────────────────────────────────────────────────
//
// Thin store that wires components to ProgressService. It owns four slices —
// `streak`, `weeklyStats`, `monthlyStats`, and `weightLog` — and keeps them
// in sync with the persisted data for the current user.
//
// The store never implements business logic itself; it delegates to
// ProgressService (streak, weekly/monthly stats, weight log CRUD) and stores
// the returned values so subscribed components re-render with fresh data.
// (Req 8.1-8.4, 9.1-9.8)

import { create } from 'zustand';
import {
  type DailyAdherence,
  type WeeklyStats,
  type WeightEntry,
} from '../types/index.ts';
import { progressService } from '../services/ProgressService.ts';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ProgressState {
  // ── Slices ──────────────────────────────────────────────────────────────────

  /**
   * Current logging streak: consecutive calendar days ending on today (or
   * yesterday) on which at least one entry was logged. (Req 9.3, 9.4, 9.6)
   */
  streak: number;

  /**
   * Weekly average calorie stats for the Mon–Sun week containing `today`.
   * `null` before the first `refresh` call. (Req 9.1, 9.5, 9.8)
   */
  weeklyStats: WeeklyStats | null;

  /**
   * Per-day calorie adherence percentages for the calendar month containing
   * `today`. Empty before the first `refresh` call. (Req 9.2)
   */
  monthlyStats: DailyAdherence[];

  /**
   * The user's weight entries, sorted ascending by date. Empty before the
   * first `refresh` call or when no entries exist. (Req 8.3, 8.4)
   */
  weightLog: WeightEntry[];

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Loads all four slices by delegating to ProgressService:
   *  - `streak`       ← `progressService.getStreak(userId, today)`
   *  - `weeklyStats`  ← `progressService.getWeeklyStats(userId, today)`
   *  - `monthlyStats` ← `progressService.getMonthlyAdherence(userId, today)`
   *  - `weightLog`    ← `progressService.getWeightLog(userId)`
   *
   * `today` defaults to `new Date()` when not supplied. (Req 9.1-9.8)
   */
  refresh: (userId: string, today?: Date) => void;

  /**
   * Adds (or overwrites) a weight entry for `date` by delegating to
   * `progressService.addWeightEntry`, then updates the `weightLog` slice
   * with the returned sorted array. (Req 8.1, 8.2)
   */
  addWeightEntry: (userId: string, date: string, weightKg: number) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useProgressStore = create<ProgressState>(() => ({
  streak: 0,
  weeklyStats: null,
  monthlyStats: [],
  weightLog: [],

  refresh: (userId, today) => {
    const date = today ?? new Date();

    const streak = progressService.getStreak(userId, date);
    const weeklyStats = progressService.getWeeklyStats(userId, date);
    const monthlyStats = progressService.getMonthlyAdherence(userId, date);
    const weightLog = progressService.getWeightLog(userId);

    useProgressStore.setState({ streak, weeklyStats, monthlyStats, weightLog });
  },

  addWeightEntry: (userId, date, weightKg) => {
    const weightLog = progressService.addWeightEntry(userId, date, weightKg);
    useProgressStore.setState({ weightLog });
  },
}));
