// ─────────────────────────────────────────────────────────────────────────────
// DietSync — Bedrock Nova Lite helper
// AI nutrition coach that knows the user's current macros and goals.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
});

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';

/**
 * Ask the AI nutrition coach a question.
 * `context` carries the user's current macros, goals, and today's log
 * so the AI can give personalised answers.
 *
 * Called by POST /api/ai
 */
export async function askNutritionCoach(prompt, context = {}) {
  const systemPrompt = buildSystemPrompt(context);

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: {
      maxTokens: 400,
      temperature: 0.7,
      topP: 0.9,
    },
  });

  const response = await bedrock.send(command);

  const text =
    response.output?.message?.content
      ?.map((c) => c.text)
      .filter(Boolean)
      .join('\n') || '(no response)';

  return text;
}

function buildSystemPrompt(ctx) {
  const {
    userName = 'the user',
    calorieTarget = null,
    caloriesConsumed = null,
    proteinTarget = null,
    proteinConsumed = null,
    carbsConsumed = null,
    fatConsumed = null,
    goal = null,
    waterConsumedMl = null,
    waterTargetMl = null,
  } = ctx;

  const caloriesRemaining =
    calorieTarget != null && caloriesConsumed != null
      ? calorieTarget - caloriesConsumed
      : null;

  return `You are a friendly, concise AI nutrition coach inside DietSync, a nutrition tracking app.
You are talking to ${userName}.

${calorieTarget != null ? `Their daily calorie target is ${calorieTarget} kcal.` : ''}
${caloriesConsumed != null ? `So far today they have consumed ${Math.round(caloriesConsumed)} kcal.` : ''}
${caloriesRemaining != null ? `They have ${Math.round(caloriesRemaining)} kcal remaining today.` : ''}
${proteinConsumed != null ? `Protein consumed: ${proteinConsumed.toFixed(1)}g.` : ''}
${carbsConsumed != null ? `Carbs consumed: ${carbsConsumed.toFixed(1)}g.` : ''}
${fatConsumed != null ? `Fat consumed: ${fatConsumed.toFixed(1)}g.` : ''}
${goal != null ? `Their nutrition goal is to ${goal} weight.` : ''}
${waterConsumedMl != null ? `Water consumed today: ${waterConsumedMl} ml of ${waterTargetMl} ml target.` : ''}

Keep answers short (2–4 sentences). Be encouraging and practical. 
Do not repeat their stats back to them unless asked.
Never give medical advice — always recommend consulting a professional for medical questions.`;
}
