'use client';

import { useCallback, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

type FlowStatus = 'idle' | 'saving' | 'reflecting' | 'success' | 'error';

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [goal, setGoal] = useState('');
  const [journalEntry, setJournalEntry] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [status, setStatus] = useState<FlowStatus>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  const isGenerating = status === 'saving' || status === 'reflecting';

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const handleGenerate = useCallback(async () => {
    if (!supabaseConfigured) {
      setFeedback('Supabase environment variables are missing. Update .env.local before generating reflections.');
      setStatus('error');
      return;
    }

    if (!journalEntry.trim()) {
      setFeedback('Add a journal entry before requesting a reflection.');
      setStatus('error');
      return;
    }

    setFeedback(null);
    setAiResponse('');
    setStatus('saving');

    try {
      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const session = sessionResult?.session;
      if (!session) {
        throw new Error('Sign in to save entries and generate reflections.');
      }

      const { data: insertedEntry, error: insertError } = await supabase
        .from('journal_entries')
        .insert({ title: goal || null, content: journalEntry })
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      setStatus('reflecting');

      const { data: reflectionData, error: reflectionError } = await supabase.functions.invoke('generate-reflection', {
        body: {
          entryId: insertedEntry.id,
          goal,
          content: journalEntry,
        },
      });

      if (reflectionError) {
        throw reflectionError;
      }

      const reflection = (reflectionData as { reflection?: string } | null)?.reflection;

      setAiResponse(
        reflection?.trim() ?? 'AI reflection generated successfully, but no content was returned from the function.',
      );
      setStatus('success');
      setFeedback('Reflection generated successfully.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We hit an unexpected issue generating the reflection.';
      setFeedback(message);
      setStatus('error');
    }
  }, [goal, journalEntry, supabase, supabaseConfigured]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-10 px-4 py-12">
      <header className="max-w-2xl text-center">
        <h1 className="text-3xl font-semibold">Mindful Journal</h1>
        <p className="mt-4 text-base text-slate-600">
          Capture a goal, reflect in your journal, then generate an AI reflection to discover trends and next steps.
          Ensure you are signed in so entries can be saved to Supabase.
        </p>
      </header>

      <section className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="goal">
            Goal
          </label>
          <input
            id="goal"
            type="text"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="What outcome are you aiming for?"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="journal-entry">
            Journal Entry
          </label>
          <textarea
            id="journal-entry"
            value={journalEntry}
            onChange={(event) => setJournalEntry(event.target.value)}
            placeholder="Capture what happened today, how you felt, and anything that stood out."
            rows={8}
            className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">AI Reflection</p>
              <p className="text-xs text-slate-500">Results populate here after generating with your current entry.</p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {status === 'reflecting' ? 'Generating...' : status === 'saving' ? 'Saving entry…' : 'Generate Reflection'}
            </button>
          </div>
          <textarea
            value={aiResponse}
            readOnly
            placeholder="AI reflection will appear here after you generate one."
            rows={6}
            className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-700 focus:outline-none"
          />
        </div>

        {feedback && (
          <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{feedback}</p>
        )}
      </section>
    </main>
  );
}
