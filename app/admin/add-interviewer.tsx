import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui/Button';
import Input from '../../components/ui/Input';

/**
 * Invites a new interviewer via a secure server-side Edge Function
 * (`supabase/functions/invite-interviewer`) instead of the old
 * client-side flow where the Admin typed a plaintext password that
 * became the interviewer's real login password.
 *
 * The interviewer now receives Supabase's own invite email and sets
 * their own password — the Admin never sees or chooses it, and the
 * account/profile row are created server-side with the service role,
 * so there's no RLS gap on the write either.
 */
export default function AddInterviewer() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);

  const inviteInterviewer = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter interviewer full name');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter email address');
      return;
    }

    const normalizedEmail = email
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke(
        'invite-interviewer',
        {
          body: {
            name: name.trim(),
            email: normalizedEmail,
            department: department.trim() || undefined,
          },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      Alert.alert(
        'Invitation Sent',
        `${name.trim()} will receive an email at ${email.trim()} to set up their own password and log in.`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      let message = err?.message || 'Failed to send invitation. Please try again.';

      // Supabase FunctionsHttpError keeps the function response on `context`.
      // Read it so the server's validation/Auth error is not hidden behind
      // the generic "non-2xx status code" message.
      if (err?.context?.json) {
        try {
          const responseBody = await err.context.json();
          if (responseBody?.error) {
            message = responseBody.error;
          }
        } catch {
          // Keep the original error when the response is not JSON.
        }
      }

      Alert.alert(
        'Error',
        message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Add Interviewer</Text>
          <Text style={styles.subtitle}>Invite a new interviewer to the panel</Text>
        </View>
      </View>

      {/* FORM CARD */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>Interviewer Details</Text>
        <Text style={styles.cardSub}>
          They'll receive an email invite to set up their own password and log in — you never need to share credentials with them.
        </Text>

        <Text style={styles.label}>
          Full Name <Text style={styles.required}>*</Text>
        </Text>
        <Input
          placeholder="e.g. Sarah Connor"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>
          Work Email <Text style={styles.required}>*</Text>
        </Text>
        <Input
          placeholder="e.g. sarah.connor@company.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Department (optional)</Text>
        <Input
          placeholder="e.g. Engineering"
          value={department}
          onChangeText={setDepartment}
        />

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.infoBannerText}>
            Interviewers will have access to the mobile feedback evaluations for jobs they are assigned to.
          </Text>
        </View>

        <Button
          label="Send Invitation"
          onPress={inviteInterviewer}
          loading={loading}
          disabled={loading}
          icon={<Ionicons name="mail-outline" size={18} color="#FFFFFF" />}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
    marginTop: 12,
    marginBottom: 6,
  },
  required: {
    color: colors.danger,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    padding: 12,
    borderRadius: 8,
    marginTop: 18,
    marginBottom: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.primaryDark,
    lineHeight: 17,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});