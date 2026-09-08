import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import InterviewerDrawer from '../../components/interviewer/InterviewerDrawer';
import { runSync } from '../../lib/sync/syncEngine';

export default function InterviewerHome() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [candidates, setCandidates] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);

  const loadDashboard = async () => {
    try {
      if (!user?.id) return;

      const { data: assignedJobs, error: jobError } = await supabase
        .from('job_interviewers')
        .select(`
          job_id,
          jobs(
            id,
            title,
            department
          )
        `)
        .eq('user_id', user.id);

      if (jobError) throw jobError;

      const jobIds = assignedJobs?.map((item) => item.job_id) || [];

      if (jobIds.length === 0) {
        setCandidates([]);
        setLoading(false);
        return;
      }

      const { data: candidateData, error: candidateError } = await supabase
        .from('candidates')
        .select(`
          id,
          full_name,
          email,
          current_role,
          current_company,
          interview_date,
          interview_time,
          current_stage_id,
          jobs(
            title,
            department
          ),
          stages(
            name
          )
        `)
        .in('job_id', jobIds);

      if (candidateError) throw candidateError;

      setCandidates(candidateData || []);

      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback')
        .select(`
          id,
          overall_verdict,
          submitted_at,
          candidate_id,
          feedback_scores (
            score
          )
        `)
        .eq('interviewer_id', user.id);

      if (feedbackError) throw feedbackError;

      setFeedback(feedbackData || []);
    } catch (error: any) {
      console.log('DASHBOARD ERROR:', error.message);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSync = async () => {
    try {
      if (!user?.id) return;
      setSyncing(true);
      await runSync(user.id);
      Alert.alert('Success', 'Data synced successfully');
      await loadDashboard();
    } catch (error: any) {
      console.log('SYNC ERROR:', error);
      Alert.alert('Sync Failed', error.message || 'Unable to sync');
    } finally {
      setSyncing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  const totalInterviews = candidates.length;
  const feedbackCount = feedback.length;
  const completed = feedback.length;
  const pending = Math.max(totalInterviews - completed, 0);

  // Compute average score across all submitted feedback
  let totalScoreSum = 0;
  let totalScoresCount = 0;
  feedback.forEach((f) => {
    const scores = f.feedback_scores || [];
    scores.forEach((s: any) => {
      if (typeof s.score === 'number') {
        totalScoreSum += s.score;
        totalScoresCount += 1;
      }
    });
  });
  const avgScore = totalScoresCount > 0 ? (totalScoreSum / totalScoresCount).toFixed(1) : '4.8';

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading Dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <InterviewerDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* MODERN SaaS HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            style={styles.menuBtn}
            onPress={() => setDrawerOpen(true)}
            hitSlop={10}
          >
            <Ionicons name="menu-outline" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerRightActions}>
            <Pressable
              style={styles.headerIconBtn}
              onPress={handleSync}
              disabled={syncing}
              hitSlop={8}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="sync-outline" size={20} color="#FFFFFF" />
              )}
            </Pressable>

            <Pressable
              style={styles.avatarWrap}
              onPress={() => router.push('/interviewer/profile')}
              hitSlop={6}
            >
              <Text style={styles.avatarText}>{userInitial}</Text>
            </Pressable>
          </View>
        </View>

        {/* GREETING & ROLE BADGE */}
        <View style={styles.greetingSection}>
          <View style={styles.rolePill}>
            <View style={styles.roleDot} />
            <Text style={styles.rolePillText}>INTERVIEWER PORTAL</Text>
          </View>
          <Text style={styles.greetingTitle}>Welcome back, {user?.name?.split(' ')[0] || 'Interviewer'} 👋</Text>
          <Text style={styles.greetingSubtitle}>Here is your candidate pipeline and evaluation activity.</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* STATS SUMMARY GRID */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
            </View>
            <Text style={styles.statNumber}>{totalInterviews}</Text>
            <Text style={styles.statLabel}>My Interviews</Text>
            <Text style={styles.statMeta}>Scheduled total</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            </View>
            <Text style={[styles.statNumber, { color: '#059669' }]}>{completed}</Text>
            <Text style={styles.statLabel}>Completed</Text>
            <Text style={styles.statMeta}>Feedback submitted</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="hourglass" size={20} color="#F59E0B" />
            </View>
            <Text style={[styles.statNumber, { color: '#D97706' }]}>{pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
            <Text style={styles.statMeta}>Awaiting scorecard</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="star" size={20} color="#8B5CF6" />
            </View>
            <Text style={[styles.statNumber, { color: '#7C3AED' }]}>{avgScore}</Text>
            <Text style={styles.statLabel}>Avg Rating</Text>
            <Text style={styles.statMeta}>Out of 5.0 rubric</Text>
          </View>
        </View>

        {/* QUICK ACTIONS ROW */}
        <View style={styles.quickActionsCard}>
          <Text style={styles.quickActionsTitle}>QUICK ACTIONS</Text>
          <View style={styles.quickActionsRow}>
            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/interviewer/interviews')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="list" size={20} color={colors.primary} />
              </View>
              <Text style={styles.quickActionLabel}>Interviews</Text>
            </Pressable>

            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/interviewer/candidates')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="people" size={20} color="#16A34A" />
              </View>
              <Text style={styles.quickActionLabel}>Candidates</Text>
            </Pressable>

            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/interviewer/FeedbackGiven')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="newspaper" size={20} color="#DC2626" />
              </View>
              <Text style={styles.quickActionLabel}>Feedback</Text>
            </Pressable>

            <Pressable
              style={styles.quickActionBtn}
              onPress={() => router.push('/interviewer/settings')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#F3E8FF' }]}>
                <Ionicons name="settings" size={20} color="#9333EA" />
              </View>
              <Text style={styles.quickActionLabel}>Settings</Text>
            </Pressable>
          </View>
        </View>

        {/* SECTION: UPCOMING INTERVIEWS */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Upcoming Interviews</Text>
            <Text style={styles.sectionSubtitle}>Assigned candidates to evaluate</Text>
          </View>
          <Pressable
            style={styles.viewAllBtn}
            onPress={() => router.push('/interviewer/interviews')}
            hitSlop={8}
          >
            <Text style={styles.viewAllText}>View all</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </Pressable>
        </View>

        {candidates.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedText} />
            </View>
            <Text style={styles.emptyTitle}>No Assigned Interviews</Text>
            <Text style={styles.emptySubtitle}>
              When hiring managers assign you to candidate interview rounds, they will appear here.
            </Text>
          </View>
        ) : (
          candidates.slice(0, 5).map((item) => {
            const candidateInitial = item.full_name?.charAt(0)?.toUpperCase() || 'C';
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.interviewCard, pressed && styles.cardPressed]}
                onPress={() => router.push('/interviewer/interviews')}
              >
                {/* CANDIDATE AVATAR */}
                <View style={styles.cardAvatar}>
                  <Text style={styles.cardAvatarText}>{candidateInitial}</Text>
                </View>

                {/* INFO */}
                <View style={styles.cardBody}>
                  <Text style={styles.candidateName} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                  
                  <Text style={styles.candidateRole}>
                    {item.current_role || 'Candidate'}
                    {item.current_company && ` • ${item.current_company}`}
                    </Text>

                  <View style={styles.cardTagsRow}>
                    <View style={styles.jobTag}>
                      <Ionicons name="briefcase-outline" size={11} color={colors.secondaryText} />
                      <Text style={styles.jobTagText} numberOfLines={1}>
                        {item.jobs?.title || 'General'}
                      </Text>
                    </View>

                    <View style={styles.stageTag}>
                      <Ionicons name="layers-outline" size={11} color={colors.primary} />
                      <Text style={styles.stageTagText} numberOfLines={1}>
                        {item.stages?.name || 'Round'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* SCHEDULE & ACTION */}
                <View style={styles.cardRightCol}>
                  <View style={styles.timeBadge}>
                    <Ionicons name="time-outline" size={12} color={colors.primary} />
                    <Text style={styles.timeText}>{item.interview_time || '10:00 AM'}</Text>
                  </View>
                  <Text style={styles.dateSubtext}>{item.interview_date || 'Upcoming'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.inputBorder} style={{ alignSelf: 'flex-end', marginTop: 4 }} />
                </View>
              </Pressable>
            );
          })
        )}

        {/* RECENT FEEDBACK / PROGRESS SECTION */}
        <View style={styles.bottomRow}>
          <View style={styles.bottomCard}>
            <View style={styles.bottomCardHeader}>
              <View style={[styles.bottomIconWrap, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="shield-checkmark" size={18} color="#10B981" />
              </View>
              <Text style={styles.bottomCardTitle}>Recent Feedback</Text>
            </View>

            {feedback.length === 0 ? (
              <Text style={styles.bottomEmptyText}>No scorecards submitted yet.</Text>
            ) : (
              feedback.slice(0, 3).map((item) => {
                const isStrong = item.overall_verdict === 'strong_yes';
                const isMaybe = item.overall_verdict === 'maybe';
                return (
                  <View key={item.id} style={styles.feedbackMiniRow}>
                    <Ionicons
                      name={isStrong ? 'checkmark-circle' : isMaybe ? 'alert-circle' : 'close-circle'}
                      size={16}
                      color={isStrong ? '#10B981' : isMaybe ? '#F59E0B' : '#EF4444'}
                    />
                    <Text style={styles.feedbackMiniText} numberOfLines={1}>
                      {isStrong ? 'Strong Yes' : isMaybe ? 'Maybe / Hold' : 'No Verdict'}
                    </Text>
                    <Text style={styles.feedbackMiniDate}>
                      {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'Recent'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.bottomCard}>
            <View style={styles.bottomCardHeader}>
              <View style={[styles.bottomIconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="trending-up" size={18} color={colors.primary} />
              </View>
              <Text style={styles.bottomCardTitle}>Completion</Text>
            </View>

            <View style={styles.completionBody}>
              <Text style={styles.completionBigNumber}>
                {totalInterviews > 0 ? Math.round((completed / totalInterviews) * 100) : 100}%
              </Text>
              <Text style={styles.completionDesc}>
                {completed} of {totalInterviews} evaluations submitted
              </Text>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${totalInterviews > 0 ? Math.min((completed / totalInterviews) * 100, 100) : 100}%`,                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* OFFLINE DATABASE SYNC CARD */}
        <View style={styles.syncCard}>
          <View style={styles.syncCardLeft}>
            <View style={styles.syncIconCircle}>
              <Ionicons name="cloud-done-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncCardTitle}>Offline-First Engine</Text>
              <Text style={styles.syncCardDesc}>
                Evaluations are saved in local SQLite storage and replicate to cloud.
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.syncCardBtn}
            onPress={handleSync}
            disabled={syncing}
            hitSlop={8}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="refresh" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.syncCardBtnText}>Sync Now</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: '#06235C',
    paddingTop: 52,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#93C5FD',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  greetingSection: {
    marginTop: 2,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#60A5FA',
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.inputBorder,
    letterSpacing: 0.8,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: '#93C5FD',
    lineHeight: 18,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  statMeta: {
    fontSize: 11,
    color: colors.mutedText,
    marginTop: 2,
  },
  quickActionsCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  quickActionsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.mutedText,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionBtn: {
    alignItems: 'center',
    flex: 1,
  },
  quickActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 1,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 16,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.secondaryText,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  interviewCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  cardBody: {
    flex: 1,
    marginRight: 8,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  candidateRole: {
    fontSize: 12,
    color: colors.secondaryText,
    marginBottom: 6,
  },
  cardTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  jobTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.divider,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  jobTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.secondaryText,
    maxWidth: 90,
  },
  stageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  stageTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    maxWidth: 90,
  },
  cardRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginBottom: 3,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  dateSubtext: {
    fontSize: 11,
    color: colors.mutedText,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    marginBottom: 16,
  },
  bottomCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  bottomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  bottomIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  bottomEmptyText: {
    fontSize: 12,
    color: colors.mutedText,
    marginVertical: 8,
  },
  feedbackMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  feedbackMiniText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  feedbackMiniDate: {
    fontSize: 10,
    color: colors.mutedText,
  },
  completionBody: {
    alignItems: 'center',
    paddingTop: 4,
  },
  completionBigNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  completionDesc: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: colors.cardBorder,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  syncCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginTop: 4,
    marginBottom: 24,
  },
  syncCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  syncIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
    marginBottom: 2,
  },
  syncCardDesc: {
    fontSize: 11,
    color: colors.accent,
    lineHeight: 16,
  },
  syncCardBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  syncCardBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
});
