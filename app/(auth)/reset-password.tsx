import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui/Button';
import { ROUTES } from '../../constants/routes';
import { getEarlyInitialUrl, getLatestUrl, onDeepLinkUrl } from '../../lib/deepLinkCache';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [debugUrl, setDebugUrl] = useState('');

  useEffect(() => {
    let mounted = true;
    let handled = false;
    const readyRef = { current: false };

    const establishSession = async (rawUrl: string | null) => {
      if (__DEV__) console.log('[ResetPassword] INCOMING URL:', rawUrl);
      if (mounted) setDebugUrl(rawUrl || '(no url received)');
      if (!rawUrl || handled) return;
      handled = true;

      const hashPart = rawUrl.split('#')[1] || '';
      const queryPart = rawUrl.split('?')[1]?.split('#')[0] || '';
      const params = new URLSearchParams(`${queryPart}&${hashPart}`);

      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const code = params.get('code');

      if (__DEV__) {
        console.log('[ResetPassword] parsed params:', {
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
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'recovery') || 'recovery',
        });
        if (mounted) {
          if (error) setLinkError(error.message);
          readyRef.current = !error;
          setReady(!error);
        }
        return;
      }

      // PKCE-style redirect (?code=...).
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (mounted) {
          if (error) setLinkError(error.message);
          readyRef.current = !error;
          setReady(!error);
        }
        return;
      }

      // Legacy implicit flow (#access_token=...&refresh_token=...).
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (mounted) {
          if (error) setLinkError(error.message);
          readyRef.current = !error;
          setReady(!error);
        }
        return;
      }

      if (mounted) setLinkError('This reset link is invalid or has expired.');
    };

    const unsubscribe = onDeepLinkUrl((incomingUrl) => {
      establishSession(incomingUrl);
    });
    getEarlyInitialUrl().then((cachedUrl) => {
      establishSession(cachedUrl || getLatestUrl());
    });

    const timeout = setTimeout(() => {
      // readyRef (not the stale `ready` state captured at mount) reflects
      // the latest outcome, so a successful session doesn't get clobbered
      // by this fallback message after the fact.
      if (mounted && !readyRef.current) {
        setLinkError((prev) => prev || 'Could not read the reset link. Please request a new one.');
      }
    }, 8000);

    return () => {
      mounted = false;
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Error', 'Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      Alert.alert('Success', 'Password updated successfully.', [
        { text: 'OK', onPress: () => router.replace(ROUTES.login) },
      ]);
    } catch {
      Alert.alert('Error', 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>Create your new password</Text>

      {!ready && !linkError && (
        <ActivityIndicator color="#4F46E5" style={{ marginBottom: 20 }} />
      )}
      {!!linkError && <Text style={styles.error}>{linkError}</Text>}
      {!!debugUrl && (
        <Text selectable style={styles.debug}>
          DEBUG URL: {debugUrl}
        </Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="New Password"
        placeholderTextColor="#9CA3AF"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        placeholderTextColor="#9CA3AF"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <Button
        label="Update Password"
        onPress={handleUpdatePassword}
        loading={loading}
        disabled={loading || !ready}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 25, backgroundColor: '#0B0F19' },
  title: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  subtitle: { color: '#9CA3AF', marginBottom: 30, fontSize: 16 },
  error: { color: '#F87171', marginBottom: 15 },
  debug: { color: '#9CA3AF', marginBottom: 15, fontSize: 11 },
  input: {
    height: 55,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    marginBottom: 15,
  },
});