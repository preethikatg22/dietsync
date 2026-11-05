// ─────────────────────────────────────────────────────────────────────────────
// CloudSync — save/load dietsync data to/from S3
// Shows a small toolbar on the Dashboard with Save and Load buttons.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { syncSaveToCloud, syncLoadFromCloud } from '../../services/awsClient.ts';
import { STORAGE_KEYS } from '../../types/index.ts';

interface CloudSyncProps {
  userId: string;
  /** Called after a successful load so the app reloads its stores */
  onDataRestored: () => void;
}

type SyncStatus = 'idle' | 'saving' | 'loading' | 'saved' | 'loaded' | 'error';

/** Keys we back up — all dietsync:* keys for this user */
function collectUserData(userId: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const prefix = 'dietsync:';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(`${prefix}${userId}`) || key === STORAGE_KEYS.AUTH || key === STORAGE_KEYS.USERS)) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
      }
    }
  }
  return data;
}

/** Write the restored snapshot back into localStorage */
function restoreUserData(snapshot: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

export function CloudSync({ userId, onDataRestored }: CloudSyncProps) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');

  async function handleSave() {
    setStatus('saving');
    setMessage('');
    try {
      const data = collectUserData(userId);
      await syncSaveToCloud(userId, data);
      setStatus('saved');
      setMessage('Data saved to cloud ✓');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message.includes('fetch') || (err as Error).message.includes('Failed')
        ? 'Could not reach AWS. Check that environment variables are set in Vercel.'
        : (err as Error).message);
    }
  }

  async function handleLoad() {
    setStatus('loading');
    setMessage('');
    try {
      const snapshot = await syncLoadFromCloud(userId);
      if (!snapshot) {
        setStatus('idle');
        setMessage('No cloud save found for this account.');
        setTimeout(() => setMessage(''), 4000);
        return;
      }
      restoreUserData(snapshot);
      setStatus('loaded');
      setMessage('Data restored from cloud ✓ Reloading…');
      setTimeout(() => {
        onDataRestored();
        setStatus('idle');
        setMessage('');
      }, 1500);
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message.includes('fetch') || (err as Error).message.includes('Failed')
        ? 'Could not reach AWS. Check that environment variables are set in Vercel.'
        : (err as Error).message);
    }
  }

  const busy = status === 'saving' || status === 'loading';

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <span aria-hidden="true">☁️</span> Cloud Sync
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {status === 'saving' ? 'Saving…' : '↑ Save to Cloud'}
          </button>
          <button
            type="button"
            onClick={() => void handleLoad()}
            disabled={busy}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {status === 'loading' ? 'Loading…' : '↓ Load from Cloud'}
          </button>
        </div>
      </div>

      {message && (
        <p className={`mt-2 text-xs ${
          status === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}
