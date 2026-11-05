// ─────────────────────────────────────────────────────────────────────────────
// DietSync — AWS API client (frontend)
// Uses relative URLs so it works on both localhost (Vercel dev) and production.
// All AWS calls go through serverless functions — no AWS keys in the browser.
// ─────────────────────────────────────────────────────────────────────────────

// In production this is '' (same origin).
// Override with VITE_AWS_SERVER_URL only when running aws-server.js locally.
const AWS_BASE = import.meta.env.VITE_AWS_SERVER_URL ?? '';

// ── S3: save the current user's localStorage data to the cloud ───────────────
export async function syncSaveToCloud(
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${AWS_BASE}/api/aws/sync/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'Sync save failed');
  }
}

// ── S3: load a user's saved data from the cloud ──────────────────────────────
// Returns null if no cloud save exists yet (first time on a new device).
export async function syncLoadFromCloud(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${AWS_BASE}/api/aws/sync/load/${userId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'Sync load failed');
  }
  const json = await res.json();
  return json.data ?? null;
}

// ── Bedrock: ask the AI nutrition coach ──────────────────────────────────────
export interface NutritionContext {
  userName?: string;
  calorieTarget?: number;
  caloriesConsumed?: number;
  proteinConsumed?: number;
  carbsConsumed?: number;
  fatConsumed?: number;
  goal?: string;
  waterConsumedMl?: number;
  waterTargetMl?: number;
}

export async function askAI(
  prompt: string,
  context: NutritionContext,
): Promise<string> {
  const res = await fetch(`${AWS_BASE}/api/aws/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'AI request failed');
  }
  const json = await res.json();
  return json.text as string;
}
