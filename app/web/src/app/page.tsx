'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

type FlowStatus = 'idle' | 'saving' | 'reflecting' | 'success' | 'error';
type AuthStatus = 'idle' | 'loading' | 'success' | 'error';

const INITIAL_FEEDBACK = 'Sign in, capture a goal, and write an entry to generate a reflection.';

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [goal, setGoal] = useState('');
  const [journalEntry, setJournalEntry] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [status, setStatus] = useState<FlowStatus>('idle');
  const [feedback, setFeedback] = useState<string | null>(INITIAL_FEEDBACK);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const isGenerating = status === 'saving' || status === 'reflecting';
  const isAuthLoading = authStatus === 'loading';

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Failed to fetch session', error);
        setSession(null);
        return;
      }

      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (session) {
      setAuthMessage(null);
      setAuthStatus('idle');
      setMagicLinkSent(false);
      setFeedback(null);
    } else {
      setFeedback(INITIAL_FEEDBACK);
    }
  }, [session]);

  const handleAuthError = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setAuthStatus('error');
    setAuthMessage(message);
  }, []);

  const handleSignIn = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) {
        throw error;
      }
      setAuthStatus('success');
      setAuthMessage('Signed in successfully.');
      setAuthPassword('');
    } catch (error) {
      handleAuthError(error, 'Unable to sign in with those credentials.');
    }
  }, [authEmail, authPassword, supabase, handleAuthError]);

  const handleSignUp = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) {
        throw error;
      }
      setAuthStatus('success');
      setAuthMessage('Account created. Check your inbox for a confirmation email.');
      setAuthPassword('');
    } catch (error) {
      handleAuthError(error, 'Unable to sign up with those details.');
    }
  }, [authEmail, authPassword, supabase, handleAuthError]);

  const handleMagicLink = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          shouldCreateUser: true,
        },
      });
      if (error) {
        throw error;
      }
      setAuthStatus('success');
      setMagicLinkSent(true);
      setAuthMessage('Magic link sent. Check your email to finish signing in.');
    } catch (error) {
      handleAuthError(error, 'Unable to send a magic link right now.');
    }
  }, [authEmail, supabase, handleAuthError]);

  const handleSignOut = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setAuthStatus('success');
      setAuthMessage('Signed out successfully.');
      setGoal('');
      setJournalEntry('');
      setAiResponse('');
    } catch (error) {
      handleAuthError(error, 'Unable to sign out at the moment.');
    }
  }, [supabase, handleAuthError]);

  const handleGenerate = useCallback(async () => {
    if (!supabaseConfigured) {
      setFeedback('Supabase environment variables are missing. Update .env.local before generating reflections.');
      setStatus('error');
      return;
    }

    if (!session) {
      setFeedback('Sign in to save entries and generate reflections.');
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

    const trimmedGoal = goal.trim();
    const trimmedEntry = journalEntry.trim();

    try {
      const { data: insertedEntry, error: insertError } = await supabase
        .from('journal_entries')
        .insert({
          title: trimmedGoal || null,
          content: trimmedEntry,
          user_id: session.user.id,
        })
        .select('id')
        .single();

      if (insertError || !insertedEntry) {
        throw insertError ?? new Error('Failed to record journal entry.');
      }

      setStatus('reflecting');

      const { data: reflectionData, error: reflectionError } = await supabase.functions.invoke(
        'generate-reflection',
        {
          body: {
            entryId: insertedEntry.id,
            goal: trimmedGoal,
            content: trimmedEntry,
          },
        },
      );

      if (reflectionError) {
        throw reflectionError;
      }

      const { reflection, action } = (reflectionData ?? {}) as {
        reflection?: string;
        action?: string;
      };

      const composedReflection = [reflection?.trim(), action?.trim() ? `Next step: ${action.trim()}` : null]
        .filter(Boolean)
        .join('\n\n');

      setAiResponse(
        composedReflection ||
          'AI reflection generated successfully, but no content was returned from the function.',
      );

      if (reflection) {
        const { error: insightError } = await supabase.from('entry_insights').insert({
          entry_id: insertedEntry.id,
          insight_type: 'reflection',
          payload: { reflection, action },
        });

        if (insightError) {
          console.warn('Reflection generated but failed to store insight.', insightError.message);
        }
      }

      setStatus('success');
      setFeedback('Reflection generated successfully.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We hit an unexpected issue generating the reflection.';
      setFeedback(message);
      setStatus('error');
    }
  }, [goal, journalEntry, session, supabaseConfigured, supabase]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-10 px-4 py-12">
      <header className="max-w-2xl text-center">
        <h1 className="text-3xl font-semibold">Mindful Journal</h1>
        <p className="mt-4 text-base text-slate-600">
          Capture a goal, reflect in your journal, then generate an AI reflection to discover trends and next steps.
        </p>
      </header>

      <section className="flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Account</h2>
            <p className="text-sm text-slate-600">
              {session
                ? `Signed in as ${session.user.email ?? 'your account'}.`
                : 'Sign in to save journal entries and generate reflections.'}
            </p>
          </div>
          {session ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isAuthLoading}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign out
            </button>
          ) : null}
        </div>

        {!session ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="auth-email">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete="current-password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Choose a secure password"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={handleSignUp}
                disabled={isAuthLoading}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign up
              </button>
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={isAuthLoading || magicLinkSent}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {magicLinkSent ? 'Magic link sent' : 'Send magic link'}
              </button>
            </div>

            {authMessage ? (
              <p className={`text-sm ${authStatus === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{authMessage}</p>
            ) : null}
          </div>
        ) : null}
      </section>

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
              disabled={isGenerating || !session}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {status === 'reflecting'
                ? 'Generating...'
                : status === 'saving'
                ? 'Saving entry…'
                : session
                ? 'Generate Reflection'
                : 'Sign in to generate'}
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
