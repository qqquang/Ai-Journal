'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<'idle' | 'testing' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState('Supabase client is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');

  const handleTestConnection = async () => {
    setStatus('testing');
    try {
      const { error } = await supabase.from('healthcheck').select('*').limit(1);
      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }
      setStatus('success');
      setMessage('Connected successfully. Ensure the healthcheck table exists or adjust the query.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">Mindful Journal Web Shell</h1>
      <p className="text-slate-600">
        This shell renders the journaling canvas and dashboards. Configure Supabase environment variables inside
        <code className="mx-1 rounded bg-slate-100 px-1">.env.local</code> to enable authenticated features.
      </p>
      <button
        type="button"
        onClick={handleTestConnection}
        className="rounded-md bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-700"
      >
        {status === 'testing' ? 'Testing...' : 'Test Supabase Connection'}
      </button>
      <p
        className={`max-w-xl text-sm ${status === 'error' ? 'text-red-600' : status === 'success' ? 'text-emerald-600' : 'text-slate-500'}`}
      >
        {message}
      </p>
    </main>
  );
}
