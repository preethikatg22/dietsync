/**
 * Unit tests for ExportService (Stretch S1 — Progress Export Card)
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4
 *
 * Covers:
 *  - Card renders at ≥ 600×400 px (Req 13.1)
 *  - All fields visible by default; per-field visibility toggles honoured
 *    (Req 13.2)
 *  - PNG download triggered via toBlob (primary) (Req 13.3)
 *  - Fallback to toDataURL when toBlob unavailable (Req 13.4)
 *  - User-facing error (no crash) when both methods unavailable (Req 13.4)
 */

import { describe, expect, it, vi } from 'vitest';
import {
  exportService,
  type ExportSummaryData,
} from '../../services/ExportService.ts';

// ---------------------------------------------------------------------------
// Shared sample data
// ---------------------------------------------------------------------------

const SAMPLE_DATA: ExportSummaryData = {
  name: 'Alice',
  currentWeightKg: 68.5,
  consumedCalories: 1850,
  calorieTarget: 2200,
  streak: 7,
};

// ---------------------------------------------------------------------------
// Minimal fake 2D canvas context — records drawn text so the visibility
// toggling can be asserted even without a real canvas backend.
// ---------------------------------------------------------------------------

class FakeCtx {
  texts: string[] = [];
  fillStyle = '';
  font = '';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  textAlign: CanvasTextAlign = 'start';
  fillRect(_x: number, _y: number, _w: number, _h: number): void {}
  fillText(text: string, _x: number, _y: number): void {
    this.texts.push(text);
  }
}

/** Create a canvas whose `getContext` returns a recording fake context. */
function createFakeCanvas(): { canvas: HTMLCanvasElement; ctx: FakeCtx } {
  const ctx = new FakeCtx();
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext;
  return { canvas, ctx };
}

/** Join all text drawn on a fake context into a single searchable string. */
function drawnText(ctx: FakeCtx): string {
  return ctx.texts.join('\n');
}

// ---------------------------------------------------------------------------
// Requirement 13.1 — card dimensions
// ---------------------------------------------------------------------------

