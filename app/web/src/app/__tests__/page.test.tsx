import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import Home from '../page';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient', () => ({
  createSupabaseBrowserClient: jest.fn(),
  supabaseEnvReady: true,
}));

type ReflectionOverrides = {
  reflection?: string;
  action?: string;
};

type SupabaseOverrides = {
  session: Session | null;
} & ReflectionOverrides;

const createSupabaseStub = ({ session, reflection, action }: SupabaseOverrides) => {
  const journalSingle = jest.fn().mockResolvedValue({ data: { id: 'entry-123' }, error: null });
  const journalSelect = jest.fn().mockReturnValue({ single: journalSingle });
  const insertJournal = jest.fn().mockReturnValue({ select: journalSelect });
  const insertInsight = jest.fn().mockResolvedValue({ error: null });

  const from = jest.fn((table: string) => {
    if (table === 'journal_entries') {
      return { insert: insertJournal };
    }

    if (table === 'entry_insights') {
      return { insert: insertInsight };
    }

    return {
      insert: jest.fn(),
      select: jest.fn(),
    };
  });

  const invoke = jest.fn().mockResolvedValue({
    data: {
      reflection: reflection ?? 'AI reflection body',
      action: action ?? 'AI action next step',
    },
    error: null,
  });

  const subscription = { unsubscribe: jest.fn() };

  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: jest.fn().mockImplementation((callback) => {
        const handler = typeof callback === 'function' ? callback : arguments[1];
        if (typeof handler === 'function') {
          handler('SIGNED_IN', session);
        }
        return { data: { subscription } };
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from,
    functions: {
      invoke,
    },
  };
};

const createSupabaseBrowserClientMock = createSupabaseBrowserClient as jest.Mock;

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('disables reflection generation when the user is signed out', async () => {
    const supabase = createSupabaseStub({ session: null });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    render(<Home />);

    expect(
      screen.getByRole('button', { name: /sign in to generate/i }),
    ).toBeDisabled();
    const accountButton = screen.getByLabelText(/account menu/i);
    expect(accountButton).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(accountButton);
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByText(/sign in, capture a goal, and write an entry/i),
    ).toBeInTheDocument();
  });

  it('persists the journal entry and shows the AI reflection for signed-in users', async () => {
    const session = {
      user: {
        id: 'user-123',
        email: 'journaler@example.com',
      },
    } as unknown as Session;
    const supabase = createSupabaseStub({
      session,
      reflection: 'Gemini says you are on track.',
      action: 'Celebrate this momentum with a short note tomorrow.',
    });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    render(<Home />);

    const accountButton = screen.getByLabelText(/account menu/i);
    const user = userEvent.setup();
    await user.click(accountButton);

    expect(await screen.findByText(/Signed in as journaler@example.com/i)).toBeInTheDocument();

    const goalInput = screen.getByLabelText(/goal/i);
    const entryInput = screen.getByLabelText(/journal entry/i);
    const generateButton = screen.getByRole('button', { name: /generate reflection/i });

    await user.type(goalInput, 'Ship the MVP');
    await user.type(entryInput, 'Today I validated Gemini reflections.');
    await user.click(generateButton);

    const aiTextarea = await screen.findByPlaceholderText(
      /AI reflection will appear here after you generate one./i,
    );

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    expect(aiTextarea).toHaveValue(
      'Gemini says you are on track.\n\nNext step: Celebrate this momentum with a short note tomorrow.',
    );

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'generate-reflection',
      expect.objectContaining({
        body: expect.objectContaining({
          goal: 'Ship the MVP',
          content: 'Today I validated Gemini reflections.',
        }),
      }),
    );
  });
});
