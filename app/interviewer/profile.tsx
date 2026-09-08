import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { getDb } from '../../lib/sqlite/schema';
import {
  runSync,
  getSyncStats,
  retryFailedSync,
  getFeedbackConflicts,
  resolveFeedbackConflict,
  type FeedbackConflict,
} from '../../lib/sync/syncEngine';
import InterviewerDrawer from '../../components/interviewer/InterviewerDrawer';

export default function InterviewerProfileScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Stats
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(0);
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0, synced: 0 });
  const [conflicts, setConflicts] = useState<FeedbackConflict[]>([]);

  const loadProfileData = useCallback(async () => {
    try {
      if (!user?.id) return;

      // 1. Read SQLite local stats
      const localStats = getSyncStats();
      setSyncStats(localStats);
      setConflicts(getFeedbackConflicts());

      const db = getDb();
      const localFbCount = db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM feedback WHERE interviewer_id = ?`,
        [user.id]
      );
      if (localFbCount) {
        setFeedbackSubmitted(localFbCount.count);
      }

      // 2. Fetch remote stats from Supabase
      const { data: assignedJobs } = await supabase
        .from('job_interviewers')
        .select('job_id')
        .eq('user_id', user.id);

      const jobIds = assignedJobs?.map((x) => x.job_id) || [];
      if (jobIds.length > 0) {
        const { count: candCount } = await supabase
          .from('candidates')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds);

        setTotalAssigned(candCount ?? 0);
      } else {
        setTotalAssigned(0);
      }

      const { count: fbCount } = await supabase
        .from('feedback')
        .select('id', { count: 'exact', head: true })
        .eq('interviewer_id', user.id);

      if (fbCount !== null) {
        setFeedbackSubmitted(fbCount);
      }
    } catch (err: any) {
      console.warn('Error loading profile data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfileData();
  };

  const handleSyncNow = async () => {
    if (!user?.id) return;
    try {
      setSyncing(true);
      await runSync(user.id);
      await loadProfileData();
      Alert.alert('Sync Complete', 'All local evaluations and server data are in sync.');
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message || 'Unable to complete synchronization.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!user?.id) return;
    try {
      setRetrying(true);
      await retryFailedSync(user.id);
      await loadProfileData();
      Alert.alert('Retry Complete', 'Failed mutations have been re-enqueued and processed.');
    } catch (err: any) {
      Alert.alert('Retry Failed', err.message || 'Unable to retry failed sync queue.');
    } finally {
      setRetrying(false);
    }
  };

  const handleResolveConflict = (conflict: FeedbackConflict) => {
    Alert.alert(
      'Resolve feedback conflict',
      'Choose which version to keep.',
      [
        {
          text: 'Keep server version',
          onPress: () => {
            resolveFeedbackConflict(conflict.feedback_id, 'server');
            loadProfileData();
          },
        },
        {
          text: 'Keep my local version',
          onPress: () => {
            resolveFeedbackConflict(conflict.feedback_id, 'local');
            loadProfileData();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to sign out of InterviewPulse?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
              router.replace('/(auth)/login');
            } catch (err: any) {
              Alert.alert('Sign Out Error', err.message || 'Failed to sign out.');
            }
          },
        },
      ]
    );
  };

  const pendingFeedback = Math.max(0, totalAssigned - feedbackSubmitted);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          style={styles.menuButton}
          onPress={() => setDrawerOpen(true)}
          hitSlop={12}
        >
          <Ionicons name="menu" size={26} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Interviewer Profile</Text>
          <Text style={styles.headerSubtitle}>Account & Sync Settings</Text>
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
            <Ionicons name="sync-outline" size={22} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* USER PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'I'}
            </Text>
          </View>

          <Text style={styles.userName}>{user?.name || 'Interviewer'}</Text>
          <Text style={styles.userEmail}>{user?.email || 'interviewer@company.com'}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
              <Text style={styles.roleBadgeText}>Interviewer</Text>
            </View>

            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineBadgeText}>Offline-First Active</Text>
            </View>
          </View>
        </View>

        {/* STATISTICS SECTION */}
        <Text style={styles.sectionTitle}>Interview Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>{totalAssigned}</Text>
            <Text style={styles.statLabel}>Assigned</Text>
          </View>

          <View style={styles.statBox}>
            <View style={[styles.statIconWrap, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="checkmark-done-outline" size={20} color="#16A34A" />
            </View>
            <Text style={styles.statValue}>{feedbackSubmitted}</Text>
            <Text style={styles.statLabel}>Submitted</Text>
          </View>

          <View style={styles.statBox}>
            <View style={[styles.statIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="time-outline" size={20} color="#D97706" />
            </View>
            <Text style={styles.statValue}>{pendingFeedback}</Text>
            <Text style={styles.statLabel}>To Evaluate</Text>
          </View>
        </View>

        {/* OFFLINE FIRST & SYNC CONTROLS */}
        <Text style={styles.sectionTitle}>Offline Sync & Local Database</Text>
        <View style={styles.card}>
          <View style={styles.syncHeader}>
            <View style={styles.syncStatusLeft}>
              <Ionicons
                name={syncStats.pending > 0 ? 'cloud-upload-outline' : 'cloud-done-outline'}
                size={22}
                color={syncStats.pending > 0 ? '#D97706' : '#16A34A'}
              />
              <View>
                <Text style={styles.syncStatusTitle}>
                  {syncStats.pending > 0
                    ? `${syncStats.pending} item(s) pending sync`
                    : 'Local SQLite database is in sync'}
                </Text>
                <Text style={styles.syncStatusSubtitle}>
                  {syncStats.failed > 0
                    ? `${syncStats.failed} failed sync attempts`
                    : 'Mutations replicate to Supabase automatically'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.syncActions}>
            <Pressable
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={handleSyncNow}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="sync" size={16} color="#FFFFFF" />
                  <Text style={styles.syncBtnText}>Sync Now</Text>
                </>
              )}
            </Pressable>

            {syncStats.failed > 0 && (
              <Pressable
                style={[styles.retryBtn, retrying && styles.syncBtnDisabled]}
                onPress={handleRetryFailed}
                disabled={retrying}
              >
                {retrying ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={16} color="#DC2626" />
                    <Text style={styles.retryBtnText}>Retry Failed ({syncStats.failed})</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {conflicts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Conflicts Requiring Review</Text>
            <View style={styles.card}>
              <Text style={styles.conflictIntro}>
                These evaluations changed on another device. Choose which version to keep.
              </Text>
              {conflicts.map((conflict) => {
                const local = JSON.parse(conflict.local_payload);
                const server = JSON.parse(conflict.server_payload);
                return (
                  <View key={conflict.feedback_id} style={styles.conflictItem}>
                    <Text style={styles.conflictTitle}>Feedback conflict</Text>
                    <Text style={styles.conflictDetail}>
                      Local: {local.overall_verdict} (v{local.version}) · Server: {server.overall_verdict} (v{server.version})
                    </Text>
                    <Pressable
                      style={styles.resolveBtn}
                      onPress={() => handleResolveConflict(conflict)}
                    >
                      <Text style={styles.resolveBtnText}>Resolve Conflict</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* INTERVIEW RULES & POLICY */}
        <Text style={styles.sectionTitle}>Interviewer Rules & Policy</Text>
        <View style={styles.rulesCard}>
          <View style={styles.ruleItem}>
            <View style={styles.ruleIconWrap}>
              <Ionicons name="eye-off-outline" size={20} color="#6366F1" />
            </View>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>Blind Feedback Rule</Text>
              <Text style={styles.ruleDescription}>
                You cannot view panel scores or other interviewers' evaluations until you have submitted your own feedback. This prevents cognitive bias.
              </Text>
            </View>
          </View>

          <View style={styles.ruleDivider} />

          <View style={styles.ruleItem}>
            <View style={styles.ruleIconWrap}>
              <Ionicons name="timer-outline" size={20} color="#0D9488" />
            </View>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>1-Hour Edit Window</Text>
              <Text style={styles.ruleDescription}>
                Once you submit feedback, you have exactly 60 minutes to make edits or corrections. Afterwards, the submission is locked to maintain audit integrity.
              </Text>
            </View>
          </View>
        </View>

        {/* APP INFO */}
        <View style={styles.appInfoCard}>
          <View style={styles.appInfoRow}>
            <Text style={styles.appInfoLabel}>Application</Text>
            <Text style={styles.appInfoValue}>InterviewPulse Mobile</Text>
          </View>
          <View style={styles.appInfoRow}>
            <Text style={styles.appInfoLabel}>Architecture</Text>
            <Text style={styles.appInfoValue}>Offline-First (SQLite + Supabase)</Text>
          </View>
          <View style={styles.appInfoRow}>
            <Text style={styles.appInfoLabel}>Version</Text>
            <Text style={styles.appInfoValue}>v1.0.0</Text>
          </View>
        </View>

        {/* LOGOUT BUTTON */}
        <Pressable style={styles.logoutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      {/* DRAWER MODAL */}
      <InterviewerDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: '#06235C',
    paddingTop: 54,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#06235C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  onlineBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#047857',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '500',
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  syncStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  syncStatusSubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 14,
  },
  syncActions: {
    flexDirection: 'row',
    gap: 10,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  conflictIntro: {
    fontSize: 13,
    color: colors.secondaryText,
    lineHeight: 19,
    marginBottom: 12,
  },
  conflictItem: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
    marginTop: 4,
  },
  conflictTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  conflictDetail: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 4,
    marginBottom: 10,
  },
  resolveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resolveBtnText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  rulesCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: 12,
  },
  ruleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ruleContent: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  ruleDescription: {
    fontSize: 12,
    color: colors.secondaryText,
    lineHeight: 18,
  },
  ruleDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 12,
  },
  appInfoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  appInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appInfoLabel: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  appInfoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 12,
    borderRadius: 10,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
});
