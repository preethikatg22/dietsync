// ─────────────────────────────────────────────────────────────────────────────
// EditEntryModal — update the serving size of an existing log entry
// Requirements: 5.4
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import type { LogEntry } from '../../types/index.ts';
import { useLogStore } from '../../stores/logStore.ts';

interface EditEntryModalProps {
  /** The entry to edit */
  entry: LogEntry;
  /** The date the entry belongs to (YYYY-MM-DD) */
  date: string;
  /** The authenticated user's ID */
  userId: string;
  /** Close the modal */
  onClose: () => void;
}

/**
 * Modal dialog for editing the serving size of an existing log entry.
 *
 * On confirm the store calls `FoodLogService.editEntry` which recalculates
 * macros based on the new serving size. (Req 5.4)
 */
export function EditEntryModal({ entry, date, userId, onClose }: EditEntryModalProps) {
  const editEntry = useLogStore((s) => s.editEntry);

  const [servingGrams, setServingGrams] = useState<string>(String(entry.servingGrams));
  const [servingError, setServingError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleServingChange(value: string) {
    setServingGrams(value);
    setServingError('');
  }

  function validate(): number | null {
    const num = parseFloat(servingGrams);
    if (isNaN(num) || num <= 0) {
      setServingError('Serving size must be greater than 0 g');
      return null;
    }
    if (num > 2000) {
      setServingError('Serving size cannot exceed 2000 g');
      return null;
    }
    return num;
  }

  function handleSave() {
    const grams = validate();
    if (grams === null) return;

    setIsSaving(true);
    setSaveError('');
    try {
      editEntry(userId, date, entry.id, grams);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update entry');
      setIsSaving(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Preview scaled nutrients for the current serving
  const grams = parseFloat(servingGrams);
  const scale = isNaN(grams) || grams <= 0 ? null : grams / entry.servingGrams;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit serving size for ${entry.foodName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Edit Entry</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{entry.foodName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit modal"
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Serving size input */}
        <div>
          <label
            htmlFor="edit-serving-input"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Serving size in grams
          </label>
          <input
            id="edit-serving-input"
            type="number"
            min="0.1"
            max="2000"
            step="0.1"
            value={servingGrams}
            onChange={(e) => handleServingChange(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors ${
              servingError
                ? 'border-red-500 dark:border-red-500'
                : 'border-gray-200 dark:border-gray-600'
            }`}
            aria-describedby={servingError ? 'edit-serving-error' : undefined}
          />
          {servingError && (
            <p id="edit-serving-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {servingError}
            </p>
          )}
        </div>

        {/* Macro preview */}
        {scale !== null && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3 grid grid-cols-4 gap-2 text-center">
            <MacroPreviewCell label="Calories" value={Math.round(entry.calories * scale)} unit="kcal" />
            <MacroPreviewCell label="Protein" value={+(entry.protein * scale).toFixed(1)} unit="g" />
            <MacroPreviewCell label="Carbs" value={+(entry.carbs * scale).toFixed(1)} unit="g" />
            <MacroPreviewCell label="Fat" value={+(entry.fat * scale).toFixed(1)} unit="g" />
          </div>
        )}

        {saveError && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {saveError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MacroPreviewCell — small stat cell in the preview grid
// ─────────────────────────────────────────────────────────────────────────────

interface MacroPreviewCellProps {
  label: string;
  value: number;
  unit: string;
}

function MacroPreviewCell({ label, value, unit }: MacroPreviewCellProps) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
        {value}
        <span className="text-xs font-normal ml-0.5">{unit}</span>
      </p>
    </div>
  );
}
