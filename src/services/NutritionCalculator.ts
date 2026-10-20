// ─────────────────────────────────────────────────────────────────────────────
// NutritionCalculator — Pure Functions (no side effects, no I/O)
// Requirements: 1.2, 6.6, 7.1, 7.7, 7.8, 8.4, 9.3–9.6, 12.1–12.3
// ─────────────────────────────────────────────────────────────────────────────

import {
  ActivityMultipliers,
  type ActivityLevel,
  type DailyAdherence,
  type DayLog,
  type DayTotals,
  type FoodItem,
  type Goal,
  type LogEntry,
  type ScaledNutrients,
  type Sex,
  type UserProfile,
  type WeeklyStats,
  type WeightEntry,
} from '../types/index.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute age in whole years from a YYYY-MM-DD date-of-birth string,
 * relative to the current wall-clock date.
 */
function ageFromDob(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Return the Monday of the ISO week that contains `d`.
 * Returns a new Date set to midnight UTC of that Monday.
 */
function weekMonday(d: Date): Date {
  // getDay() returns 0 = Sunday, 1 = Monday … 6 = Saturday
  const day = d.getDay(); // 0–6
  const diffToMonday = (day === 0 ? -6 : 1 - day); // days to go back to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return monday;
}

/**
 * Format a Date as a YYYY-MM-DD string in local time.
 */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add `days` calendar days to `d`, returning a new Date.
 */
function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// ── BMR ───────────────────────────────────────────────────────────────────────

/**
 * Compute Basal Metabolic Rate using the Mifflin-St Jeor formula.
 *
 * Male:   BMR = (10 × weightKg) + (6.25 × heightCm) − (5 × ageYears) + 5
 * Female: BMR = (10 × weightKg) + (6.25 × heightCm) − (5 × ageYears) − 161
 *
 * Age is derived from `dob` (YYYY-MM-DD) at call time.
 */
export function computeBMR(
  profile: Pick<UserProfile, 'sex' | 'weightKg' | 'heightCm' | 'dob'>
): number {
  const { sex, weightKg, heightCm, dob } = profile;
  const age = ageFromDob(dob);
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

// ── TDEE ──────────────────────────────────────────────────────────────────────

/**
 * Compute Total Daily Energy Expenditure.
 *
 * TDEE = BMR × activity multiplier.
 * All multipliers are ≥ 1.2, so TDEE is always ≥ BMR.
 */
export function computeTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ActivityMultipliers[activityLevel];
}

// ── Goal target ───────────────────────────────────────────────────────────────

/**
 * Compute goal-modified calorie target.
 *
 * lose: TDEE − 500 | maintain: TDEE | gain: TDEE + 500
 *
 * This guarantees lose < maintain < gain for all valid TDEE values.
 */
export function computeGoalTarget(tdee: number, goal: Goal): number {
  if (goal === 'lose') return tdee - 500;
  if (goal === 'gain') return tdee + 500;
  return tdee; // 'maintain'
}

// ── Serving-size scaling ──────────────────────────────────────────────────────

/**
 * Scale a food item's per-100 g macro values to a given serving size.
 *
 * Formula: `(per100gValue × servingGrams) / 100`
 * At servingGrams = 0 all four values are 0.
 */
export function scaleNutrients(
  food: FoodItem,
  servingGrams: number
): ScaledNutrients {
  const scale = servingGrams / 100;
  return {
    calories: food.caloriesPer100g * scale,
    protein: food.proteinPer100g * scale,
    carbs: food.carbsPer100g * scale,
    fat: food.fatPer100g * scale,
  };
}

// ── Day-log aggregation ───────────────────────────────────────────────────────

/**
 * Sum calories, protein, carbs, and fat across all LogEntry items.
 *
 * The result is the same regardless of aggregation order (commutative sum).
 */
export function aggregateDayLog(entries: LogEntry[]): DayTotals {
  return entries.reduce<DayTotals>(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// ── Remaining and progress ────────────────────────────────────────────────────

/**
 * Compute remaining calories: `target − consumed`.
 *
 * Unclamped — returns a negative number when consumption exceeds the target.
 */
export function computeRemaining(consumed: number, target: number): number {
  return target - consumed;
}

/**
 * Compute progress as a percentage: `(consumed / target) × 100`.
 *
 * Returns 0 when `target === 0` to avoid division by zero.
 * Not clamped — may exceed 100 when consumption is over target.
 */
export function computeProgressPct(consumed: number, target: number): number {
  if (target === 0) return 0;
  return (consumed / target) * 100;
}

// ── Calorie floor check ───────────────────────────────────────────────────────

/**
 * Returns `true` if the calorie amount is below the sex-specific floor:
 *   female → 1200 kcal | male → 1500 kcal
 */
export function checkCalorieFloor(calories: number, sex: Sex): boolean {
  const floor = sex === 'female' ? 1200 : 1500;
  return calories < floor;
}

// ── Weight log sort ───────────────────────────────────────────────────────────

/**
 * Return a new array of WeightEntry items sorted in ascending date order
 * (YYYY-MM-DD lexicographic sort, which equals chronological order).
 *
 * The sort is stable on duplicate dates.
 */
export function sortWeightLog(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });
}

// ── Weekly average ────────────────────────────────────────────────────────────

/**
 * Compute weekly calorie average for the Monday–Sunday week that contains
 * `weekOf`.
 *
 * - Only days with at least one log entry are included in the divisor.
 * - Days outside the Mon–Sun boundary are excluded.
 * - `averageCalories` is 0 when no days were logged that week.
 * - `targetCalories` is the first-found entry's implied target (0 if none).
 */
export function computeWeeklyAverage(
  logs: Record<string, DayLog>,
  weekOf: Date
): WeeklyStats {
  const monday = weekMonday(weekOf);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(toDateString(addDays(monday, i)));
  }

  let totalCalories = 0;
  let daysLogged = 0;

  for (const dateStr of weekDates) {
    const dayLog = logs[dateStr];
    if (dayLog && dayLog.entries.length > 0) {
      const totals = aggregateDayLog(dayLog.entries);
      totalCalories += totals.calories;
      daysLogged += 1;
    }
  }

  const averageCalories = daysLogged > 0 ? totalCalories / daysLogged : 0;

  return {
    weekOf: toDateString(monday),
    averageCalories,
    daysLogged,
    targetCalories: 0, // target is not available as a pure input; caller should overlay
  };
}

