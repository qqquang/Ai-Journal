import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Session } from '@supabase/supabase-js';
import type { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const testStubEnabled = process.env.NEXT_PUBLIC_SUPABASE_TEST_STUB === '1';

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

const createStubSession = (): Session => {
  const now = new Date().toISOString();
  return {
    access_token: 'stub-access-token',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    provider_token: null,
    provider_refresh_token: null,
    user: {
      id: 'stub-user-id',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'stub-user@example.com',
      email_confirmed_at: now,
      phone: '',
      confirmation_sent_at: now,
      confirmed_at: now,
      last_sign_in_at: now,
      created_at: now,
      updated_at: now,
      factors: [],
      identities: [],
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      otp_hash: null,
    },
  } as Session;
};

const createSupabaseTestStub = () => {
  const session = createStubSession();
  const reflectionPayload = {
    reflection: 'Stubbed reflection generated for Playwright tests.',
    action: 'Celebrate a small win today.',
  };

  return {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(_callback: (event: string, value: Session | null) => void) {
        return {
          data: {
            subscription: {
              unsubscribe() {
                return;
              },
            },
          },
        };
      },
      async signInWithPassword() {
        return { data: { session }, error: null };
      },
      async signUp() {
        return { data: { session }, error: null };
      },
      async signInWithOtp() {
        return { data: { session }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
    from(table: string) {
      if (table === 'journal_entries') {
        return {
          insert() {
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'stub-entry-id' }, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'entry_insights') {
        return {
          async insert() {
            return { error: null };
          },
        };
      }

      if (table === 'journal_drafts') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { goals: null }, error: null };
                  },
                };
              },
            };
          },
          async upsert() {
            return { data: null, error: null };
          },
        };
      }

      return {
        async insert() {
          return { data: null, error: null };
        },
        async upsert() {
          return { data: null, error: null };
        },
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
    functions: {
      async invoke(_name: string, _args?: unknown) {
        return { data: reflectionPayload, error: null };
      },
    },
  } as ReturnType<typeof createBrowserClient>;
};

export const supabaseEnvReady =
  testStubEnabled || (isValidHttpUrl(supabaseUrl) && Boolean(supabaseAnonKey));

if (!testStubEnabled && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('Supabase environment variables are not set. Client calls will fail until configured.');
}

export const createSupabaseBrowserClient = () => {
  if (!supabaseEnvReady) {
    throw new Error('Supabase environment variables are not configured.');
  }

  if (testStubEnabled) {
    return createSupabaseTestStub();
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};

export const createSupabaseServerClient = (cookieStore: ReturnType<typeof cookies>) => {
  if (testStubEnabled) {
    return createSupabaseTestStub();
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
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
};
