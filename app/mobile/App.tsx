import { useCallback, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './lib/supabase';

enum Status {
  Idle = 'idle',
  Testing = 'testing',
  Success = 'success',
  Error = 'error',
}

export default function App() {
  const [status, setStatus] = useState<Status>(Status.Idle);
  const [message, setMessage] = useState(
    'Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in app/mobile/.env to enable API calls.',
  );

  const handleTestConnection = useCallback(async () => {
    setStatus(Status.Testing);
    try {
      const { error } = await supabase.from('healthcheck').select('*').limit(1);
      if (error) {
        setStatus(Status.Error);
        setMessage(error.message);
        return;
      }
      setStatus(Status.Success);
      setMessage('Connected successfully. Ensure the healthcheck table exists.');
    } catch (err) {
      setStatus(Status.Error);
      setMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Text style={styles.title}>AI Journal Mobile Shell</Text>
        <Text style={styles.subtitle}>
          This Expo app hosts the primary journaling experience. Start by configuring your Supabase credentials and
          running one of the npm platform commands.
        </Text>
        <TouchableOpacity
          onPress={handleTestConnection}
          disabled={status === Status.Testing}
          style={[styles.button, status === Status.Testing && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>
            {status === Status.Testing ? 'Testing connection…' : 'Test Supabase Connection'}
          </Text>
        </TouchableOpacity>
        <Text
          style={[
            styles.message,
            status === Status.Error && styles.error,
            status === Status.Success && styles.success,
          ]}
        >
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
  },
  subtitle: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: '#f8fafc',
    fontWeight: '500',
  },
  message: {
    textAlign: 'center',
    fontSize: 14,
    color: '#475569',
    paddingHorizontal: 12,
  },
  error: {
    color: '#dc2626',
  },
  success: {
    color: '#16a34a',
  },
});
