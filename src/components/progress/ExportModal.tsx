// ─────────────────────────────────────────────────────────────────────────────
// ExportModal — progress summary card export with field-visibility toggles
// Requirements: 13.1-13.4
// ─────────────────────────────────────────────────────────────────────────────
//
// Renders a modal that lets the user toggle which fields appear on the
// exported PNG progress card (name, weight, calorie stats, streak), then
// confirms the export. Delegates rendering and download to `exportService`.
// All fields default to visible (Req 13.2). On export failure the error
// message is displayed inline (Req 13.4).

import { useState } from 'react';
import {
  exportService,
  DEFAULT_EXPORT_FIELD_VISIBILITY,
  type ExportFieldVisibility,
  type ExportSummaryData,
} from '../../services/ExportService.ts';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportModalProps {
  /** Summary data assembled by the caller from the active Zustand stores. */
  summaryData: ExportSummaryData;
  /** Called when the user dismisses the modal (cancel or post-export close). */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Toggle row sub-component
// ---------------------------------------------------------------------------

interface ToggleRowProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, checked, onChange }: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between cursor-pointer select-none"
    >
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
          checked
            ? 'bg-emerald-500'
            : 'bg-gray-200 dark:bg-gray-600'
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------

export function ExportModal({ summaryData, onClose }: ExportModalProps) {
  const [visibility, setVisibility] = useState<ExportFieldVisibility>(
    DEFAULT_EXPORT_FIELD_VISIBILITY,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  function setField<K extends keyof ExportFieldVisibility>(
    key: K,
    value: boolean,
  ) {
    setVisibility((prev) => ({ ...prev, [key]: value }));
  }

  async function handleExport() {
    setIsExporting(true);
    setErrorMessage(null);

    const result = await exportService.exportToPng(summaryData, visibility);

    setIsExporting(false);

    if (result.success) {
      setExported(true);
    } else {
      setErrorMessage(result.error);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      {/* Panel */}
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-xl flex flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            id="export-modal-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Export Progress Card
          </h2>
          <button
            type="button"
            aria-label="Close export dialog"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">
          Choose which fields to include in the exported PNG card.
        </p>

        {/* Field toggles (Req 13.2) */}
        <div className="space-y-4">
          <ToggleRow
            id="toggle-name"
            label="Name"
            checked={visibility.showName}
            onChange={(v) => setField('showName', v)}
          />
          <ToggleRow
            id="toggle-weight"
            label="Current Weight"
            checked={visibility.showWeight}
            onChange={(v) => setField('showWeight', v)}
          />
          <ToggleRow
            id="toggle-calories"
            label="Calorie Stats"
            checked={visibility.showCalorieStats}
            onChange={(v) => setField('showCalorieStats', v)}
          />
          <ToggleRow
            id="toggle-streak"
            label="Streak"
            checked={visibility.showStreak}
            onChange={(v) => setField('showStreak', v)}
          />
        </div>

        {/* Error message (Req 13.4) */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          >
            {errorMessage}
          </div>
        )}

        {/* Success feedback */}
        {exported && (
          <div
            role="status"
            className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
          >
            Progress card downloaded successfully!
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            {exported ? 'Close' : 'Cancel'}
          </button>

          {!exported && (
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {isExporting ? 'Exporting…' : 'Export PNG'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
