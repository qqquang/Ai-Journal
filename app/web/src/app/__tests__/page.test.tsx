import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import Home from '../page';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key';

const globalConsoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

jest.mock('@/lib/supabaseClient', () => ({
  createSupabaseBrowserClient: jest.fn(),
  supabaseEnvReady: true,
}));

const createSupabaseBrowserClientMock = createSupabaseBrowserClient as jest.Mock;

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
  const draftMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const draftEq = jest.fn().mockReturnValue({ maybeSingle: draftMaybeSingle });
  const draftSelect = jest.fn().mockReturnValue({ eq: draftEq });
  const draftUpsert = jest.fn().mockResolvedValue({ data: null, error: null });

  const from = jest.fn((table: string) => {
    if (table === 'journal_entries') {
      return { insert: insertJournal };
    }

    if (table === 'entry_insights') {
      return { insert: insertInsight };
    }

    if (table === 'journal_drafts') {
      return {
        select: draftSelect,
        upsert: draftUpsert,
      };
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
    __internals: {
      draftMaybeSingle,
      draftEq,
      draftSelect,
      draftUpsert,
    },
  };
};

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  afterAll(() => {
    globalConsoleWarnSpy.mockRestore();
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

    const goalInput = screen.getByLabelText(/daily goals/i);
    const entryInput = screen.getAllByLabelText(/journal entry/i)[0];
    const generateButton = screen.getAllByRole('button', { name: /generate reflection/i })[0];
    await waitFor(() => {
      expect(generateButton).not.toBeDisabled();
    });
    await waitFor(() => {
      expect(generateButton).not.toBeDisabled();
    });

    await user.type(goalInput, 'Ship the MVP');
    await user.click(screen.getByRole('button', { name: /add goal/i }));
    expect(await screen.findByRole('checkbox', { name: /ship the mvp/i })).toBeInTheDocument();
    await user.type(entryInput, 'Today I validated Gemini reflections.');
    await user.click(generateButton);

    const aiTextarea = (
      await screen.findAllByPlaceholderText(/AI reflection will appear here after you generate one./i)
    )[0];

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

  it('allows adding additional story entries', async () => {
    const session = {
      user: {
        id: 'user-456',
        email: 'journaler@example.com',
      },
    } as unknown as Session;
    const supabase = createSupabaseStub({ session });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    render(<Home />);

    expect(screen.getAllByLabelText(/journal entry/i)).toHaveLength(1);

    const addStoryButton = screen.getByRole('button', { name: /add another entry/i });
    const user = userEvent.setup();
    await user.click(addStoryButton);

    expect(screen.getAllByLabelText(/journal entry/i)).toHaveLength(2);
    expect(screen.getByDisplayValue(/Story 2/i)).toBeInTheDocument();
  });

  it('supports deleting additional stories while keeping the initial one', async () => {
    const session = {
      user: {
        id: 'user-789',
        email: 'author@example.com',
      },
    } as unknown as Session;
    const supabase = createSupabaseStub({ session });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    render(<Home />);

    const storyMenuButton = screen.getByRole('button', { name: /open story menu/i });
    const user = userEvent.setup();
    await user.click(storyMenuButton);

    const deleteButton = await screen.findByRole('button', { name: /delete story/i });
    expect(deleteButton).toBeDisabled();

    await user.click(storyMenuButton); // close menu

    await user.click(screen.getByRole('button', { name: /add another entry/i }));

    const menus = screen.getAllByRole('button', { name: /open story menu/i });
    await user.click(menus[1]);
    const deleteSecond = await screen.findByRole('button', { name: /delete story/i });
    expect(deleteSecond).not.toBeDisabled();
    await user.click(deleteSecond);

    expect(screen.getAllByLabelText(/journal entry/i)).toHaveLength(1);
  });

  it('closes the account menu when clicking outside', async () => {
    const supabase = createSupabaseStub({ session: null });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    render(<Home />);

    const accountButton = screen.getByLabelText(/account menu/i);
    const user = userEvent.setup();
    await user.click(accountButton);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });
  });

  it('prevents reflection generation when the journal entry is empty', async () => {
    const session = {
      user: {
        id: 'user-321',
        email: 'author@example.com',
      },
    } as unknown as Session;
    const supabase = createSupabaseStub({ session });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    render(<Home />);

    const generateButton = screen.getAllByRole('button', { name: /generate reflection/i })[0];
    const user = userEvent.setup();
    await user.click(generateButton);

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('resets the goal completion checkbox at midnight', async () => {
    jest.useFakeTimers();

    const supabase = createSupabaseStub({ session: null });
    createSupabaseBrowserClientMock.mockReturnValue(supabase);

    const user = userEvent.setup({
      advanceTimers: (ms) => {
        jest.advanceTimersByTime(ms);
      },
    });

    try {
      render(<Home />);

      const goalInput = screen.getByLabelText(/daily goals/i);
      await user.type(goalInput, 'Practice gratitude');
      await user.click(screen.getByRole('button', { name: /add goal/i }));

      const completionCheckbox = await screen.findByRole('checkbox', { name: /practice gratitude/i });
      await user.click(completionCheckbox);
      expect(completionCheckbox).toBeChecked();

      act(() => {
        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      });

      expect(completionCheckbox).not.toBeChecked();
    } finally {
      jest.useRealTimers();
    }
  });
});
