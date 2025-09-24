'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient, supabaseEnvReady } from '@/lib/supabaseClient';

type FlowStatus = 'idle' | 'saving' | 'reflecting' | 'success' | 'error';
type AuthStatus = 'idle' | 'loading' | 'success' | 'error';

const INITIAL_FEEDBACK = 'Sign in, capture a goal, and write an entry to generate a reflection.';

type GoalItem = {
  id: string;
  text: string;
  completed: boolean;
};

type StoryEntry = {
  id: string;
  title: string;
  journalEntry: string;
  aiResponse: string;
  createdAt: string | null;
};

type DailyGoalsState = {
  date: string;
  goals: GoalItem[];
  stories: StoryEntry[];
};

type SupabaseSessionResponse = {
  data: { session: Session | null } | null;
  error: unknown;
};

const getTodayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const getMsUntilNextMidnight = () => {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return nextMidnight.getTime() - now.getTime();
};

const createGoalId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const createStoryId = () => `${Date.now()}-story-${Math.random().toString(16).slice(2, 8)}`;

const createStory = (id: string, createdAt: string | null, title = ''): StoryEntry => ({
  id,
  title,
  journalEntry: '',
  aiResponse: '',
  createdAt,
});

const INITIAL_STORY_ID = 'story-initial';

const createInitialStory = (): StoryEntry => createStory(INITIAL_STORY_ID, null, "Today's Story");

const createEmptyStory = (title?: string): StoryEntry =>
  createStory(createStoryId(), new Date().toISOString(), title ?? '');

const cloneGoals = (goals: GoalItem[]) => goals.map((goal) => ({ ...goal }));
const cloneStories = (stories: StoryEntry[]) => stories.map((story) => ({ ...story }));

const AUTO_GENERATE_DELAY_MS = 1500;

const normalizeGoalsFromDraft = (raw: unknown): DailyGoalsState => {
  const todayKey = getTodayKey();
  if (!raw || typeof raw !== 'object') {
    return { date: todayKey, goals: [], stories: [createInitialStory()] };
  }

  const value = raw as Partial<DailyGoalsState> & { goals?: unknown; stories?: unknown };
  const parsedGoals = Array.isArray(value.goals)
    ? value.goals
        .map((goal) => {
          if (!goal || typeof goal !== 'object') {
            return null;
          }
          const goalValue = goal as Partial<GoalItem>;
          const text = typeof goalValue.text === 'string' ? goalValue.text : '';
          return {
            id: typeof goalValue.id === 'string' ? goalValue.id : createGoalId(),
            text,
            completed: Boolean(goalValue.completed),
          } satisfies GoalItem;
        })
        .filter((goalItem): goalItem is GoalItem => Boolean(goalItem))
    : [];

  const parsedStories = Array.isArray(value.stories)
    ? value.stories
        .map((story) => {
          if (!story || typeof story !== 'object') {
            return null;
          }
          const storyValue = story as Partial<StoryEntry>;
          return {
            id: typeof storyValue.id === 'string' ? storyValue.id : createStoryId(),
            title: typeof storyValue.title === 'string' ? storyValue.title : '',
            journalEntry: typeof storyValue.journalEntry === 'string' ? storyValue.journalEntry : '',
            aiResponse: typeof storyValue.aiResponse === 'string' ? storyValue.aiResponse : '',
            createdAt: typeof storyValue.createdAt === 'string' ? storyValue.createdAt : null,
          } satisfies StoryEntry;
        })
        .filter((storyItem): storyItem is StoryEntry => Boolean(storyItem))
    : [];

  const stories = parsedStories.length > 0 ? parsedStories : [createInitialStory()];

  if (value.date === todayKey) {
    return { date: todayKey, goals: parsedGoals, stories };
  }

  return {
    date: todayKey,
    goals: parsedGoals.map((goal) => ({ ...goal, completed: false })),
    stories: cloneStories(stories),
  };
};

const serializeGoalsForPersist = (state: DailyGoalsState): DailyGoalsState => ({
  date: state.date || getTodayKey(),
  goals: state.goals.map((goal) => ({
    id: goal.id,
    text: goal.text,
    completed: goal.completed,
  })),
  stories: state.stories.map((story) => ({
    id: story.id,
    title: story.title,
    journalEntry: story.journalEntry,
    aiResponse: story.aiResponse,
    createdAt: story.createdAt,
  })),
});

