// ─────────────────────────────────────────────────────────────────────────────
// AccountSection — logout and account-deletion controls
// Requirements: 2.6, 2.9
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.ts';

// ── Props ─────────────────────────────────────────────────────────────────────

interface AccountSectionProps {
  userId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AccountSection({ userId }: AccountSectionProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  // Show the inline confirmation UI when the user clicks "Delete account"
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ── Logout (Req 2.6) ─────────────────────────────────────────────────────

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // ── Delete account (Req 2.9) ──────────────────────────────────────────────

  function handleDeleteConfirm() {
    deleteAccount(userId);
    navigate('/login');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Account</h2>

      {/* Logout */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sign out</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            End your current session on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Delete account */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Permanently removes all your data from this device. This cannot be undone.
            </p>
          </div>
          {!confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="shrink-0 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Delete account
            </button>
          )}
        </div>

        {/* Inline confirmation (Req 2.9) */}
        {confirmingDelete && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-3"
          >
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Are you sure you want to delete your account? All your logs, goals, and custom
              foods will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Yes, delete my account
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
