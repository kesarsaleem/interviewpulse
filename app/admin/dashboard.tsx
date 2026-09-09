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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { runSync } from '../../lib/sync/syncEngine';
import { ROUTES } from '../../constants/routes';

interface DashboardStats {
  jobs: number;
  candidates: number;
  interviews: number;
  pendingDecisions: number;
}

interface ActivityItem {
  id: string;
  action: string;
  created_at: string;
  metadata?: any;
  candidate_id?: string;
  user_id?: string;
  candidates?: {
    full_name: string;
    jobs?: {
      title: string;
    };
  };
  profiles?: {
    name: string;
  };
}

export default function AdminDashboard() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    jobs: 0,
    candidates: 0,
    interviews: 0,
    pendingDecisions: 0,
  });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);

  const loadDashboardData = useCallback(async () => {
    try {
      const [
        { count: jobsCount, error: jobErr },
        { count: candCount, error: candErr },
        { count: feedbackCount, error: fbErr },
        { data: candidatesWithFeedback },
      ] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }),
        supabase.from('candidates').select('*', { count: 'exact', head: true }),
        supabase.from('feedback').select('*', { count: 'exact', head: true }),
        supabase.from('feedback').select('candidate_id'),
      ]);

      if (jobErr) console.warn('Dashboard jobs count error:', jobErr);
      if (candErr) console.warn('Dashboard candidates count error:', candErr);
      if (fbErr) console.warn('Dashboard feedback count error:', fbErr);

      // 4. Pending Decisions
      // Candidates who have feedback submitted, but have NOT had a hiring decision logged
      const uniqueCandIdsWithFb = Array.from(
        new Set(candidatesWithFeedback?.map((f) => f.candidate_id) || [])
      );

      let pendingDecisionsCount = 0;
      if (uniqueCandIdsWithFb.length > 0) {
        const [{ data: decidedLogs }, { data: decidedCandidates }] = await Promise.all([
          supabase
            .from('activity_logs')
            .select('candidate_id')
            .in('action', ['marked_hire', 'marked_reject'])
            .in('candidate_id', uniqueCandIdsWithFb),
          supabase
            .from('candidates')
            .select('id')
            .in('decision_status', ['hired', 'rejected'])
            .in('id', uniqueCandIdsWithFb),
        ]);

        const decidedCandIds = new Set([
          ...(decidedLogs?.map((l) => l.candidate_id) || []),
          ...(decidedCandidates?.map((c) => c.id) || []),
        ]);
        pendingDecisionsCount = uniqueCandIdsWithFb.filter((id) => !decidedCandIds.has(id)).length;
      }

      setStats({
        jobs: jobsCount || 0,
        candidates: candCount || 0,
        interviews: feedbackCount || 0,
        pendingDecisions: pendingDecisionsCount,
      });

      const [
        { data: jobsData },
        { count: conflicts, error: conflictErr },
        { data: activityData, error: actErr },
      ] = await Promise.all([
        supabase
          .from('jobs')
          .select(
            `
            id,
            title,
            department,
            status,
            candidates(id),
            stages(id)
          `
          )
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('activity_logs')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'conflict_detected'),
        supabase
          .from('activity_logs')
          .select(
            `
            id,
            action,
            metadata,
            created_at,
            candidate_id,
            candidates (
              full_name,
              jobs (
                title
              )
            ),
            profiles (
              name
            )
          `
          )
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      setRecentJobs(jobsData || []);
      if (conflictErr) {
        console.warn('Dashboard conflict count error:', conflictErr);
      } else {
        setConflictCount(conflicts || 0);
      }

      console.log('[DASHBOARD] Fetching recent activity logs...');
      if (actErr) {
        console.warn('Dashboard activity logs fetch error:', actErr);
      }

      if (activityData && activityData.length > 0) {
        console.log('[DASHBOARD] Loaded activities from Supabase:', activityData.length);
        setActivities(activityData as any);
      } else {
        // Fallback to local SQLite mirror if Supabase returned 0 rows or error
        console.log('[DASHBOARD] Checking local SQLite activity_logs fallback...');
        try {
          const { getDb } = require('../../lib/sqlite/schema');
          const db = getDb();
          const localLogs: any[] = db.getAllSync(
            `SELECT al.*, c.full_name as candidate_name, j.title as job_title, p.name as user_name
             FROM activity_logs al
             LEFT JOIN candidates c ON c.id = al.candidate_id
             LEFT JOIN jobs j ON j.id = c.job_id
             LEFT JOIN profiles p ON p.id = al.user_id
             ORDER BY al.created_at DESC LIMIT 8`
          );

          if (localLogs && localLogs.length > 0) {
            console.log('[DASHBOARD] Loaded fallback activities from SQLite:', localLogs.length);
            const mapped = localLogs.map((l: any) => {
              let meta = {};
              try {
                meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : (l.metadata || {});
              } catch (e) {}
              return {
                id: l.id,
                action: l.action,
                metadata: meta,
                created_at: l.created_at,
                candidate_id: l.candidate_id,
                candidates: {
                  full_name: l.candidate_name || (meta as any)?.candidate_name || 'Candidate',
                  jobs: {
                    title: l.job_title || 'Engineering',
                  },
                },
                profiles: {
                  name: l.user_name || 'Admin',
                },
              };
            });
            setActivities(mapped);
          } else {
            setActivities([]);
          }
        } catch (localErr) {
          console.warn('Local activity logs fallback exception:', localErr);
          setActivities([]);
        }
      }
    } catch (err: any) {
      console.warn('Load dashboard exception:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
  };

  const syncNow = async () => {
    if (!user?.id) return;
    try {
      setSyncing(true);
      await runSync(user.id);
      await loadDashboardData();
      Alert.alert('Sync Complete', 'Local data and server data are in sync.');
    } catch (err: any) {
      Alert.alert('Sync Failed', err?.message || 'Unable to complete synchronization.');
    } finally {
      setSyncing(false);
    }
  };

  const getTimeAgo = (isoDate: string) => {
    if (!isoDate) return '';
    const diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(isoDate).toLocaleDateString();
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'candidate_added':
        return { icon: 'person-add-outline', color: colors.primary, bg: '#EFF6FF' };
      case 'stage_moved':
        return { icon: 'arrow-forward-circle-outline', color: '#0D9488', bg: '#F0FDFA' };
      case 'feedback_submitted':
        return { icon: 'chatbox-ellipses-outline', color: '#7C3AED', bg: colors.primaryLight };
      case 'marked_hire':
        return { icon: 'checkmark-circle-outline', color: colors.success, bg: colors.successLight };
      case 'marked_reject':
        return { icon: 'close-circle-outline', color: colors.danger, bg: colors.dangerLight };
      default:
        return { icon: 'flash-outline', color: colors.secondaryText, bg: colors.divider };
    }
  };

  const getActivityText = (item: ActivityItem) => {
    const candName = item.candidates?.full_name || 'Candidate';
    const jobTitle = item.candidates?.jobs?.title || '';
    const userName = item.profiles?.name;

    switch (item.action) {
      case 'candidate_added':
        return {
          primary: `${candName} was added`,
          secondary: jobTitle ? `For ${jobTitle}` : 'Added to hiring pipeline',
        };
      case 'stage_moved':
        const stageName = item.metadata?.stage_name || item.metadata?.to_stage || 'next stage';
        return {
          primary: `${candName} advanced to ${stageName}`,
          secondary: userName ? `Updated by ${userName}` : 'Stage updated',
        };
      case 'feedback_submitted':
        return {
          primary: `Feedback submitted for ${candName}`,
          secondary: userName ? `Evaluated by ${userName}` : 'Score & verdict logged',
        };
      case 'marked_hire':
        return {
          primary: `${candName} marked as HIRED 🎉`,
          secondary: item.metadata?.decision_note || 'Hiring offer confirmed',
        };
      case 'marked_reject':
        return {
          primary: `${candName} marked as REJECTED`,
          secondary: item.metadata?.decision_note || 'Application closed',
        };
      default:
        return {
          primary: `${candName}: ${item.action}`,
          secondary: 'Pipeline update',
        };
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Hiring Dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* HEADER ROW */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'Hiring Manager'}</Text>
          <Text style={styles.userRole}>Admin & Hiring Operations</Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable style={styles.refreshBtn} onPress={onRefresh} hitSlop={10}>
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
            onPress={syncNow}
            disabled={syncing}
          >
            <Ionicons name="sync-outline" size={18} color="#FFFFFF" />
            <Text style={styles.syncBtnText}>{syncing ? 'Syncing' : 'Sync'}</Text>
          </Pressable>
        </View>
      </View>

      {conflictCount > 0 && (
        <View
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.warning,
            backgroundColor: colors.warningLight,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="warning-outline" size={20} color={colors.warning} />
          <Text style={{ flex: 1, marginLeft: 10, color: colors.text, fontWeight: '600' }}>
            {conflictCount} sync conflict{conflictCount === 1 ? '' : 's'} need review.
          </Text>
          <Pressable onPress={() => router.push(ROUTES.adminCompare)}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Review</Text>
          </Pressable>
        </View>
      )}

      {/* STATS OVERVIEW CARDS */}
      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.statsGrid}>
        <Pressable
          style={[styles.statCard, { borderLeftColor: '#2563EB' }]}
          onPress={() => router.push(ROUTES.adminJobs)}
        >
          <View style={[styles.statIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.statNumber}>{stats.jobs}</Text>
          <Text style={styles.statLabel}>Total Jobs</Text>
        </Pressable>

        <Pressable
          style={[styles.statCard, { borderLeftColor: '#0D9488' }]}
          onPress={() => router.push(ROUTES.adminCandidates)}
        >
          <View style={[styles.statIconWrap, { backgroundColor: '#F0FDFA' }]}>
            <Ionicons name="people-outline" size={20} color="#0D9488" />
          </View>
          <Text style={styles.statNumber}>{stats.candidates}</Text>
          <Text style={styles.statLabel}>Candidates</Text>
        </Pressable>

        <Pressable
          style={[styles.statCard, { borderLeftColor: '#7C3AED' }]}
          onPress={() => router.push(ROUTES.adminInterviews)}
        >
          <View style={[styles.statIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="chatbubbles-outline" size={20} color="#7C3AED" />
          </View>
          <Text style={styles.statNumber}>{stats.interviews}</Text>
          <Text style={styles.statLabel}>Total Interviews</Text>
        </Pressable>

        <Pressable
          style={[styles.statCard, { borderLeftColor: '#EA580C' }]}
          onPress={() => router.push(ROUTES.adminCompare)}
        >
          <View style={[styles.statIconWrap, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="hourglass-outline" size={20} color="#EA580C" />
          </View>
          <Text style={styles.statNumber}>{stats.pendingDecisions}</Text>
          <Text style={styles.statLabel}>Pending Decision</Text>
        </Pressable>
      </View>

      {/* QUICK ACTIONS */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => router.push(ROUTES.adminCreateJob)}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.actionBtnText}>Create Job</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => router.push(ROUTES.adminSelectJob)}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#0D9488' }]}>
            <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.actionBtnText}>Add Candidate</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => router.push(ROUTES.adminCompare)}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="git-compare-outline" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.actionBtnText}>Compare</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => router.push(ROUTES.adminInterviewers)}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: colors.secondaryText }]}>
            <Ionicons name="people-outline" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.actionBtnText}>Interviewers</Text>
        </Pressable>
      </View>

      {/* ACTIVE JOBS PIPELINE */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Active Jobs</Text>
        <Pressable onPress={() => router.push(ROUTES.adminJobs)}>
          <Text style={styles.seeAllLink}>View All ({stats.jobs})</Text>
        </Pressable>
      </View>

      {recentJobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="briefcase-outline" size={32} color={colors.mutedText} />
          <Text style={styles.emptyTitle}>No Jobs Created Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first job opening to start receiving candidates and evaluations.
          </Text>
          <Pressable
            style={styles.emptyCta}
            onPress={() => router.push(ROUTES.adminCreateJob)}
          >
            <Text style={styles.emptyCtaText}>Create Job Now</Text>
          </Pressable>
        </View>
      ) : (
        recentJobs.map((job) => (
          <Pressable
            key={job.id}
            style={styles.jobCard}
            onPress={() =>
              router.push({
                pathname: ROUTES.adminJobDetail,
                params: { id: job.id },
              })
            }
          >
            <View style={styles.jobCardTop}>
              <View style={styles.jobCardLeft}>
                <Text style={styles.jobCardTitle}>{job.title}</Text>
                <Text style={styles.jobCardDept}>{job.department || 'General'}</Text>
              </View>

              <View
                style={[
                  styles.jobStatusPill,
                  job.status === 'open' ? styles.statusOpen : styles.statusClosed,
                ]}
              >
                <Text
                  style={[
                    styles.jobStatusText,
                    job.status === 'open' ? styles.statusOpenText : styles.statusClosedText,
                  ]}
                >
                  {job.status || 'open'}
                </Text>
              </View>
            </View>

            <View style={styles.jobMetaRow}>
              <View style={styles.jobMetaItem}>
                <Ionicons name="people-outline" size={14} color={colors.secondaryText} />
                <Text style={styles.jobMetaText}>
                  {job.candidates?.length || 0} candidate{job.candidates?.length === 1 ? '' : 's'}
                </Text>
              </View>

              <View style={styles.jobMetaItem}>
                <Ionicons name="git-branch-outline" size={14} color={colors.secondaryText} />
                <Text style={styles.jobMetaText}>
                  {job.stages?.length || 0} stage{job.stages?.length === 1 ? '' : 's'}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={16} color={colors.mutedText} style={{ marginLeft: 'auto' }} />
            </View>
          </Pressable>
        ))
      )}

      {/* RECENT ACTIVITY TIMELINE */}
      <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
      </View>

      {activities.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={32} color={colors.mutedText} />
          <Text style={styles.emptyTitle}>No Activity Yet</Text>
          <Text style={styles.emptySubtitle}>
            Candidate actions, stage transitions, and feedback submissions will appear here in real-time.
          </Text>
        </View>
      ) : (
        <View style={styles.activityList}>
          {activities.map((item, idx) => {
            const iconConfig = getActivityIcon(item.action);
            const content = getActivityText(item);
            const isLast = idx === activities.length - 1;

            return (
              <View key={item.id} style={styles.activityItem}>
                <View style={styles.activityTimelineColumn}>
                  <View style={[styles.activityIconCircle, { backgroundColor: iconConfig.bg }]}>
                    <Ionicons name={iconConfig.icon as any} size={18} color={iconConfig.color} />
                  </View>
                  {!isLast && <View style={styles.timelineLine} />}
                </View>

                <View style={styles.activityContent}>
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityPrimary}>{content.primary}</Text>
                    <Text style={styles.activityTime}>{getTimeAgo(item.created_at)}</Text>
                  </View>
                  <Text style={styles.activitySecondary}>{content.secondary}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.secondaryText,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 6,
  },
  headerLeft: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  greeting: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '500',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  userRole: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  syncBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  syncBtnDisabled: {
    opacity: 0.65,
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  seeAllLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderLeftWidth: 4,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '500',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondaryText,
    textAlign: 'center',
  },
  jobCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  jobCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  jobCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  jobCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  jobCardDept: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  jobStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusOpen: {
    backgroundColor: colors.successLight,
  },
  statusClosed: {
    backgroundColor: colors.divider,
  },
  jobStatusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusOpenText: {
    color: colors.success,
  },
  statusClosedText: {
    color: colors.secondaryText,
  },
  jobMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
  },
  jobMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  jobMetaText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 10,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  emptyCta: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activityList: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  activityItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  activityTimelineColumn: {
    alignItems: 'center',
    marginRight: 12,
  },
  activityIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.cardBorder,
    marginTop: 4,
  },
  activityContent: {
    flex: 1,
    paddingTop: 2,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  activityPrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  activityTime: {
    fontSize: 11,
    color: colors.mutedText,
  },
  activitySecondary: {
    fontSize: 12,
    color: colors.secondaryText,
  },
});
