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
import { useURL } from 'expo-linking';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui/Button';
import { ROUTES } from '../../constants/routes';

export default function ResetPasswordScreen() {
  const url = useURL();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    let mounted = true;

    const establishSession = async (rawUrl: string | null) => {
      if (!rawUrl) return;

      const hashPart = rawUrl.split('#')[1] || '';
      const queryPart = rawUrl.split('?')[1]?.split('#')[0] || '';
      const params = new URLSearchParams(hashPart || queryPart);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        if (mounted) setLinkError('This reset link is invalid or has expired.');
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (mounted) {
        if (error) setLinkError(error.message);
        setReady(!error);
      }
    };

    establishSession(url);

    const timeout = setTimeout(() => {
      if (mounted && !ready) {
        setLinkError('Could not read the reset link. Please request a new one.');
      }
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [url]);

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