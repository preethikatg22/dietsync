// ─────────────────────────────────────────────────────────────────────────────
// NutritionCoach — AI chat widget powered by Amazon Bedrock Nova Lite
// Floats as a collapsible panel on the Dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { askAI, type NutritionContext } from '../../services/awsClient.ts';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

interface NutritionCoachProps {
  context: NutritionContext;
}

const SUGGESTED = [
  "What should I eat to hit my protein goal?",
  "How am I doing today?",
  "Suggest a healthy snack under 200 kcal",
];

export function NutritionCoach({ context }: NutritionCoachProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(prompt: string) {
    if (!prompt.trim() || loading) return;
    setError(null);
    setMessages((m) => [...m, { role: 'user', text: prompt }]);
    setInput('');
    setLoading(true);

    try {
      const text = await askAI(prompt, context);
      setMessages((m) => [...m, { role: 'ai', text }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      {/* Toggle button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-600 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
          aria-label="Open AI nutrition coach"
        >
          <span aria-hidden="true">🤖</span> AI Coach
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="flex flex-col rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between bg-emerald-500 px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <span aria-hidden="true">🤖</span>
              <span className="text-sm font-semibold">AI Nutrition Coach</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white focus:outline-none"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-col gap-3 overflow-y-auto p-3 h-64">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Ask me anything about your nutrition today!
                </p>
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="w-full rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-left text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                    m.role === 'user'
                      ? 'bg-emerald-500 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 text-center px-2">
                ⚠️ {error.includes('fetch') ? 'AWS server not running. Start it with: node aws-server.js' : error}
              </p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 p-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
              placeholder="Ask your coach…"
              disabled={loading}
              className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
