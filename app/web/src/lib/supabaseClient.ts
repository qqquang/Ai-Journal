import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import type { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const isValidHttpUrl = (value: string) => {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const supabaseEnvReady = isValidHttpUrl(supabaseUrl) && Boolean(supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Client calls will fail until configured.');
}

export const createSupabaseBrowserClient = () => {
  if (!supabaseEnvReady) {
    throw new Error('Supabase environment variables are not configured.');
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};

export const createSupabaseServerClient = (cookieStore: ReturnType<typeof cookies>) =>
  createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: '', ...options });
      },
    },
  });
