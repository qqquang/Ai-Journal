import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type FlowStatus = 'idle' | 'saving' | 'reflecting' | 'success' | 'error';
type AuthStatus = 'idle' | 'loading' | 'success' | 'error';

const INITIAL_FEEDBACK = 'Sign in, capture a goal, and write an entry to generate a reflection.';

export default function App() {
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
  const [authExpanded, setAuthExpanded] = useState(false);

  const supabaseConfigured = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
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
  }, []);

  useEffect(() => {
    if (session) {
      setAuthMessage(null);
      setAuthStatus('idle');
      setMagicLinkSent(false);
      setFeedback(null);
      setAuthExpanded(false);
    } else {
      setFeedback(INITIAL_FEEDBACK);
      setAuthExpanded(false);
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
      setAuthExpanded(false);
    } catch (error) {
      handleAuthError(error, 'Unable to sign in with those credentials.');
    }
  }, [authEmail, authPassword, handleAuthError]);

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
  }, [authEmail, authPassword, handleAuthError]);

  const handleMagicLink = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
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
  }, [authEmail, handleAuthError]);

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
      setAuthExpanded(false);
    } catch (error) {
      handleAuthError(error, 'Unable to sign out at the moment.');
    }
  }, [handleAuthError]);

  const handleGenerate = useCallback(async () => {
    if (!supabaseConfigured) {
      setFeedback('Supabase environment variables are missing. Update app/mobile/.env before generating reflections.');
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
  }, [goal, journalEntry, session, supabaseConfigured]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Journal Companion</Text>
          <Text style={styles.subtitle}>
            Capture your goal, reflect on your day, then generate an AI reflection to highlight patterns and next steps.
          </Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.authHeader}>
            <View style={styles.flexColumn}>
              <Text style={styles.authTitle}>Account</Text>
              <Text style={styles.authSubtitle}>
                {session
                  ? `Signed in as ${session.user.email ?? 'your account'}.`
                  : 'Sign in to save journal entries and generate reflections.'}
              </Text>
            </View>
            <View style={styles.authActionsRow}>
              {!session && (
                <TouchableOpacity
                  onPress={() => setAuthExpanded((prev) => !prev)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonLabel}>
                    {authExpanded ? 'Hide account actions' : 'Show account actions'}
                  </Text>
                </TouchableOpacity>
              )}
              {session ? (
                <TouchableOpacity
                  onPress={handleSignOut}
                  disabled={isAuthLoading}
                  style={[styles.signOutButton, isAuthLoading && styles.buttonDisabled]}
                >
                  <Text style={styles.signOutButtonLabel}>Sign out</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {!session && authExpanded ? (
            <View style={styles.authForm}>
              <View style={styles.authInputsRow}>
                <View style={styles.flexColumn}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    value={authEmail}
                    onChangeText={setAuthEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.singleLineInput}
                  />
                </View>
                <View style={styles.flexColumn}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    value={authPassword}
                    onChangeText={setAuthPassword}
                    placeholder="Choose a secure password"
                    secureTextEntry
                    autoCapitalize="none"
                    style={styles.singleLineInput}
                  />
                </View>
              </View>

              <View style={styles.authButtonsRow}>
                <TouchableOpacity
                  onPress={handleSignIn}
                  disabled={isAuthLoading}
                  style={[styles.primaryButton, isAuthLoading && styles.buttonDisabled]}
                >
                  <Text style={styles.primaryButtonLabel}>Sign in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSignUp}
                  disabled={isAuthLoading}
                  style={[styles.secondaryButton, isAuthLoading && styles.buttonDisabled]}
                >
                  <Text style={styles.secondaryButtonLabel}>Sign up</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleMagicLink}
                  disabled={isAuthLoading || magicLinkSent}
                  style={[styles.secondaryButton, (isAuthLoading || magicLinkSent) && styles.buttonDisabled]}
                >
                  <Text style={styles.secondaryButtonLabel}>
                    {magicLinkSent ? 'Magic link sent' : 'Send magic link'}
                  </Text>
                </TouchableOpacity>
              </View>

              {authMessage ? (
                <Text style={[styles.feedback, authStatus === 'error' ? styles.error : styles.success]}>
                  {authMessage}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Goal</Text>
          <TextInput
            value={goal}
            onChangeText={setGoal}
            placeholder="What outcome are you aiming for?"
            style={styles.singleLineInput}
            autoCapitalize="sentences"
            autoCorrect
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Journal Entry</Text>
          <TextInput
            value={journalEntry}
            onChangeText={setJournalEntry}
            placeholder="Capture what happened today, how you felt, and anything that stood out."
            style={styles.multilineInput}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.aiContainer}>
          <View style={styles.aiHeader}>
            <View>
              <Text style={styles.aiTitle}>AI Reflection</Text>
              <Text style={styles.aiHint}>Results populate here after generating with your current entry.</Text>
            </View>
            <TouchableOpacity
              onPress={handleGenerate}
              disabled={isGenerating || !session}
              style={[styles.generateButton, (isGenerating || !session) && styles.generateButtonDisabled]}
            >
              <Text style={styles.generateButtonLabel}>
                {status === 'reflecting'
                  ? 'Generating...'
                  : status === 'saving'
                  ? 'Saving entry...'
                  : session
                  ? 'Generate Reflection'
                  : 'Sign in to generate'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={aiResponse}
            editable={false}
            placeholder="AI reflection will appear here after you generate one."
            style={styles.aiTextArea}
            multiline
            textAlignVertical="top"
          />
        </View>

        {feedback ? (
          <Text style={[styles.feedback, status === 'error' ? styles.error : styles.success]}>{feedback}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContainer: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
  },
  header: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  authCard: {
    gap: 16,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 20,
  },
  authHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  authActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flexColumn: {
    flex: 1,
  },
  authTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  authSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  signOutButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  authForm: {
    gap: 16,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  authInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
    marginBottom: 6,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  singleLineInput: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multilineInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 22,
    backgroundColor: '#fff',
  },
  authButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryButtonLabel: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  aiContainer: {
    gap: 12,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 16,
    backgroundColor: '#eef2ff',
    padding: 16,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  aiHint: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  generateButton: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  aiTextArea: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 22,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  feedback: {
    fontSize: 14,
    textAlign: 'center',
  },
  error: {
    color: '#dc2626',
  },
  success: {
    color: '#16a34a',
  },
});
