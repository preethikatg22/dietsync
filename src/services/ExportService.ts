// ─────────────────────────────────────────────────────────────────────────────
// DietSync — ExportService (Stretch S1 — Progress Export Card)
// Requirements: 13.1-13.4
// ─────────────────────────────────────────────────────────────────────────────
//
// Renders a shareable progress summary card onto an HTML Canvas (at least
// 600×400 px) and exports it as a PNG download. The user can toggle the
// visibility of individual fields (name, current weight, calorie stats, and
// streak); all fields default to visible.
//
// Export strategy with graceful fallback (Req 13.4, design "Canvas Export
// Errors"):
//   1. Primary  — canvas.toBlob   (blob → object URL → download)
//   2. Fallback — canvas.toDataURL (data URL → download)
//   3. If both are unavailable, a user-facing error is returned. No crash.
//
// The rendering and export core are decoupled from storage: they accept a
// plain `ExportSummaryData` object, which keeps them unit-testable. A
// convenience `buildSummaryData` helper assembles that object from
// persisted data using `StorageRepository` and the pure
// `NutritionCalculator` functions.

import { z } from 'zod';
import {
  STORAGE_KEYS,
  type DayLog,
  type NutritionGoals,
  type WeightEntry,
} from '../types/index';
import { storageRepository } from '../repositories/StorageRepository';
import {
  aggregateDayLog,
  computeProgressPct,
  computeStreak,
  sortWeightLog,
} from './NutritionCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-field visibility configuration for the export card. Every field
 * defaults to visible. (Req 13.2)
 */
export interface ExportFieldVisibility {
  showName: boolean;
  showWeight: boolean;
  showCalorieStats: boolean;
  showStreak: boolean;
}

/**
 * The progress summary data rendered onto the card. Callers may assemble
 * this themselves or use {@link ExportService.buildSummaryData}.
 */
export interface ExportSummaryData {
  name: string;
  currentWeightKg: number | null;
  consumedCalories: number;
  calorieTarget: number;
  streak: number;
}

/**
 * Outcome of an export attempt. `success` is a discriminated flag so
 * callers can narrow without further checks.
 */
export type ExportResult =
  | {
      success: true;
      method: 'toBlob' | 'toDataURL';
      width: number;
      height: number;
    }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum card dimensions (Req 13.1). The card is rendered at this size. */
const EXPORT_CARD_WIDTH = 600;
const EXPORT_CARD_HEIGHT = 400;

/** Default download filename for the exported PNG. */
const DEFAULT_EXPORT_FILENAME = 'dietsync-progress.png';

/**
 * All fields visible by default. Callers pass a `Partial<ExportFieldVisibility>`
 * to override individual toggles. (Req 13.2)
 */
export const DEFAULT_EXPORT_FIELD_VISIBILITY: ExportFieldVisibility = {
  showName: true,
  showWeight: true,
  showCalorieStats: true,
  showStreak: true,
};

/** Card colour palette (Tailwind-inspired). */
const COLORS = {
  background: '#ffffff',
  headerBg: '#10b981',
  headerText: '#ffffff',
  label: '#6b7280',
  value: '#111827',
  divider: '#e5e7eb',
  footer: '#9ca3af',
};

// ---------------------------------------------------------------------------
// Zod schemas (used only by buildSummaryData)
// ---------------------------------------------------------------------------
//
// Mirrors of the shapes persisted by other services. A validation failure
// falls back to a safe default and is logged by `StorageRepository` — never
// thrown. (Req 11.1, 11.2)

const UserProfileSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  dob: z.string(),
  sex: z.enum(['male', 'female']),
  heightCm: z.number(),
  weightKg: z.number(),
  activityLevel: z.enum([
    'sedentary',
    'lightly_active',
    'moderately_active',
    'very_active',
    'extra_active',
  ]),
  goal: z.enum(['lose', 'maintain', 'gain']),
  createdAt: z.string(),
});

const UsersSchema = z.record(z.string(), UserProfileSchema);

const NutritionGoalsSchema = z.object({
  calorieTarget: z.number(),
  proteinPct: z.number(),
  carbsPct: z.number(),
  fatPct: z.number(),
  isManual: z.boolean(),
});

