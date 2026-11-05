// ─────────────────────────────────────────────────────────────────────────────
// DietSync — AWS API routes (Express)
// Mounts under /api/aws  — required by aws-server.js
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { saveUserData, loadUserData } from './s3.js';
import { askNutritionCoach } from './bedrock.js';

const router = Router();

// ── S3: save user's full data snapshot ───────────────────────────────────────
// POST /api/aws/sync/save
// Body: { userId: string, data: object }
router.post('/sync/save', async (req, res) => {
  try {
    const { userId, data } = req.body;
    if (!userId || !data) {
      return res.status(400).json({ error: '`userId` and `data` are required.' });
    }
    await saveUserData(userId, data);
    res.json({ success: true });
  } catch (err) {
    console.error('[S3 save]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── S3: load user's data snapshot ────────────────────────────────────────────
// GET /api/aws/sync/load/:userId
router.get('/sync/load/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await loadUserData(userId);
    // data is null when the user has no saved snapshot yet (new device)
    res.json({ success: true, data });
  } catch (err) {
    console.error('[S3 load]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Bedrock: AI nutrition coach ───────────────────────────────────────────────
// POST /api/aws/ai
// Body: { prompt: string, context: object }
router.post('/ai', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: '`prompt` is required.' });
    }
    const text = await askNutritionCoach(prompt, context || {});
    res.json({ success: true, text });
  } catch (err) {
    console.error('[Bedrock]', err.message);
    const hint = /access|not authorized|model/i.test(err.message)
      ? ' Make sure Nova Lite model access is enabled in the Bedrock console (us-east-1).'
      : '';
    res.status(500).json({ error: err.message + hint });
  }
});

export default router;
