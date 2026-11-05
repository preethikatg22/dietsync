// Vercel Serverless Function — POST /api/aws/ai
// Ask the Bedrock Nova Lite nutrition coach

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';

function buildSystemPrompt(ctx = {}) {
  const {
    userName = 'the user',
    calorieTarget,
    caloriesConsumed,
    proteinConsumed,
    carbsConsumed,
    fatConsumed,
    goal,
    waterConsumedMl,
    waterTargetMl,
  } = ctx;

  const remaining =
    calorieTarget != null && caloriesConsumed != null
      ? calorieTarget - caloriesConsumed
      : null;

  return `You are a friendly, concise AI nutrition coach inside DietSync, a nutrition tracking app.
You are talking to ${userName}.
${calorieTarget != null ? `Daily calorie target: ${calorieTarget} kcal.` : ''}
${caloriesConsumed != null ? `Consumed today: ${Math.round(caloriesConsumed)} kcal.` : ''}
${remaining != null ? `Remaining: ${Math.round(remaining)} kcal.` : ''}
${proteinConsumed != null ? `Protein: ${proteinConsumed.toFixed(1)}g.` : ''}
${carbsConsumed != null ? `Carbs: ${carbsConsumed.toFixed(1)}g.` : ''}
${fatConsumed != null ? `Fat: ${fatConsumed.toFixed(1)}g.` : ''}
${goal != null ? `Goal: ${goal} weight.` : ''}
${waterConsumedMl != null ? `Water: ${waterConsumedMl}ml of ${waterTargetMl}ml.` : ''}
Keep answers short (2-4 sentences). Be encouraging and practical.
Never give medical advice.`;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ error: '`prompt` is required.' });

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: buildSystemPrompt(context || {}) }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 400, temperature: 0.7, topP: 0.9 },
    });

    const response = await bedrock.send(command);
    const text =
      response.output?.message?.content
        ?.map((c) => c.text)
        .filter(Boolean)
        .join('\n') || '(no response)';

    res.json({ success: true, text });
  } catch (err) {
    console.error('[Bedrock]', err.message);
    const hint = /access|not authorized|model/i.test(err.message)
      ? ' Make sure Nova Lite is enabled in Bedrock console (us-east-1).' : '';
    res.status(500).json({ error: err.message + hint });
  }
}
