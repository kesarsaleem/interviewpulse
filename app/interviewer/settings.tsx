import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import { getDb } from '../../lib/sqlite/schema';
import {
  runSync,
  getSyncStats,
  retryFailedSync,
} from '../../lib/sync/syncEngine';
import InterviewerDrawer from '../../components/interviewer/InterviewerDrawer';
import { ThemeMode, InterviewMode } from '../../types';

export default function InterviewerSettingsScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const { themeMode, setThemeMode, colors, isDark } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Sync Stats & Status
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0, synced: 0 });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Interview Preferences State
  const [defaultMode, setDefaultMode] = useState<InterviewMode>('video');
  const [defaultDuration, setDefaultDuration] = useState<number>(45);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Edit Name Modal State
  const [editNameModal, setEditNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [updatingName, setUpdatingName] = useState(false);

  // Change Password Modal State
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Load Preferences & Sync Status
  const loadPreferencesAndStats = useCallback(async () => {
    try {
      // 1. Sync stats
      const stats = getSyncStats();
      setSyncStats(stats);

      const storedSyncTime = await AsyncStorage.getItem('interviewpulse_last_sync_time');
      if (storedSyncTime) {
        setLastSyncTime(new Date(storedSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }

      // 2. User Interview Preferences
      if (user?.id) {
        try {
          const db = getDb();
          const row = db.getFirstSync<{ default_interview_mode?: string; default_duration?: number }>(
            `SELECT default_interview_mode, default_duration FROM profiles WHERE id = ?`,
            [user.id]
          );
          if (row) {
            if (row.default_interview_mode) setDefaultMode(row.default_interview_mode as InterviewMode);
            if (row.default_duration) setDefaultDuration(Number(row.default_duration));
          }
        } catch {
          // ignore SQLite fallback
        }

        if (user.default_interview_mode) setDefaultMode(user.default_interview_mode);
        if (user.default_duration) setDefaultDuration(user.default_duration);
      }
    } catch (err) {
      console.warn('Error loading settings data:', err);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, user?.default_interview_mode, user?.default_duration]);

  useEffect(() => {
    loadPreferencesAndStats();
  }, [loadPreferencesAndStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPreferencesAndStats();
  };

  // 1. EDIT PROFILE NAME
  const handleOpenEditName = () => {
    setNewName(user?.name || '');
    setEditNameModal(true);
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid display name.');
      return;
    }
    if (!user?.id) return;

    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: newName.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      try {
        const db = getDb();
        db.runSync(`UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?`, [
          newName.trim(),
          new Date().toISOString(),
          user.id,
        ]);
      } catch {
        // non-blocking
      }

      await refreshUser();
      setEditNameModal(false);
      Alert.alert('Success', 'Profile name updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile name.');
    } finally {
      setUpdatingName(false);
    }
  };

  // 2. CHANGE PASSWORD
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match. Please verify.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Your password has been updated.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Failed to update password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // 3. SIGN OUT
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  // 4. APPEARANCE THEME CHANGE
  const handleSelectTheme = async (mode: ThemeMode) => {
    try {
      await setThemeMode(mode);
    } catch (err: any) {
      Alert.alert('Theme Notice', 'Failed to persist theme mode.');
    }
  };

  // 5. INTERVIEW PREFERENCES CHANGE
  const handleUpdatePreferences = async (mode: InterviewMode, duration: number) => {
    setDefaultMode(mode);
    setDefaultDuration(duration);

    if (!user?.id) return;
    setSavingPrefs(true);
    try {
      try {
        const db = getDb();
        db.runSync(
          `UPDATE profiles SET default_interview_mode = ?, default_duration = ?, updated_at = ? WHERE id = ?`,
          [mode, duration, new Date().toISOString(), user.id]
        );
      } catch {
        // non-blocking
      }

      await supabase
        .from('profiles')
        .update({
          default_interview_mode: mode,
          default_duration: duration,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      await refreshUser();
    } catch (err: any) {
      console.warn('Error saving interview preferences:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  // 6. OFFLINE SYNC HANDLERS
  const handleSyncNow = async () => {
    if (!user?.id) return;
    setSyncing(true);
    try {
      await runSync(user.id);
      const now = new Date();
      await AsyncStorage.setItem('interviewpulse_last_sync_time', now.toISOString());
      setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      const stats = getSyncStats();
      setSyncStats(stats);
      Alert.alert('Sync Successful', 'All candidate evaluations and offline changes are synced with Supabase.');
    } catch (err: any) {
      Alert.alert('Sync Incomplete', err.message || 'Failed to sync. Changes remain safe in offline SQLite storage.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!user?.id) return;
    setRetrying(true);
    try {
      await retryFailedSync(user.id);
      const stats = getSyncStats();
      setSyncStats(stats);
      Alert.alert('Retry Done', 'Pending mutations were reprocessed.');
    } catch (err: any) {
      Alert.alert('Retry Failed', err.message || 'Could not reprocess failed items.');
    } finally {
      setRetrying(false);
    }
  };

  const interviewModes: { label: string; value: InterviewMode; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'Video Call', value: 'video', icon: 'videocam-outline' },
    { label: 'Phone', value: 'phone', icon: 'call-outline' },
    { label: 'Onsite', value: 'onsite', icon: 'business-outline' },
  ];

  const durationOptions = [30, 45, 60];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.headerBackground : '#06235C', borderBottomColor: colors.headerBorder }]}>
        <Pressable
          style={styles.menuButton}
          onPress={() => setDrawerOpen(true)}
          hitSlop={10}
        >
          <Ionicons name="menu" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Interviewer Settings</Text>
          <Text style={styles.headerSubtitle}>Account, preferences & offline controls</Text>
        </View>

        <Pressable
          style={styles.headerIconBtn}
          onPress={handleSyncNow}
          disabled={syncing}
          hitSlop={10}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="sync-outline" size={20} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ========================================================================= */}
        {/* SECTION 1: ACCOUNT */}
        {/* ========================================================================= */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>ACCOUNT PROFILE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.accountHeader}>
            <View style={[styles.avatarCircle, { backgroundColor: isDark ? colors.primaryLight : '#06235C' }]}>
              <Text style={[styles.avatarText, { color: isDark ? colors.primary : '#FFFFFF' }]}>
                {user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'I'}
              </Text>
            </View>

            <View style={styles.accountDetails}>
              <Text style={[styles.accountName, { color: colors.text }]}>{user?.name || 'Interviewer'}</Text>
              <Text style={[styles.accountEmail, { color: colors.secondaryText }]}>{user?.email || 'interviewer@company.com'}</Text>
              <View style={[styles.roleBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF', borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE' }]}>
                <Ionicons name="shield-checkmark" size={13} color="#2563EB" />
                <Text style={styles.roleBadgeText}>Interviewer</Text>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Action: Edit Name */}
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.divider }]}
            onPress={handleOpenEditName}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Edit Profile Name</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Change display name on evaluation rubrics</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Action: Change Password */}
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.divider }]}
            onPress={() => setPasswordModal(true)}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
              <Ionicons name="key-outline" size={18} color="#10B981" />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Change Password</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Secure your interviewer credentials</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Action: Sign Out */}
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}
            onPress={handleSignOut}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionTitle, { color: '#EF4444' }]}>Sign Out</Text>
              <Text style={[styles.actionSubtitle, { color: colors.mutedText }]}>Exit your current interviewer session</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#EF4444" />
          </Pressable>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 2: APPEARANCE (INDEPENDENT PER USER) */}
        {/* ========================================================================= */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardNote, { color: colors.secondaryText }]}>
            Theme preferences are saved individually for your account and do not affect administrator view.
          </Text>

          <View style={styles.themeGrid}>
            {/* Light Mode */}
            <Pressable
              style={[
                styles.themeOption,
                { borderColor: themeMode === 'light' ? colors.primary : colors.cardBorder, backgroundColor: isDark ? '#1E2D4F' : '#F8FAFC' },
                themeMode === 'light' && { borderWidth: 2, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF' },
              ]}
              onPress={() => handleSelectTheme('light')}
            >
              <View style={[styles.themeIconCircle, { backgroundColor: '#FDBA74' }]}>
                <Ionicons name="sunny" size={20} color="#EA580C" />
              </View>
              <Text style={[styles.themeOptionTitle, { color: colors.text }]}>Light</Text>
              <Text style={[styles.themeOptionSubtitle, { color: colors.mutedText }]}>Crisp & bright</Text>
              {themeMode === 'light' && (
                <View style={styles.checkPill}>
                  <Ionicons name="checkmark" size={14} color="#2563EB" />
                </View>
              )}
            </Pressable>

            {/* Dark Mode */}
            <Pressable
              style={[
                styles.themeOption,
                { borderColor: themeMode === 'dark' ? colors.primary : colors.cardBorder, backgroundColor: isDark ? '#1E2D4F' : '#F8FAFC' },
                themeMode === 'dark' && { borderWidth: 2, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF' },
              ]}
              onPress={() => handleSelectTheme('dark')}
            >
              <View style={[styles.themeIconCircle, { backgroundColor: '#312E81' }]}>
                <Ionicons name="moon" size={20} color="#A5B4FC" />
              </View>
              <Text style={[styles.themeOptionTitle, { color: colors.text }]}>Dark</Text>
              <Text style={[styles.themeOptionSubtitle, { color: colors.mutedText }]}>Low-light focus</Text>
              {themeMode === 'dark' && (
                <View style={styles.checkPill}>
                  <Ionicons name="checkmark" size={14} color="#2563EB" />
                </View>
              )}
            </Pressable>

            {/* System Default */}
            <Pressable
              style={[
                styles.themeOption,
                { borderColor: themeMode === 'system' ? colors.primary : colors.cardBorder, backgroundColor: isDark ? '#1E2D4F' : '#F8FAFC' },
                themeMode === 'system' && { borderWidth: 2, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF' },
              ]}
              onPress={() => handleSelectTheme('system')}
            >
              <View style={[styles.themeIconCircle, { backgroundColor: '#94A3B8' }]}>
                <Ionicons name="phone-portrait-outline" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.themeOptionTitle, { color: colors.text }]}>System</Text>
              <Text style={[styles.themeOptionSubtitle, { color: colors.mutedText }]}>Match OS</Text>
              {themeMode === 'system' && (
                <View style={styles.checkPill}>
                  <Ionicons name="checkmark" size={14} color="#2563EB" />
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 3: INTERVIEW PREFERENCES */}
        {/* ========================================================================= */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>INTERVIEW PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          {/* Default Mode */}
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Default Interview Mode</Text>
          <Text style={[styles.fieldHelp, { color: colors.mutedText }]}>
            Pre-selects mode when initiating scorecards & candidate sessions
          </Text>

          <View style={styles.modeRow}>
            {interviewModes.map((item) => {
              const active = defaultMode === item.value;
              return (
                <Pressable
                  key={item.value}
                  style={[
                    styles.modeOption,
                    { borderColor: active ? colors.primary : colors.cardBorder, backgroundColor: active ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF') : colors.card },
                  ]}
                  onPress={() => handleUpdatePreferences(item.value, defaultDuration)}
                  disabled={savingPrefs}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={active ? colors.primary : colors.secondaryText}
                  />
                  <Text style={[styles.modeOptionText, { color: active ? colors.primary : colors.secondaryText, fontWeight: active ? '700' : '500' }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider, marginVertical: 14 }]} />

          {/* Default Duration */}
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Default Interview Duration</Text>
          <Text style={[styles.fieldHelp, { color: colors.mutedText }]}>
            Default time allocated per evaluation stage
          </Text>

          <View style={styles.durationRow}>
            {durationOptions.map((mins) => {
              const active = defaultDuration === mins;
              return (
                <Pressable
                  key={mins}
                  style={[
                    styles.durationOption,
                    { borderColor: active ? colors.primary : colors.cardBorder, backgroundColor: active ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF') : colors.card },
                  ]}
                  onPress={() => handleUpdatePreferences(defaultMode, mins)}
                  disabled={savingPrefs}
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={active ? colors.primary : colors.secondaryText}
                  />
                  <Text style={[styles.durationOptionText, { color: active ? colors.primary : colors.secondaryText, fontWeight: active ? '700' : '500' }]}>
                    {mins} mins
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 4: FEEDBACK RULES INFORMATION CARD */}
        {/* ========================================================================= */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>EVALUATION INTEGRITY RULES</Text>
        <View style={[styles.rulesCard, { backgroundColor: isDark ? '#142347' : '#F0F7FF', borderColor: isDark ? '#233869' : '#BAE6FD' }]}>
          <View style={styles.rulesHeader}>
            <Ionicons name="shield-outline" size={20} color="#0284C7" />
            <Text style={[styles.rulesTitle, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>Fair Hiring & Blind Review Policies</Text>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleBullet}>
              <Ionicons name="lock-closed" size={14} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ruleItemTitle, { color: isDark ? '#E2E8F0' : '#0C4A6E' }]}>1-Hour Edit Lock Window</Text>
              <Text style={[styles.ruleItemDesc, { color: isDark ? '#94A3B8' : '#38BDF8' }]}>
                Submitted scorecards can be adjusted within 60 minutes. After this grace period, records freeze permanently to maintain audit integrity.
              </Text>
            </View>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleBullet}>
              <Ionicons name="eye-off-outline" size={14} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ruleItemTitle, { color: isDark ? '#E2E8F0' : '#0C4A6E' }]}>Blind Review Protection</Text>
              <Text style={[styles.ruleItemDesc, { color: isDark ? '#94A3B8' : '#38BDF8' }]}>
                Interviewer ratings are hidden from peers until everyone completes their scorecard to avoid confirmation bias.
              </Text>
            </View>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleBullet}>
              <Ionicons name="star-outline" size={14} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ruleItemTitle, { color: isDark ? '#E2E8F0' : '#0C4A6E' }]}>Standardized 0–5 Criteria Scale</Text>
              <Text style={[styles.ruleItemDesc, { color: isDark ? '#94A3B8' : '#38BDF8' }]}>
                Ratings require evidence notes. Scores are automatically aggregated into the candidate's holistic competency radar.
              </Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 5: OFFLINE SYNC MANAGEMENT */}
        {/* ========================================================================= */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>OFFLINE & DATABASE STORAGE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.syncStatusHeader}>
            <View style={[styles.syncStatusIcon, { backgroundColor: syncStats.failed > 0 ? '#FEE2E2' : syncStats.pending > 0 ? '#FEF3C7' : '#DCFCE7' }]}>
              <Ionicons
                name={syncStats.failed > 0 ? 'alert-circle' : syncStats.pending > 0 ? 'cloud-upload' : 'cloud-done'}
                size={22}
                color={syncStats.failed > 0 ? '#EF4444' : syncStats.pending > 0 ? '#D97706' : '#16A34A'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.syncTitle, { color: colors.text }]}>
                {syncStats.pending > 0
                  ? `${syncStats.pending} Mutation(s) Queued`
                  : 'SQLite Mirror Up to Date'}
              </Text>
              <Text style={[styles.syncSubtitle, { color: colors.secondaryText }]}>
                {lastSyncTime ? `Last synced at ${lastSyncTime}` : 'All local scorecards backed up'}
              </Text>
            </View>
          </View>

          {/* Sync Stats Counters */}
          <View style={[styles.syncStatsGrid, { borderColor: colors.divider }]}>
            <View style={[styles.syncStatCol, { borderColor: colors.divider }]}>
              <Text style={[styles.syncStatVal, { color: '#2563EB' }]}>{syncStats.synced}</Text>
              <Text style={[styles.syncStatLbl, { color: colors.mutedText }]}>Synced</Text>
            </View>
            <View style={[styles.syncStatCol, { borderColor: colors.divider }]}>
              <Text style={[styles.syncStatVal, { color: '#D97706' }]}>{syncStats.pending}</Text>
              <Text style={[styles.syncStatLbl, { color: colors.mutedText }]}>Pending</Text>
            </View>
            <View style={[styles.syncStatCol, { borderColor: 'transparent' }]}>
              <Text style={[styles.syncStatVal, { color: syncStats.failed > 0 ? '#EF4444' : '#10B981' }]}>
                {syncStats.failed}
              </Text>
              <Text style={[styles.syncStatLbl, { color: colors.mutedText }]}>Failed</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.syncButtonsRow}>
            <Pressable
              style={[styles.syncPrimaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleSyncNow}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.syncBtnText}>Sync Now</Text>
                </>
              )}
            </Pressable>

            {syncStats.failed > 0 && (
              <Pressable
                style={[styles.syncRetryBtn, { borderColor: '#EF4444' }]}
                onPress={handleRetryFailed}
                disabled={retrying}
              >
                {retrying ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="repeat-outline" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                    <Text style={[styles.syncBtnText, { color: '#EF4444' }]}>Retry Failed</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 6: APP INFORMATION */}
        {/* ========================================================================= */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>ABOUT INTERVIEWPULSE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>App Version</Text>
            <View style={[styles.versionBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9' }]}>
              <Text style={[styles.versionBadgeText, { color: colors.mutedText }]}>v1.0.0 (Production Build)</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <Pressable
            style={styles.infoActionRow}
            onPress={() => Alert.alert('Help & Support', 'For technical assistance or rubric inquiries, please contact your hiring administrator or email support@interviewpulse.io.')}
          >
            <Text style={[styles.infoLabel, { color: colors.text }]}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <Pressable
            style={styles.infoActionRow}
            onPress={() => Alert.alert('Privacy Policy', 'InterviewPulse protects candidate evaluations under GDPR & strict enterprise confidentiality guidelines. Blind reviews and timestamps are cryptographic mirrors.')}
          >
            <Text style={[styles.infoLabel, { color: colors.text }]}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
          </Pressable>
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* EDIT NAME MODAL */}
      {/* ========================================================================= */}
      <Modal visible={editNameModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile Name</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedText }]}>
              Enter your full name as it should appear on interview summaries and scorecards.
            </Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Sarah Connor"
              placeholderTextColor={colors.mutedText}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtnCancel, { borderColor: colors.cardBorder }]}
                onPress={() => setEditNameModal(false)}
                disabled={updatingName}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.secondaryText }]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtnSave, { backgroundColor: colors.primary }]}
                onPress={handleSaveName}
                disabled={updatingName}
              >
                {updatingName ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Save Name</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* CHANGE PASSWORD MODAL */}
      {/* ========================================================================= */}
      <Modal visible={passwordModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Change Password</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedText }]}>
              Enter your new credentials. Minimum 6 characters required.
            </Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text, marginBottom: 12 }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password (min 6 chars)"
              placeholderTextColor={colors.mutedText}
              secureTextEntry
            />

            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={colors.mutedText}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtnCancel, { borderColor: colors.cardBorder }]}
                onPress={() => {
                  setPasswordModal(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                disabled={updatingPassword}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.secondaryText }]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtnSave, { backgroundColor: colors.primary }]}
                onPress={handleChangePassword}
                disabled={updatingPassword}
              >
                {updatingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Update Password</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* DRAWER MENU */}
      <InterviewerDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 54,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#93C5FD',
    marginTop: 2,
  },
  headerIconBtn: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 18,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: 13,
    marginBottom: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 12,
  },
  cardNote: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  themeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
  },
  themeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  themeOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  themeOptionSubtitle: {
    fontSize: 10,
  },
  checkPill: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  fieldHelp: {
    fontSize: 12,
    marginBottom: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  modeOptionText: {
    fontSize: 12,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  durationOptionText: {
    fontSize: 13,
  },
  rulesCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ruleBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  ruleItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  ruleItemDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  syncStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  syncStatusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  syncSubtitle: {
    fontSize: 12,
  },
  syncStatsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 10,
    marginBottom: 14,
  },
  syncStatCol: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
  },
  syncStatVal: {
    fontSize: 18,
    fontWeight: '700',
  },
  syncStatLbl: {
    fontSize: 11,
    marginTop: 2,
  },
  syncButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  syncPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  syncRetryBtn: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  syncBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  infoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalInput: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnCancel: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnSave: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
