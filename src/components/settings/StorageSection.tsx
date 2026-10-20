// ─────────────────────────────────────────────────────────────────────────────
// StorageSection — storage usage indicator and log-pruning threshold selector
// Requirements: 11.3, 11.4, 11.5
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { STORAGE_KEYS, type UserSettings } from '../../types/index.ts';
import { storageRepository } from '../../repositories/StorageRepository.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const USAGE_WARNING_BYTES = 4_000_000; // 4 MB
const PRUNING_OPTIONS = [30, 60, 90, 180] as const;
type PruningDays = (typeof PRUNING_OPTIONS)[number];

// ── Zod schema ────────────────────────────────────────────────────────────────

const UserSettingsSchema = z.object({
  logPruningDays: z.number(),
  waterStepMl: z.number(),
  waterTargetMl: z.number(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface StorageSectionProps {
  userId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StorageSection({ userId }: StorageSectionProps) {
  const [usageBytes, setUsageBytes] = useState(0);
  const [pruningDays, setPruningDays] = useState<PruningDays>(90);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Read usage and load existing settings on mount
  useEffect(() => {
    setUsageBytes(storageRepository.estimatedUsageBytes());

    const settings = storageRepository.get<UserSettings | null>(
      STORAGE_KEYS.SETTINGS(userId),
      UserSettingsSchema as z.ZodType<UserSettings | null>,
      null,
    );
    if (settings) {
      const loaded = settings.logPruningDays;
      // Guard: only accept known option values
      if ((PRUNING_OPTIONS as readonly number[]).includes(loaded)) {
        setPruningDays(loaded as PruningDays);
      }
    }
  }, [userId]);

  function handleSave() {
    setSaveSuccess(false);

    // Load existing settings to preserve waterStepMl / waterTargetMl
    const existing = storageRepository.get<UserSettings | null>(
      STORAGE_KEYS.SETTINGS(userId),
      UserSettingsSchema as z.ZodType<UserSettings | null>,
      null,
    );

    const updated: UserSettings = {
      logPruningDays: pruningDays,
      waterStepMl: existing?.waterStepMl ?? 250,
      waterTargetMl: existing?.waterTargetMl ?? 2000,
    };

    storageRepository.set(STORAGE_KEYS.SETTINGS(userId), updated);
    // Refresh usage after write
    setUsageBytes(storageRepository.estimatedUsageBytes());
    setSaveSuccess(true);
  }

  const isOverLimit = usageBytes > USAGE_WARNING_BYTES;

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Storage</h2>

      {/* Storage usage indicator (Req 11.4) */}
      <div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Estimated usage:{' '}
          <span className="font-semibold">{formatBytes(usageBytes)}</span>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Includes all DietSync data stored on this device.
        </p>
      </div>

      {/* High-usage warning banner — non-blocking (Req 11.5) */}
      {isOverLimit && !warningDismissed && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3"
        >
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Storage usage is high (&gt; 4 MB). Consider reducing your log history.
          </p>
          <button
            type="button"
            onClick={() => setWarningDismissed(true)}
            aria-label="Dismiss storage warning"
            className="shrink-0 text-amber-500 hover:text-amber-700 focus:outline-none text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Log pruning threshold selector (Req 11.3) */}
      <div>
        <label
          htmlFor="pruning-days"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Keep log history for
        </label>
        <select
          id="pruning-days"
          value={pruningDays}
          onChange={(e) => setPruningDays(Number(e.target.value) as PruningDays)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {PRUNING_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days} days
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Food log entries older than this will be removed automatically.
        </p>
      </div>

      {saveSuccess && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          Settings saved.
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
      >
        Save settings
      </button>
    </div>
  );
}