// ── Monthly adherence ─────────────────────────────────────────────────────────

/**
 * Compute per-day calorie adherence percentages for all days in the calendar
 * month that contains `month`.
 *
 * adherencePct = (consumed / calorieTarget) × 100 (unclamped, 0 when target = 0).
 * Days without a log entry still appear with adherencePct = 0.
 */
export function computeMonthlyAdherence(
  logs: Record<string, DayLog>,
  month: Date,
  calorieTarget: number
): DailyAdherence[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth(); // 0-based
  // Last day of the month: day 0 of the next month
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const result: DailyAdherence[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayLog = logs[dateStr];
    let consumed = 0;
    if (dayLog && dayLog.entries.length > 0) {
      consumed = aggregateDayLog(dayLog.entries).calories;
    }
    result.push({
      date: dateStr,
      adherencePct: computeProgressPct(consumed, calorieTarget),
    });
  }

  return result;
}

// ── Streak ────────────────────────────────────────────────────────────────────

/**
 * Count the number of consecutive calendar days ending on `today` (or
 * yesterday, if today has no log entry) on which at least one food entry
 * was logged.
 *
 * Any gap of one or more days without a log resets the streak to 0.
 */
export function computeStreak(
  logs: Record<string, DayLog>,
  today: Date
): number {
  const todayStr = toDateString(today);
  const hasTodayEntry =
    logs[todayStr] != null && logs[todayStr].entries.length > 0;

  // Start from today if logged, otherwise start from yesterday
  let cursor = hasTodayEntry ? today : addDays(today, -1);
  let streak = 0;

  // Walk backwards until we find a day with no entry
  while (true) {
    const dateStr = toDateString(cursor);
    const dayLog = logs[dateStr];
    const hasEntry = dayLog != null && dayLog.entries.length > 0;

    if (!hasEntry) break;

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}