const formatTimestamp = (() => {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (date: Date) => {
    const dateLabel = dateFormatter.format(date).replace(/,\s*/g, ' · ');
    return `${dateLabel} · ${timeFormatter.format(date)}`;
  };
})();

const getAccountInitial = (currentSession: Session | null) => {
  const email = currentSession?.user?.email;
  if (email && email.length > 0) {
    return email.charAt(0).toUpperCase();
  }
  return 'A';
};

export default function Home() {
  const supabaseEnvConfigured = supabaseEnvReady;

  const supabase = useMemo(
    () => (supabaseEnvConfigured ? createSupabaseBrowserClient() : null),
    [supabaseEnvConfigured],
  );

  const [session, setSession] = useState<Session | null>(null);
  const [newGoalText, setNewGoalText] = useState('');
  const [dailyGoals, setDailyGoals] = useState<DailyGoalsState>(() => ({
    date: getTodayKey(),
    goals: [],
    stories: [createInitialStory()],
  }));
  const [status, setStatus] = useState<FlowStatus>('idle');
  const [feedback, setFeedback] = useState<string | null>(INITIAL_FEEDBACK);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => new Date());

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const goalResetTimeoutRef = useRef<number | null>(null);
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const draftInitializedRef = useRef(false);
  const skipNextDraftSaveRef = useRef(false);
  const [openStoryMenuId, setOpenStoryMenuId] = useState<string | null>(null);
  const [storyStatuses, setStoryStatuses] = useState<Record<string, FlowStatus>>({});
  const autoGenerateTimersRef = useRef<Record<string, number>>({});
  const pendingAutoGenerationRef = useRef<Record<string, string>>({});
  const lastGeneratedContentRef = useRef<Record<string, string>>({});

  const isAuthLoading = authStatus === 'loading';
  const hasGoals = dailyGoals.goals.length > 0;
  const formattedTimestamp = useMemo(() => formatTimestamp(currentTimestamp), [currentTimestamp]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(new Date());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => () => {
    Object.values(autoGenerateTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
  }, []);

  useEffect(() => {
    if (!session) {
      if (draftSaveTimeoutRef.current) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
      draftInitializedRef.current = false;
      skipNextDraftSaveRef.current = false;
    }
  }, [session]);

  useEffect(() => {
    setDailyGoals((previous) => {
      let updated = false;
      const nextStories = previous.stories.map((story) => {
        if (story.createdAt) {
          return story;
        }
        updated = true;
        return { ...story, createdAt: new Date().toISOString() };
      });
      if (!updated) {
        return previous;
      }
      return {
        date: previous.date,
        goals: cloneGoals(previous.goals),
        stories: nextStories,
      };
    });
  }, []);

  useEffect(() => {
    if (!openStoryMenuId) {
      return;
    }

    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-story-menu-root="true"]')) {
        return;
      }
      setOpenStoryMenuId(null);
    };

    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [openStoryMenuId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const scheduleReset = () => {
      const timeoutMs = getMsUntilNextMidnight();
      goalResetTimeoutRef.current = window.setTimeout(() => {
        setDailyGoals((previous) => ({
          date: getTodayKey(),
          goals: previous.goals.map((goal) => ({ ...goal, completed: false })),
          stories: cloneStories(previous.stories),
        }));
        setStoryStatuses({});
        scheduleReset();
      }, Math.max(timeoutMs, 0));
    };

    scheduleReset();

    return () => {
      if (goalResetTimeoutRef.current) {
        window.clearTimeout(goalResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session || !draftInitializedRef.current) {
      return;
    }

    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }

    if (draftSaveTimeoutRef.current) {
      window.clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = window.setTimeout(() => {
      draftSaveTimeoutRef.current = null;
      const goalsToPersist = serializeGoalsForPersist(dailyGoals);

      void supabase
        .from('journal_drafts')
        .upsert(
          {
            user_id: session.user.id,
            goals: goalsToPersist,
          },
          { onConflict: 'user_id' },
        )
        .then(({ error }: { error: unknown }) => {
          if (error) {
            console.error('Failed to save journal draft', error);
          }
        })
        .catch((error: unknown) => {
          console.error('Unexpected error saving journal draft', error);
        });
    }, 600);

    return () => {
      if (draftSaveTimeoutRef.current) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [dailyGoals, supabase, session]);

  const handleGoalToggle = useCallback((goalId: string) => {
    const todayKey = getTodayKey();
    setDailyGoals((previous) => {
      const baseGoals =
        previous.date === todayKey
          ? previous.goals
          : previous.goals.map((goal) => ({ ...goal, completed: false }));
      const baseStories = cloneStories(previous.stories);

      const nextGoals = baseGoals.map((goal) =>
        goal.id === goalId ? { ...goal, completed: !goal.completed } : goal,
      );

      return {
        date: todayKey,
        goals: nextGoals,
        stories: baseStories,
      };
    });
  }, []);

  const handleAddGoal = useCallback(() => {
    const trimmed = newGoalText.trim();
    if (!trimmed) {
      return;
    }

    setDailyGoals((previous) => {
      const todayKey = getTodayKey();
      const nextGoal: GoalItem = {
        id: createGoalId(),
        text: trimmed,
        completed: false,
      };

      return {
        date: todayKey,
        goals: [...cloneGoals(previous.goals), nextGoal],
        stories: cloneStories(previous.stories),
      };
    });
    setNewGoalText('');
  }, [newGoalText]);

  const handleAddStory = useCallback(() => {
    const todayKey = getTodayKey();
    setDailyGoals((previous) => ({
      date: todayKey,
      goals: cloneGoals(previous.goals),
      stories: [
        createEmptyStory(`Story ${previous.stories.length + 1}`),
        ...cloneStories(previous.stories),
      ],
    }));
    setOpenStoryMenuId(null);
    setStoryStatuses((previous) => ({ ...previous }));
  }, []);

  const handleStoryTitleChange = useCallback((storyId: string, value: string) => {
    const todayKey = getTodayKey();
    setDailyGoals((previous) => ({
      date: todayKey,
      goals: cloneGoals(previous.goals),
      stories: previous.stories.map((story) =>
        story.id === storyId ? { ...story, title: value } : { ...story },
      ),
    }));
  }, []);

  const handleJournalEntryChange = useCallback((storyId: string, value: string) => {
    const todayKey = getTodayKey();
    setDailyGoals((previous) => ({
      date: todayKey,
      goals: cloneGoals(previous.goals),
      stories: previous.stories.map((story) =>
        story.id === storyId ? { ...story, journalEntry: value } : { ...story },
      ),
    }));

    const existingTimer = autoGenerateTimersRef.current[storyId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete autoGenerateTimersRef.current[storyId];
    }
    delete pendingAutoGenerationRef.current[storyId];
    delete lastGeneratedContentRef.current[storyId];

    setStoryStatuses((previous) => {
      const nextStatuses = { ...previous };
      delete nextStatuses[storyId];
      return nextStatuses;
    });
  }, []);

  const handleApplyAiResponse = useCallback((storyId: string, response: string) => {
    const todayKey = getTodayKey();
    setDailyGoals((previous) => ({
      date: todayKey,
      goals: cloneGoals(previous.goals),
      stories: previous.stories.map((story) =>
        story.id === storyId ? { ...story, aiResponse: response } : { ...story },
      ),
    }));
  }, []);

  const handleDeleteStory = useCallback((storyId: string) => {
    setDailyGoals((previous) => {
      if (previous.stories.length <= 1) {
        return previous;
      }
      return {
        date: previous.date,
        goals: cloneGoals(previous.goals),
        stories: previous.stories.filter((story) => story.id !== storyId),
      };
    });
    setOpenStoryMenuId((current) => (current === storyId ? null : current));
    setStoryStatuses((previous) => {
      const nextStatuses = { ...previous };
      delete nextStatuses[storyId];
      return nextStatuses;
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      return () => {};
    }

    let isMounted = true;

    supabase.auth.getSession().then((result: SupabaseSessionResponse) => {
      if (!isMounted) {
        return;
      }

      const { data, error } = result;

      if (error) {
        console.error('Failed to fetch session', error);
        setSession(null);
        return;
      }

      setSession(data?.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) {
      return;
    }

    let isActive = true;

    const loadDraft = async () => {
      try {
        const { data, error } = await supabase
          .from('journal_drafts')
          .select('goals')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        if (error) {
          console.error('Failed to load journal draft', error);
        }

        if (data) {
          skipNextDraftSaveRef.current = true;
          setDailyGoals(normalizeGoalsFromDraft(data.goals));
          setStoryStatuses({});
        } else {
          skipNextDraftSaveRef.current = true;
          setDailyGoals(normalizeGoalsFromDraft(null));
          setStoryStatuses({});
        }
      } catch (error) {
        console.error('Unexpected error loading journal draft', error);
      } finally {
        if (isActive) {
          draftInitializedRef.current = true;
        }
      }
    };

    void loadDraft();

    return () => {
      isActive = false;
    };
  }, [supabase, session]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuOpen &&
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (session) {
      setAuthMessage(null);
      setAuthStatus('idle');
      setMagicLinkSent(false);
      setFeedback(null);
    } else {
      setFeedback(INITIAL_FEEDBACK);
    }
    setMenuOpen(false);
  }, [session]);

  const handleAuthError = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setAuthStatus('error');
    setAuthMessage(message);
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('error');
      setAuthMessage('Supabase environment variables are not configured.');
      return;
    }

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
      setMenuOpen(false);
    } catch (error) {
      handleAuthError(error, 'Unable to sign in with those credentials.');
    }
  }, [authEmail, authPassword, supabase, handleAuthError]);

  const handleSignUp = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('error');
      setAuthMessage('Supabase environment variables are not configured.');
      return;
    }

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
      setMenuOpen(false);
    } catch (error) {
      handleAuthError(error, 'Unable to sign up with those details.');
    }
  }, [authEmail, authPassword, supabase, handleAuthError]);

  const handleMagicLink = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('error');
      setAuthMessage('Supabase environment variables are not configured.');
      return;
    }

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
    if (!supabase) {
      setAuthStatus('error');
      setAuthMessage('Supabase environment variables are not configured.');
      return;
    }

    setAuthStatus('loading');
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setAuthStatus('success');
      setAuthMessage('Signed out successfully.');
      if (draftSaveTimeoutRef.current) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
      draftInitializedRef.current = false;
      skipNextDraftSaveRef.current = true;
      setNewGoalText('');
      setDailyGoals({ date: getTodayKey(), goals: [], stories: [createInitialStory()] });
      setStoryStatuses({});
      setMenuOpen(false);
    } catch (error) {
      handleAuthError(error, 'Unable to sign out at the moment.');
    }
  }, [supabase, handleAuthError]);

  const handleGenerate = useCallback(
    async (storyId: string) => {
      if (!supabaseEnvConfigured || !supabase) {
        setFeedback('Supabase environment variables are missing. Update .env.local before generating reflections.');
        setStatus('error');
        return;
      }

      if (!session) {
        setFeedback('Sign in to save entries and generate reflections.');
        setStatus('error');
        return;
      }

      const existingTimer = autoGenerateTimersRef.current[storyId];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        delete autoGenerateTimersRef.current[storyId];
      }
      delete pendingAutoGenerationRef.current[storyId];

      const story = dailyGoals.stories.find((entry) => entry.id === storyId);
      if (!story) {
        setFeedback('Unable to find the selected entry.');
        setStatus('error');
        return;
      }

      if (!story.journalEntry.trim()) {
        setFeedback('Add a journal entry before requesting a reflection.');
        setStatus('error');
        return;
      }

      setFeedback(null);
      setStatus('saving');
      setStoryStatuses((previous) => ({ ...previous, [storyId]: 'saving' }));

      const goalSummaries = dailyGoals.goals.map((goalItem) => goalItem.text.trim()).filter(Boolean);
      const goalsPayload = goalSummaries.join('; ');
      const trimmedEntry = story.journalEntry.trim();
      const storyTitle = story.title.trim();

      handleApplyAiResponse(storyId, '');

      try {
        const { data: insertedEntry, error: insertError } = await supabase
          .from('journal_entries')
          .insert({
            title: storyTitle || goalsPayload || null,
            content: trimmedEntry,
            user_id: session.user.id,
          })
          .select('id')
          .single();

        if (insertError || !insertedEntry) {
          throw insertError ?? new Error('Failed to record journal entry.');
        }

        setStatus('reflecting');
        setStoryStatuses((previous) => ({ ...previous, [storyId]: 'reflecting' }));

        const { data: reflectionData, error: reflectionError } = await supabase.functions.invoke(
          'generate-reflection',
          {
            body: {
              entryId: insertedEntry.id,
              goal: goalsPayload,
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

        const safeReflection = typeof reflection === 'string' ? reflection.trim() : '';
        const safeAction = typeof action === 'string' ? action.trim() : '';
        const composedReflection = [safeReflection, safeAction ? `Next step: ${safeAction}` : null]
          .filter(Boolean)
          .join('\n\n');

        handleApplyAiResponse(
          storyId,
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
        setStoryStatuses((previous) => ({ ...previous, [storyId]: 'success' }));
        lastGeneratedContentRef.current[storyId] = trimmedEntry;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'We hit an unexpected issue generating the reflection.';
        setFeedback(message);
        setStatus('error');
        setStoryStatuses((previous) => ({ ...previous, [storyId]: 'error' }));
        lastGeneratedContentRef.current[storyId] = trimmedEntry;
      }
    },
    [dailyGoals.stories, dailyGoals.goals, session, supabaseEnvConfigured, supabase, handleApplyAiResponse],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const timers = autoGenerateTimersRef.current;
    const pending = pendingAutoGenerationRef.current;
    const lastGenerated = lastGeneratedContentRef.current;
    const activeStoryIds = new Set<string>();

    dailyGoals.stories.forEach((story) => {
      activeStoryIds.add(story.id);
      const trimmedEntry = story.journalEntry.trim();

      if (story.aiResponse && trimmedEntry && !lastGenerated[story.id]) {
        lastGenerated[story.id] = trimmedEntry;
      }

      const timerId = timers[story.id];
      if (!trimmedEntry) {
        if (timerId) {
          window.clearTimeout(timerId);
          delete timers[story.id];
        }
        delete pending[story.id];
        delete lastGenerated[story.id];
        return;
      }

      if (!supabaseEnvConfigured || !supabase || !session) {
        return;
      }

      const status = storyStatuses[story.id];
      if (status === 'saving' || status === 'reflecting') {
        return;
      }

      if (pending[story.id] === trimmedEntry || lastGenerated[story.id] === trimmedEntry) {
        return;
      }

      if (timerId) {
        window.clearTimeout(timerId);
      }

      pending[story.id] = trimmedEntry;
      timers[story.id] = window.setTimeout(() => {
        delete timers[story.id];
        delete pending[story.id];
        void handleGenerate(story.id);
      }, AUTO_GENERATE_DELAY_MS);
    });

    Object.keys(timers).forEach((storyId) => {
      if (!activeStoryIds.has(storyId)) {
        window.clearTimeout(timers[storyId]);
        delete timers[storyId];
      }
    });

    Object.keys(pending).forEach((storyId) => {
      if (!activeStoryIds.has(storyId)) {
        delete pending[storyId];
      }
    });

    Object.keys(lastGenerated).forEach((storyId) => {
      if (!activeStoryIds.has(storyId)) {
        delete lastGenerated[storyId];
      }
    });
  }, [dailyGoals, supabaseEnvConfigured, supabase, session, storyStatuses, handleGenerate]);

  const accountInitial = getAccountInitial(session);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-4 py-12">
      <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <header className="max-w-2xl space-y-4">
          <h1 className="text-3xl font-semibold">Mindful Journal</h1>
          <p className="text-base text-slate-600">
            Capture a goal, reflect in your journal, then generate an AI reflection to discover trends and next steps.
            Ensure you are signed in so entries can be saved to Supabase.
          </p>
        </header>
        <div ref={menuContainerRef} className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            {session ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {accountInitial}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <UserCircleIcon className="h-6 w-6 text-slate-700" />
                <span className="hidden sm:inline">Sign in</span>
              </span>
            )}
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-30 mt-3 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
              {session ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-slate-600">
                    Signed in as {session.user.email ?? 'your account'}.
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isAuthLoading}
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSignIn();
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="account-email">
                      Email
                    </label>
                    <input
                      id="account-email"
                      type="email"
                      autoComplete="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="account-password">
                      Password
                    </label>
                    <input
                      id="account-password"
                      type="password"
                      autoComplete="current-password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="Choose a secure password"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="inline-flex flex-1 items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isAuthLoading}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={handleSignUp}
                      className="inline-flex flex-1 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isAuthLoading}
                    >
                      Sign up
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleMagicLink}
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isAuthLoading || magicLinkSent}
                  >
                    {magicLinkSent ? 'Magic link sent' : 'Send magic link'}
                  </button>
                  {authMessage ? (
                    <p className={`text-xs ${authStatus === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {authMessage}
                    </p>
                  ) : null}
                </form>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <section className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="text-sm font-medium text-slate-700">Daily Goals</p>
            <p className="text-xs text-slate-500">Map out what you want to accomplish.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="goal-input">
              Daily Goals
            </label>
            <input
              id="goal-input"
              type="text"
              value={newGoalText}
              onChange={(event) => setNewGoalText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddGoal();
                }
              }}
              placeholder="Add a goal you want to accomplish today"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddGoal}
              disabled={!newGoalText.trim()}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Add goal
            </button>
          </div>
          <div className="rounded-md border border-slate-200 bg-white">
            {hasGoals ? (
              <ul className="divide-y divide-slate-200">
                {dailyGoals.goals.map((goalItem) => (
                  <li key={goalItem.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      id={`goal-item-${goalItem.id}`}
                      type="checkbox"
                      checked={goalItem.completed}
                      onChange={() => handleGoalToggle(goalItem.id)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <label className="flex-1 text-sm text-slate-700" htmlFor={`goal-item-${goalItem.id}`}>
                      {goalItem.text}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-sm text-slate-500">No goals added for today.</p>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleAddStory}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            <span className="text-base">+</span>
            Add another entry
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {dailyGoals.stories.map((story, index) => {
            const journalInputId = `journal-entry-${story.id}`;
            const defaultStoryTitle =
              dailyGoals.stories.length > 1 ? `Story ${index + 1}` : "Today's Story";
            const storyTimestamp = story.createdAt ? formatTimestamp(new Date(story.createdAt)) : formattedTimestamp;
            const storyStatus = storyStatuses[story.id] ?? 'idle';
            const storyGenerating = storyStatus === 'saving' || storyStatus === 'reflecting';

            return (
              <div
                key={story.id}
                className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    value={story.title}
                    onChange={(event) => handleStoryTitleChange(story.id, event.target.value)}
                    placeholder={defaultStoryTitle}
                    className="flex-1 min-w-[160px] rounded-md border border-transparent bg-transparent text-sm font-semibold text-slate-800 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                    aria-label="Story title"
                  />
                  <div className="flex items-center gap-3" data-story-menu-root="true">
                    <p className="text-xs font-medium text-slate-500 whitespace-nowrap">{storyTimestamp}</p>
                    <div className="relative">
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={openStoryMenuId === story.id}
                        onClick={() =>
                          setOpenStoryMenuId((current) => (current === story.id ? null : story.id))
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900"
                      >
                        ⋮
                        <span className="sr-only">Open story menu</span>
                      </button>
                      {openStoryMenuId === story.id ? (
                        <div className="absolute right-0 z-40 mt-2 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => handleDeleteStory(story.id)}
                            disabled={dailyGoals.stories.length <= 1}
                            className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            Delete story
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor={journalInputId}>
                      Journal Entry
                    </label>
                    <textarea
                      id={journalInputId}
                      value={story.journalEntry}
                      onChange={(event) => handleJournalEntryChange(story.id, event.target.value)}
                      placeholder="Capture what happened today, how you felt, and anything that stood out."
                      rows={8}
                      className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="border-t border-slate-200" />
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium text-slate-700">AI Reflection</p>
                    </div>
                    <textarea
                      value={story.aiResponse}
                      readOnly
                      placeholder="AI reflection will appear here after you generate one."
                      rows={6}
                      className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-700 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Generate to see how the AI reframes your entry into insights and next steps.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void handleGenerate(story.id);
                    }}
                    disabled={storyGenerating || !session}
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {storyStatus === 'reflecting'
                      ? 'Generating...'
                      : storyStatus === 'saving'
                      ? 'Saving entry…'
                      : session
                      ? 'Generate Reflection'
                      : 'Sign in to generate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {feedback && (
          <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{feedback}</p>
        )}
      </section>
    </main>
  );
}
