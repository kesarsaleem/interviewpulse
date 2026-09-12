import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { ROUTES } from '../constants/routes';
import { supabase } from '../lib/supabase/client';
import { useTheme } from '../context/ThemeContext';
import Input from '../components/ui/Input';

function readAuthParams(url: string) {
  const [, hash = ''] = url.split('#');
  const query = url.split('?')[1]?.split('#')[0] || '';
  return new URLSearchParams(`${query}&${hash}`);
}

export default function AcceptInviteScreen() {
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const handleUrl = async (url: string | null) => {
      if (__DEV__) console.log('[AcceptInvite] INCOMING URL:', url);

      if (!url) return;
      const params = readAuthParams(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const code = params.get('code');

      if (__DEV__) {
        console.log('[AcceptInvite] parsed params:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasCode: !!code,
        });
      }

      if (!accessToken || !refreshToken) {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (__DEV__) console.log('[AcceptInvite] exchangeCodeForSession result:', exchangeError?.message || 'OK');
          if (mounted) {
            setError(exchangeError?.message || '');
            setReady(!exchangeError);
          }
          return;
        }
        if (__DEV__) console.log('[AcceptInvite] No tokens and no code found in URL.');
        if (mounted) setError('This invitation link is invalid or has expired.');
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (__DEV__) console.log('[AcceptInvite] setSession result:', sessionError?.message || 'OK');
      if (mounted) {
        setError(sessionError?.message || '');
        setReady(!sessionError);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    const timeout = setTimeout(() => {
      if (mounted && !ready) {
        if (__DEV__) console.log('[AcceptInvite] Timed out waiting for a valid URL.');
        setError('Could not read the invite link. Please open the invite email again and tap the link.');
      }
    }, 9000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, []);

  const submit = async () => {
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    Alert.alert('Account ready', 'Your password has been set. You can now sign in.', [
      { text: 'Go to login', onPress: () => router.replace(ROUTES.login) },
    ]);
  };

  const styles = createStyles(colors);
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Accept invitation</Text>
        <Text style={styles.subtitle}>Create a password to activate your InterviewPulse account.</Text>
        {!ready && !error && <ActivityIndicator color={colors.primary} />}
        <Input
          placeholder="New password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Input
          placeholder="Confirm password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={submit} disabled={!ready || saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Set password</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
    card: { padding: 24, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
    subtitle: { color: colors.secondaryText, marginBottom: 20, lineHeight: 21 },
    input: {
      height: 50,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      backgroundColor: colors.inputBackground,
      color: colors.text,
      paddingHorizontal: 14,
      marginTop: 12,
    },
    error: { color: colors.danger, marginTop: 12 },
    button: {
      height: 50,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    buttonText: { color: '#FFFFFF', fontWeight: '700' },
  });
}