describe('ExportService — Requirement 13.1 (card dimensions)', () => {
  it('renders a card at least 600×400 px', () => {
    const canvas = exportService.renderCard(SAMPLE_DATA);
    expect(canvas.width).toBeGreaterThanOrEqual(600);
    expect(canvas.height).toBeGreaterThanOrEqual(400);
  });

  it('does not crash when no 2D context is available', () => {
    // jsdom provides no canvas backend, so getContext('2d') is null here —
    // rendering must degrade gracefully and still set the dimensions.
    const canvas = exportService.renderCard(SAMPLE_DATA);
    expect(canvas.width).toBeGreaterThanOrEqual(600);
    expect(canvas.height).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Requirement 13.2 — field visibility toggles (all visible by default)
// ---------------------------------------------------------------------------

describe('ExportService — Requirement 13.2 (field visibility)', () => {
  it('shows all fields by default', () => {
    const { canvas, ctx } = createFakeCanvas();
    exportService.renderCard(SAMPLE_DATA, {}, canvas);

    const drawn = drawnText(ctx);
    expect(drawn).toContain('Alice');
    expect(drawn).toContain('68.5 kg');
    expect(drawn).toContain('1850 / 2200 kcal (84%)');
    expect(drawn).toContain('7 days');
  });

  it('hides every field when all toggles are disabled', () => {
    const { canvas, ctx } = createFakeCanvas();
    exportService.renderCard(
      SAMPLE_DATA,
      {
        showName: false,
        showWeight: false,
        showCalorieStats: false,
        showStreak: false,
      },
      canvas,
    );

    const drawn = drawnText(ctx);
    expect(drawn).not.toContain('Alice');
    expect(drawn).not.toContain('68.5 kg');
    expect(drawn).not.toContain('1850 / 2200 kcal');
    expect(drawn).not.toContain('7 days');
  });

  it('toggles individual fields independently (name only)', () => {
    const { canvas, ctx } = createFakeCanvas();
    exportService.renderCard(
      SAMPLE_DATA,
      {
        showName: true,
        showWeight: false,
        showCalorieStats: false,
        showStreak: false,
      },
      canvas,
    );

    const drawn = drawnText(ctx);
    expect(drawn).toContain('Alice');
    expect(drawn).not.toContain('68.5 kg');
    expect(drawn).not.toContain('1850 / 2200 kcal');
    expect(drawn).not.toContain('7 days');
  });

  it('toggles individual fields independently (streak only)', () => {
    const { canvas, ctx } = createFakeCanvas();
    exportService.renderCard(
      SAMPLE_DATA,
      {
        showName: false,
        showWeight: false,
        showCalorieStats: false,
        showStreak: true,
      },
      canvas,
    );

    const drawn = drawnText(ctx);
    expect(drawn).not.toContain('Alice');
    expect(drawn).not.toContain('68.5 kg');
    expect(drawn).not.toContain('1850 / 2200 kcal');
    expect(drawn).toContain('7 days');
  });

  it('shows consumed calories without a target ratio when calorie target is 0', () => {
    const { canvas, ctx } = createFakeCanvas();
    exportService.renderCard(
      { ...SAMPLE_DATA, calorieTarget: 0, consumedCalories: 1200 },
      {},
      canvas,
    );

    const drawn = drawnText(ctx);
    expect(drawn).toContain('1200 kcal');
    expect(drawn).not.toContain('1200 / 0');
  });

  it('pluralises streak as "1 day" for a single-day streak', () => {
    const { canvas, ctx } = createFakeCanvas();
    exportService.renderCard(
      { ...SAMPLE_DATA, streak: 1 },
      { showName: false, showWeight: false, showCalorieStats: false, showStreak: true },
      canvas,
    );

    expect(drawnText(ctx)).toContain('1 day');
  });
});

// ---------------------------------------------------------------------------
// Requirement 13.3 — PNG download via primary method (toBlob)
// ---------------------------------------------------------------------------

describe('ExportService — Requirement 13.3 (PNG download via toBlob)', () => {
  it('uses canvas.toBlob as the primary export method and downloads the blob', async () => {
    const canvas = document.createElement('canvas');
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    canvas.toBlob = ((cb: (b: Blob | null) => void) => cb(blob)) as unknown as typeof canvas.toBlob;

    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:dietsync/fake');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockReturnValue(undefined);

    const result = await exportService.exportToPng(SAMPLE_DATA, {}, canvas);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.method).toBe('toBlob');
      expect(result.width).toBeGreaterThanOrEqual(600);
      expect(result.height).toBeGreaterThanOrEqual(400);
    }
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:dietsync/fake');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Requirement 13.4 — fallback to toDataURL when primary unavailable
// ---------------------------------------------------------------------------

describe('ExportService — Requirement 13.4 (fallback)', () => {
  it('falls back to canvas.toDataURL when toBlob is unavailable', async () => {
    const canvas = document.createElement('canvas');
    // Make the primary method unavailable.
    (canvas as unknown as { toBlob: undefined }).toBlob = undefined;
    const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA');
    canvas.toDataURL = toDataURL as unknown as typeof canvas.toDataURL;

    const result = await exportService.exportToPng(SAMPLE_DATA, {}, canvas);

    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.method).toBe('toDataURL');
    }
  });

  it('falls back to canvas.toDataURL when toBlob throws', async () => {
    const canvas = document.createElement('canvas');
    canvas.toBlob = (() => {
      throw new Error('toBlob broken');
    }) as unknown as typeof canvas.toBlob;
    const toDataURL = vi.fn(() => 'data:image/png;base64,BBBB');
    canvas.toDataURL = toDataURL as unknown as typeof canvas.toDataURL;

    const result = await exportService.exportToPng(SAMPLE_DATA, {}, canvas);

    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.method).toBe('toDataURL');
    }
  });

  it('returns a user-facing error (no throw) when both methods are unavailable', async () => {
    const canvas = document.createElement('canvas');
    (canvas as unknown as { toBlob: undefined }).toBlob = undefined;
    (canvas as unknown as { toDataURL: undefined }).toDataURL = undefined;

    const result = await exportService.exportToPng(SAMPLE_DATA, {}, canvas);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe('string');
    }
  });
});
