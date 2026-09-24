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
import { router } from 'expo-router';
import { ROUTES } from '../constants/routes';
import { supabase } from '../lib/supabase/client';
import { getEarlyInitialUrl, getLatestUrl, onDeepLinkUrl } from '../lib/deepLinkCache';
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
    let handledUrl: string | null = null;

    const readyRef = { current: false };

    const handleUrl = async (url: string | null) => {
      if (__DEV__) console.log('[AcceptInvite] INCOMING URL:', url);

      if (!url || handledUrl === url) return;
      handledUrl = url;
      const params = readAuthParams(url);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const code = params.get('code');

      if (__DEV__) {
        console.log('[AcceptInvite] parsed params:', {
          hasTokenHash: !!tokenHash,
          type,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasCode: !!code,
        });
      }

      // Preferred path: token_hash survives the email -> app handoff far
      // more reliably than a URL fragment does.
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'invite') || 'invite',
        });
        if (__DEV__) console.log('[AcceptInvite] verifyOtp result:', otpError?.message || 'OK');
        if (mounted) {
          setError(otpError?.message || '');
          readyRef.current = !otpError;
          setReady(!otpError);
        }
        return;
      }

      if (!accessToken || !refreshToken) {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (__DEV__) console.log('[AcceptInvite] exchangeCodeForSession result:', exchangeError?.message || 'OK');
          if (mounted) {
            setError(exchangeError?.message || '');
            readyRef.current = !exchangeError;
            setReady(!exchangeError);
          }
          return;
        }
        if (__DEV__) console.log('[AcceptInvite] No token_hash, tokens, or code found in URL.');
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
        readyRef.current = !sessionError;
        setReady(!sessionError);
      }
    };

    const unsubscribe = onDeepLinkUrl((url) => {
      handleUrl(url);
    });
    getEarlyInitialUrl().then((cachedUrl) => {
      handleUrl(cachedUrl || getLatestUrl());
    });

    const timeout = setTimeout(() => {
      // readyRef (not the stale `ready` state captured at mount) reflects
      // the latest outcome, so a successful session doesn't get clobbered
      // by this fallback message after the fact.
      if (mounted && !readyRef.current) {
        if (__DEV__) console.log('[AcceptInvite] Timed out waiting for a valid URL.');
        setError((prev) => prev || 'Could not read the invite link. Please open the invite email again and tap the link.');
      }
    }, 9000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      unsubscribe();
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
      {
        text: 'Go to login',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace(ROUTES.login);
        },
      },
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
          autoCapitalize="none"
          autoCorrect={false}
          value={password}
          onChangeText={setPassword}
        />
        <Input
          placeholder="Confirm password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
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