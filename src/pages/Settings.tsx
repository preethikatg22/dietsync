// ─────────────────────────────────────────────────────────────────────────────
// Settings page — goals, custom foods, storage, and account management
// Requirements: 2.6, 2.9, 4.1–4.7, 7.1–7.8, 11.3–11.5
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.ts';
import { useFoodStore } from '../stores/foodStore.ts';
import {
  GoalsEditor,
  CustomFoodsManager,
  AccountSection,
  StorageSection,
} from '../components/settings/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Settings page
// ─────────────────────────────────────────────────────────────────────────────

export function Settings() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const currentUser = useAuthStore((s) => s.currentUser);
  const loadCustomFoods = useFoodStore((s) => s.loadCustomFoods);

  const userId = session?.userId;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!userId) {
      navigate('/login', { replace: true });
    }
  }, [userId, navigate]);

  // Load custom foods on mount (Req 4.3)
  useEffect(() => {
    if (userId) {
      loadCustomFoods(userId);
    }
  }, [userId, loadCustomFoods]);

  if (!userId || !currentUser) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top nav */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            DietSync
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-500">/ Settings</span>
        </div>
        <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
          {currentUser.name}
        </span>
      </header>

      {/* Page content */}
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>

        {/* Nutrition goals (Req 7.1–7.8) */}
        <GoalsEditor userId={userId} sex={currentUser.sex} />

        {/* Custom foods (Req 4.1–4.7) */}
        <CustomFoodsManager userId={userId} />

        {/* Storage (Req 11.3–11.5) */}
        <StorageSection userId={userId} />

        {/* Account (Req 2.6, 2.9) */}
        <AccountSection userId={userId} />
      </div>
    </main>
  );
}
