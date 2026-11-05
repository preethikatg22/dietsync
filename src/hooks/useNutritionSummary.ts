// ─────────────────────────────────────────────────────────────────────────────
// useNutritionSummary — custom React hook
//
// Encapsulates all Dashboard nutrition logic in one place:
//  - Loads today's DayLog from logStore
//  - Loads NutritionGoals from storage
//  - Computes daily totals (calories, protein, carbs, fat)
//  - Computes remaining calories and progress percentage
//  - Exposes the active date and current user
//
// Usage:
//   const { totals, goals, remaining, progressPct, hasGoals } = useNutritionSummary();
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { useAuthStore } from '../stores/authStore.ts';
import { useLogStore } from '../stores/logStore.ts';
import {
  aggregateDayLog,
  computeRemaining,
  computeProgressPct,
} from '../services/NutritionCalculator.ts';
import { storageRepository } from '../repositories/StorageRepository.ts';
import { STORAGE_KEYS, type NutritionGoals } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const NutritionGoalsSchema = z.object({
  calorieTarget: z.number(),
  proteinPct: z.number(),
  carbsPct: z.number(),
  fatPct: z.number(),
  isManual: z.boolean(),
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface NutritionSummary {
  /** Aggregated totals for the active date */
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  /** User's nutrition goals, or null if not configured */
  goals: NutritionGoals | null;
  /** true when goals are configured */
  hasGoals: boolean;
  /** Remaining calories (negative when over target) */
  remaining: number;
  /** Progress as a percentage (can exceed 100) */
  progressPct: number;
  /** true when the user has consumed more than their target */
  isOverTarget: boolean;
  /** Currently active date (YYYY-MM-DD) */
  activeDate: string;
  /** Current user's display name */
  displayName: string;
  /** Current user's goal (lose / maintain / gain) */
  goal: string | null;
  /** Current authenticated user ID */
  userId: string | null;
}

export function useNutritionSummary(): NutritionSummary {
  const session = useAuthStore((s) => s.session);
  const currentUser = useAuthStore((s) => s.currentUser);
  const dayLog = useLogStore((s) => s.dayLog);
  const activeDate = useLogStore((s) => s.activeDate);

  const userId = session?.userId ?? null;

  // Load goals from storage
  const goals = userId
    ? storageRepository.get<NutritionGoals | null>(
        STORAGE_KEYS.GOALS(userId),
        NutritionGoalsSchema as z.ZodType<NutritionGoals | null>,
        null,
      )
    : null;

  // Aggregate today's entries
  const entries = dayLog?.entries ?? [];
  const totals = aggregateDayLog(entries);

  // Derived values
  const calorieTarget = goals?.calorieTarget ?? 0;
  const remaining = computeRemaining(totals.calories, calorieTarget);
  const progressPct = computeProgressPct(totals.calories, calorieTarget);
  const isOverTarget = remaining < 0;

  return {
    totals,
    goals,
    hasGoals: goals !== null,
    remaining,
    progressPct,
    isOverTarget,
    activeDate,
    displayName: currentUser?.name ?? 'there',
    goal: currentUser?.goal ?? null,
    userId,
  };
}
