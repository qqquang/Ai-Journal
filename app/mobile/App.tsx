import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './lib/supabase';

enum Status {
  Idle = 'idle',
  Saving = 'saving',
  Reflecting = 'reflecting',
  Success = 'success',
  Error = 'error',
}

export default function App() {
  const [goal, setGoal] = useState('');
  const [journalEntry, setJournalEntry] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [status, setStatus] = useState<Status>(Status.Idle);
  const [feedback, setFeedback] = useState<string | null>(
    'Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in app/mobile/.env to enable API calls.',
  );

  const isGenerating = status === Status.Saving || status === Status.Reflecting;
  const supabaseConfigured = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );

  const handleGenerate = useCallback(async () => {
    if (!supabaseConfigured) {
      setFeedback('Supabase environment variables are missing. Update app/mobile/.env before generating reflections.');
      setStatus(Status.Error);
      return;
    }

    if (!journalEntry.trim()) {
      setFeedback('Add a journal entry before requesting a reflection.');
      setStatus(Status.Error);
      return;
    }

    setFeedback(null);
    setAiResponse('');
    setStatus(Status.Saving);

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

      setStatus(Status.Reflecting);

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
      setStatus(Status.Success);
      setFeedback('Reflection generated successfully.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We hit an unexpected issue generating the reflection.';
      setFeedback(message);
      setStatus(Status.Error);
    }
  }, [goal, journalEntry, supabaseConfigured]);

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
              disabled={isGenerating}
              style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            >
              <Text style={styles.generateButtonLabel}>
                {status === Status.Reflecting
                  ? 'Generating...'
                  : status === Status.Saving
                  ? 'Saving entry...'
                  : 'Generate Reflection'}
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

        {feedback && (
          <Text style={[styles.feedback, status === Status.Error ? styles.error : styles.success]}>{feedback}</Text>
        )}
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