const LogEntrySchema = z.object({
  id: z.string(),
  foodId: z.string(),
  foodName: z.string(),
  servingGrams: z.number(),
  mealSection: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const DayLogSchema = z.object({
  date: z.string(),
  entries: z.array(LogEntrySchema),
});

const DayLogRecordSchema = z.record(z.string(), DayLogSchema);

// Weight is stored as a flat `Record<YYYY-MM-DD, number>` (date → weightKg),
// matching the data model's LocalStorage Key Map. (Req 8.2)
const WeightRecordSchema = z.record(z.string(), z.number());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a `Date` as a `YYYY-MM-DD` string in local time — matching the
 * convention used by `NutritionCalculator` so the day-log lookup and the
 * streak computation agree on "today".
 */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Merge a caller-supplied partial visibility override with the all-visible
 * defaults. (Req 13.2)
 */
function mergeVisibility(
  partial?: Partial<ExportFieldVisibility>,
): ExportFieldVisibility {
  return { ...DEFAULT_EXPORT_FIELD_VISIBILITY, ...partial };
}

/** Format a weight value for display, or an em dash when unknown. */
function formatWeight(kg: number | null): string {
  if (kg == null) return '—';
  return `${kg.toFixed(1)} kg`;
}

/** Round a calorie value to a whole number for display. */
function formatCalories(n: number): string {
  return String(Math.round(n));
}

/** Format a streak count, pluralising "day(s)". */
function formatStreak(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/**
 * Render a single labelled field row (label above, value below) at `y`.
 */
function drawFieldRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  y: number,
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Label
  ctx.fillStyle = COLORS.label;
  ctx.font = '13px sans-serif';
  ctx.fillText(label, 24, y);

  // Value
  ctx.fillStyle = COLORS.value;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(value, 24, y + 24);
}

/**
 * Draw the full progress summary card onto a 2D context, honouring the
 * field-visibility toggles. Only visible fields are rendered; hidden fields
 * are omitted entirely (their rows are not even spaced out, so the layout
 * compacts naturally). (Req 13.1, 13.2)
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  data: ExportSummaryData,
  visibility: ExportFieldVisibility,
): void {
  const w = EXPORT_CARD_WIDTH;
  const h = EXPORT_CARD_HEIGHT;

  // ── Background ───────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // ── Header bar ────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(0, 0, w, 64);

  ctx.fillStyle = COLORS.headerText;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('DietSync — Progress Summary', 24, 32);

  // ── Date subtitle ─────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.footer;
  ctx.font = '13px sans-serif';
  ctx.fillText(toDateString(new Date()), 24, 84);

  // ── Divider ───────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(24, 104, w - 48, 1);

  // ── Fields (stacked, only visible ones) ──────────────────────────────────
  let y = 132;
  const rowGap = 56;

  if (visibility.showName) {
    drawFieldRow(ctx, 'Name', data.name || '—', y);
    y += rowGap;
  }
  if (visibility.showWeight) {
    drawFieldRow(ctx, 'Current Weight', formatWeight(data.currentWeightKg), y);
    y += rowGap;
  }
  if (visibility.showCalorieStats) {
    const pct = computeProgressPct(data.consumedCalories, data.calorieTarget);
    const value =
      data.calorieTarget > 0
        ? `${formatCalories(data.consumedCalories)} / ${formatCalories(data.calorieTarget)} kcal (${Math.round(pct)}%)`
        : `${formatCalories(data.consumedCalories)} kcal`;
    drawFieldRow(ctx, "Today's Calories", value, y);
    y += rowGap;
  }
  if (visibility.showStreak) {
    drawFieldRow(ctx, 'Current Streak', formatStreak(data.streak), y);
    y += rowGap;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.footer;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    'DietSync — local device only. Data does not sync across devices.',
    w / 2,
    h - 24,
  );
}

// ---------------------------------------------------------------------------
// ExportService
// ---------------------------------------------------------------------------

/**
 * Renders and exports the DietSync progress summary card as a PNG image.
 *
 * Responsibilities:
 *  - Assemble `ExportSummaryData` from persisted data (optional convenience).
 *  - Render a ≥ 600×400 px card onto a Canvas, honouring per-field visibility
 *    toggles (all visible by default). (Req 13.1, 13.2)
 *  - Trigger a PNG file download when the user confirms the export. (Req 13.3)
 *  - Fall back from `toBlob` → `toDataURL`, surfacing a user-facing error
 *    only when both are unavailable — never crashing. (Req 13.4)
 */
export class ExportService {
  // ── Summary assembly ──────────────────────────────────────────────────────

  /**
   * Assemble the progress summary data for `userId` as of `today` (defaults
   * to now) from persisted storage.
   *
   * - name: from the user profile (`dietsync:users`).
   * - currentWeightKg: the latest weight entry (`dietsync:[userId]:weight`),
   *   falling back to the profile weight, then `null` when unknown.
   * - calorieTarget: from `dietsync:[userId]:goals` (0 when unset).
   * - consumedCalories: today's aggregated log calories (0 when none logged).
   * - streak: consecutive logged days ending today/yesterday.
   *
   * All reads are validated by `StorageRepository` and degrade to safe
   * defaults — this method never throws. (Req 11.1, 11.2)
   */
  buildSummaryData(userId: string, today: Date = new Date()): ExportSummaryData {
    // ── Name + fallback weight (profile) ──────────────────────────────────
    const users = storageRepository.get(STORAGE_KEYS.USERS, UsersSchema, {});
    const profile = users[userId];

    const name = profile?.name ?? '';

    // ── Current weight (latest entry, else profile weight) ──────────────────
    const weightRecord = storageRepository.get(
      STORAGE_KEYS.WEIGHT(userId),
      WeightRecordSchema,
      {},
    );
    const weightEntries: WeightEntry[] = Object.entries(weightRecord).map(
      ([date, weightKg]) => ({ date, weightKg }),
    );
    const sortedWeight = sortWeightLog(weightEntries);
    const currentWeightKg =
      sortedWeight.length > 0
        ? sortedWeight[sortedWeight.length - 1].weightKg
        : profile?.weightKg ?? null;

    // ── Calorie target ───────────────────────────────────────────────────────
    const goals = storageRepository.get<NutritionGoals | null>(
      STORAGE_KEYS.GOALS(userId),
      NutritionGoalsSchema as z.ZodType<NutritionGoals | null>,
      null,
    );
    const calorieTarget = goals?.calorieTarget ?? 0;

    // ── Consumed calories today + streak ───────────────────────────────────
    const logs = storageRepository.get(
      STORAGE_KEYS.LOGS(userId),
      DayLogRecordSchema,
      {},
    );
    const todayStr = toDateString(today);
    const todayLog: DayLog | undefined = logs[todayStr];
    const consumedCalories = todayLog
      ? aggregateDayLog(todayLog.entries).calories
      : 0;
    const streak = computeStreak(logs, today);

    return { name, currentWeightKg, consumedCalories, calorieTarget, streak };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  /**
   * Render the progress summary card onto a Canvas of at least 600×400 px.
   *
   * Creates a new canvas unless one is supplied (the optional `canvas`
   * param is a test seam). The supplied canvas is resized to the card
   * dimensions. Hidden fields are omitted entirely. (Req 13.1, 13.2)
   *
   * @returns the rendered canvas (the same one passed in, when provided).
   */
  renderCard(
    data: ExportSummaryData,
    visibility: Partial<ExportFieldVisibility> = {},
    canvas?: HTMLCanvasElement,
  ): HTMLCanvasElement {
    const c = canvas ?? document.createElement('canvas');
    c.width = EXPORT_CARD_WIDTH;
    c.height = EXPORT_CARD_HEIGHT;

    const ctx = c.getContext('2d');
    // Guard against environments without a 2D context (e.g. jsdom) so the
    // dimensions are still set and no crash occurs.
    if (ctx) {
      drawCard(ctx, data, mergeVisibility(visibility));
    }

    return c;
  }

  // ── Export / download ──────────────────────────────────────────────────────

  /**
   * Render the card and trigger a PNG file download. (Req 13.3)
   *
   * Tries the primary export method (`canvas.toBlob`) first; if it is
   * unavailable or fails, falls back to `canvas.toDataURL`. If both are
   * unavailable, returns a user-facing error instead of throwing. (Req 13.4)
   *
   * The optional `canvas` param is a test seam (see {@link renderCard}).
   */
  async exportToPng(
    data: ExportSummaryData,
    visibility: Partial<ExportFieldVisibility> = {},
    canvas?: HTMLCanvasElement,
  ): Promise<ExportResult> {
    try {
      const c = this.renderCard(data, visibility, canvas);
      return await this.downloadPng(c);
    } catch {
      // Any unexpected failure degrades to a user-facing error — no crash.
      return {
        success: false,
        error:
          'Unable to export the progress card. Please try again.',
      };
    }
  }

  /**
   * Attempt the PNG download using the primary method, then the fallback,
   * then a user-facing error. (Req 13.4)
   */
  private async downloadPng(canvas: HTMLCanvasElement): Promise<ExportResult> {
    const width = canvas.width;
    const height = canvas.height;

    // ── Primary: canvas.toBlob ────────────────────────────────────────────────
    if (typeof canvas.toBlob === 'function') {
      try {
        const blob = await this.toBlobPromise(canvas, 'image/png');
        if (blob) {
          const url = URL.createObjectURL(blob);
          this.triggerDownload(url, DEFAULT_EXPORT_FILENAME);
          URL.revokeObjectURL(url);
          return { success: true, method: 'toBlob', width, height };
        }
      } catch {
        // Fall through to the alternative method.
      }
    }

    // ── Fallback: canvas.toDataURL ───────────────────────────────────────────
    if (typeof canvas.toDataURL === 'function') {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl) {
          this.triggerDownload(dataUrl, DEFAULT_EXPORT_FILENAME);
          return { success: true, method: 'toDataURL', width, height };
        }
      } catch {
        // Fall through to the error outcome.
      }
    }

    // ── Both unavailable ──────────────────────────────────────────────────────
    return {
      success: false,
      error:
        'Image export is not supported in this browser. The progress card could not be downloaded.',
    };
  }

  /**
   * Promisify `canvas.toBlob` for use with `await`.
   */
  private toBlobPromise(
    canvas: HTMLCanvasElement,
    type: string,
  ): Promise<Blob | null> {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type);
    });
  }

  /**
   * Trigger a browser download by programmatically clicking a hidden anchor.
   */
  private triggerDownload(href: string, filename: string): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = href;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/**
 * App-wide singleton. Import and use this in Zustand stores and other
 * service consumers.
 */
export const exportService = new ExportService();
