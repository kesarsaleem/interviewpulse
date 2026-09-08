import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Logo from '../../components/ui/Logo';
import GradientBackground from '../../components/ui/GradientBackground';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u2060]/g, '')
    .trim()
    .toLowerCase();
}

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { resetPassword } = useAuth();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRequestCode = async () => {
    setError('');
    setSuccess('');
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError('Enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      const result = await resetPassword(normalizedEmail);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEmail(normalizedEmail);
      setStep('verify');
      setSuccess('A 6-digit recovery code has been sent to your email.');
    } catch {
      setError('Unable to send the recovery code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setSuccess('');
    const token = otp.replace(/\D/g, '');

    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit recovery code');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      });
      if (verifyError) {
        setError(verifyError.message || 'Invalid or expired recovery code');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Unable to update password');
        return;
      }

      setSuccess('Password updated! Redirecting to login...');
      setTimeout(() => router.replace('/login'), 1500);
    } catch {
      setError('Unable to verify the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const useDifferentEmail = () => {
    setStep('request');
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Logo />
            <Text style={styles.title}>
              {step === 'request' ? 'Forgot Password?' : 'Enter Recovery Code'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'request'
                ? 'Enter your email and we will send you a 6-digit recovery code'
                : `Enter the code sent to ${email}`}
            </Text>
            <View style={styles.line} />

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            {success ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                <Text style={styles.success}>{success}</Text>
              </View>
            ) : null}

            {step === 'request' ? (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.mutedText}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError('');
                    setSuccess('');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.button, loading && styles.disabled]}
                  disabled={loading}
                  onPress={handleRequestCode}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Send Code</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>6-Digit Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter code"
                  placeholderTextColor={colors.mutedText}
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Text style={styles.label}>New Password</Text>
                <View style={styles.passwordBox}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter new password"
                    placeholderTextColor={colors.mutedText}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <Pressable onPress={() => setShowPassword((visible) => !visible)}>
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={colors.secondaryText}
                    />
                  </Pressable>
                </View>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.mutedText}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable
                  style={[styles.button, loading && styles.disabled]}
                  disabled={loading}
                  onPress={handleVerifyCode}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Set New Password</Text>
                  )}
                </Pressable>
                <Pressable onPress={useDifferentEmail}>
                  <Text style={styles.link}>Resend code / Use a different email</Text>
                </Pressable>
              </>
            )}

            <Pressable onPress={() => router.back()}>
              <Text style={styles.back}>← Back to Login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 25 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 30,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.secondaryText,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  title: { fontSize: 30, fontWeight: '900', color: '#1E3A8A', marginTop: 20 },
  subtitle: { fontSize: 15, color: colors.secondaryText, marginTop: 8, lineHeight: 22 },
  line: {
    width: 50,
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginVertical: 25,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    height: 55,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginBottom: 12,
    fontSize: 16,
  },
  passwordBox: {
    height: 55,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginBottom: 12,
  },
  passwordInput: { flex: 1, height: 55, fontSize: 16 },
  button: {
    height: 58,
    backgroundColor: colors.primary,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  link: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '700',
    marginTop: 18,
  },
  back: {
    textAlign: 'center',
    marginTop: 25,
    color: colors.primary,
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
  },
  error: { color: '#DC2626', flex: 1 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
  },
  success: { color: '#16A34A', flex: 1 },
});
