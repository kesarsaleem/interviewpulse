import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { getDb } from '../../lib/sqlite/schema';
import { runSync } from '../../lib/sync/syncEngine';
import { getLocalInterviews } from '../../services/feedbackService';
import InterviewerDrawer from '../../components/interviewer/InterviewerDrawer';

export default function UpcomingInterviewsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [interviews, setInterviews] = useState<any[]>([]);
  const [userFeedbackMap, setUserFeedbackMap] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'this_week' | 'today'>('all');

  const loadUpcoming = useCallback(async () => {
    try {
      if (!user?.id) return;

      // 1. Offline-First: load cached interviews from SQLite
      const local = getLocalInterviews();
      if (local.length > 0) {
        setInterviews(local);
      }

      const db = getDb();
      const localFeedbacks = db.getAllSync<any>(
        'SELECT id, candidate_id, stage_id, overall_verdict FROM feedback WHERE interviewer_id = ?',
        [user.id]
      );
      const fbMap: Record<string, any> = {};
      localFeedbacks.forEach((f) => {
        fbMap[`${f.candidate_id}_${f.stage_id}`] = f;
        fbMap[f.candidate_id] = f;
      });
      setUserFeedbackMap(fbMap);

      // 2. Online fetch from Supabase
      const { data: assignedJobs, error: jobError } = await supabase
        .from('job_interviewers')
        .select('job_id')
        .eq('user_id', user.id);

      if (jobError) throw jobError;

      const jobIds = assignedJobs?.map((x) => x.job_id) || [];
      if (jobIds.length === 0) {
        if (local.length === 0) setInterviews([]);
        return;
      }

      const { data: remoteCandidates, error: candError } = await supabase
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
          job_id,
          jobs (
            id,
            title,
            department
          ),
          stages (
            id,
            name
          )
        `)
        .in('job_id', jobIds);

      if (candError) throw candError;

      if (remoteCandidates) {
        setInterviews(remoteCandidates);

        const { data: remoteFeedbacks } = await supabase
          .from('feedback')
          .select('id, candidate_id, stage_id, overall_verdict')
          .eq('interviewer_id', user.id);

        if (remoteFeedbacks) {
          const updatedFbMap = { ...fbMap };
          remoteFeedbacks.forEach((f) => {
            updatedFbMap[`${f.candidate_id}_${f.stage_id}`] = f;
            updatedFbMap[f.candidate_id] = f;
          });
          setUserFeedbackMap(updatedFbMap);
        }
      }
    } catch (err: any) {
      console.warn('Error loading upcoming interviews:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUpcoming();
  };

  const handleManualSync = async () => {
    if (!user?.id) return;
    try {
      setSyncing(true);
      await runSync(user.id);
      await loadUpcoming();
      Alert.alert('Synced', 'Upcoming interview records updated successfully.');
    } catch (err: any) {
      Alert.alert('Sync Notice', 'Offline mode or sync failed: ' + (err?.message || 'Check connection'));
    } finally {
      setSyncing(false);
    }
  };

  const getRelativeDayInfo = (dateStr?: string | null) => {
    if (!dateStr) return { label: 'Upcoming', badgeColor: colors.secondaryText, isUrgent: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return { label: 'TODAY', badgeColor: '#059669', isUrgent: true };
    } else if (diffDays === 1) {
      return { label: 'TOMORROW', badgeColor: '#2563EB', isUrgent: false };
    } else if (diffDays > 1 && diffDays <= 7) {
      return { label: `IN ${diffDays} DAYS`, badgeColor: '#7C3AED', isUrgent: false };
    } else if (diffDays > 7) {
      return { label: dateStr, badgeColor: colors.secondaryText, isUrgent: false };
    } else {
      return { label: 'PAST DUE', badgeColor: '#DC2626', isUrgent: true };
    }
  };

  // Filter & sort upcoming interviews (soonest date first)
  const upcomingList = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return interviews
      .filter((item) => {
        const isUpcoming = !item.interview_date || item.interview_date >= todayStr;
        if (!isUpcoming) return false;

        if (filterScope === 'today') {
          if (item.interview_date !== todayStr) return false;
        } else if (filterScope === 'this_week') {
          if (!item.interview_date) return false;
          const diff =
            (new Date(item.interview_date).getTime() - new Date(todayStr).getTime()) /
            (1000 * 60 * 60 * 24);
          if (diff < 0 || diff > 7) return false;
        }

        if (search.trim()) {
          const q = search.toLowerCase();
          const name = (item.full_name || '').toLowerCase();
          const role = (item.current_role || '').toLowerCase();
          const company = (item.current_company || '').toLowerCase();
          const job = (item.jobs?.title || '').toLowerCase();
          const dept = (item.jobs?.department || '').toLowerCase();

          return (
            name.includes(q) ||
            role.includes(q) ||
            company.includes(q) ||
            job.includes(q) ||
            dept.includes(q)
          );
        }

        return true;
      })
      .sort((a, b) => {
        if (!a.interview_date) return 1;
        if (!b.interview_date) return -1;
        const cmp = a.interview_date.localeCompare(b.interview_date);
        if (cmp !== 0) return cmp;
        return (a.interview_time || '').localeCompare(b.interview_time || '');
      });
  }, [interviews, filterScope, search]);

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading upcoming schedule...</Text>
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
            style={styles.menuButton}
            onPress={() => setDrawerOpen(true)}
            hitSlop={12}
          >
            <Ionicons name="menu-outline" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Upcoming Schedule</Text>
            <Text style={styles.headerSubtitle}>
              {upcomingList.length} candidate session{upcomingList.length === 1 ? '' : 's'}
            </Text>
          </View>

          <Pressable
            style={styles.syncBtn}
            onPress={handleManualSync}
            disabled={syncing}
            hitSlop={10}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={15} color="#FFFFFF" />
                <Text style={styles.syncBtnText}>Sync</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* SEARCH BAR */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.mutedText} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by candidate, role, or position..."
            placeholderTextColor={colors.mutedText}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </Pressable>
          )}
        </View>
      </View>

      {/* TIMEFRAME SCOPE TABS */}
      <View style={styles.scopeBar}>
        {(
          [
            { id: 'all', label: 'All Upcoming' },
            { id: 'this_week', label: 'This Week' },
            { id: 'today', label: 'Today' },
          ] as const
        ).map((tab) => {
          const active = filterScope === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.scopeTab, active && styles.scopeTabActive]}
              onPress={() => setFilterScope(tab.id)}
            >
              <Text style={[styles.scopeTabText, active && styles.scopeTabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* SESSIONS LIST */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {upcomingList.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={36} color={colors.mutedText} />
            </View>
            <Text style={styles.emptyTitle}>No Upcoming Interviews</Text>
            <Text style={styles.emptySubtitle}>
              {search.trim() || filterScope !== 'all'
                ? 'No scheduled interviews match your search or filter timeframe.'
                : 'You are completely caught up! New candidate loops will appear here as they are booked.'}
            </Text>
            {(search.trim() || filterScope !== 'all') && (
              <Pressable
                style={styles.clearFilterBtn}
                onPress={() => {
                  setSearch('');
                  setFilterScope('all');
                }}
              >
                <Text style={styles.clearFilterBtnText}>Show All Upcoming</Text>
              </Pressable>
            )}
          </View>
        ) : (
          upcomingList.map((item) => {
            const fbKey = `${item.id}_${item.current_stage_id}`;
            const userFb = userFeedbackMap[fbKey] || userFeedbackMap[item.id];
            const hasSubmitted = !!userFb;
            const dayInfo = getRelativeDayInfo(item.interview_date);
            const stageName = item.stages?.name || 'Interview Round';
            const jobTitle = item.jobs?.title || 'Open Position';
            const initials = getInitials(item.full_name || 'Candidate');

            return (
              <View key={item.id} style={styles.sessionCard}>
                {/* TOP SCHEDULE ROW */}
                <View style={styles.scheduleRow}>
                  <View
                    style={[
                      styles.dayBadge,
                      { backgroundColor: dayInfo.badgeColor + '18', borderColor: dayInfo.badgeColor + '35' },
                    ]}
                  >
                    <Ionicons name="time-outline" size={12} color={dayInfo.badgeColor} />
                    <Text style={[styles.dayBadgeText, { color: dayInfo.badgeColor }]}>
                      {dayInfo.label}
                    </Text>
                  </View>

                  {item.interview_time ? (
                    <View style={styles.timeTag}>
                      <Ionicons name="alarm-outline" size={12} color={colors.primary} />
                      <Text style={styles.timeTagText}>{item.interview_time}</Text>
                    </View>
                  ) : null}

                  {hasSubmitted ? (
                    <View style={[styles.statusPill, styles.submittedPill]}>
                      <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                      <Text style={styles.submittedPillText}>Feedback In</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, styles.pendingPill]}>
                      <Ionicons name="hourglass-outline" size={12} color="#B45309" />
                      <Text style={styles.pendingPillText}>Scorecard Pending</Text>
                    </View>
                  )}
                </View>

                {/* CANDIDATE ROW */}
                <View style={styles.candidateRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {item.full_name}
                    </Text>
                    <Text style={styles.candidateRole} numberOfLines={1}>
                      {item.current_role || 'Candidate'}{item.current_company ? ` • ${item.current_company}` : ''}
                    </Text>
                    <View style={styles.jobRow}>
                      <Ionicons name="briefcase-outline" size={11} color={colors.secondaryText} />
                      <Text style={styles.jobText} numberOfLines={1}>
                        {jobTitle}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stagePill}>
                    <Ionicons name="layers-outline" size={11} color={colors.primary} />
                    <Text style={styles.stagePillText} numberOfLines={1}>
                      {stageName}
                    </Text>
                  </View>
                </View>

                {/* DIVIDER */}
                <View style={styles.cardDivider} />

                {/* ACTIONS */}
                <View style={styles.actionsRow}>
                  {hasSubmitted ? (
                    <View style={styles.actionButtonGroup}>
                      <Pressable
                        style={styles.btnSecondary}
                        onPress={() =>
                          router.push({
                            pathname: `/candidates/${item.id}/panel`,
                            params: { stageId: item.current_stage_id },
                          } as any)
                        }
                      >
                        <Ionicons name="people-outline" size={15} color={colors.primary} />
                        <Text style={styles.btnSecondaryText}>Panel Summary</Text>
                      </Pressable>

                      <Pressable
                        style={styles.btnDark}
                        onPress={() =>
                          router.push({
                            pathname: '/interviewer/feedback-details',
                            params: {
                              feedbackId: userFb.id,
                              candidateId: item.id,
                              stageId: item.current_stage_id,
                            },
                          } as any)
                        }
                      >
                        <Text style={styles.btnDarkText}>View Feedback</Text>
                        <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.actionButtonGroup}>
                      <Pressable
                        style={styles.btnSecondary}
                        onPress={() =>
                          router.push({
                            pathname: `/candidates/${item.id}/panel`,
                            params: { stageId: item.current_stage_id },
                          } as any)
                        }
                      >
                        <Ionicons name="people-outline" size={15} color={colors.primary} />
                        <Text style={styles.btnSecondaryText}>Panel</Text>
                      </Pressable>

                      <Pressable
                        style={styles.btnPrimary}
                        onPress={() =>
                          router.push({
                            pathname: `/feedback/${item.id}`,
                            params: { stageId: item.current_stage_id },
                          } as any)
                        }
                      >
                        <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.btnPrimaryText}>Start Evaluation</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
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
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  loadingText: {
    marginTop: 12,
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: '#06235C',
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: '#93C5FD',
    fontSize: 12,
    marginTop: 2,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchBar: {
    backgroundColor: colors.card,
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  scopeBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  scopeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  scopeTabActive: {
    backgroundColor: colors.primaryLight,
  },
  scopeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  scopeTabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  scrollArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 270,
  },
  clearFilterBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  clearFilterBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  sessionCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  dayBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeTagText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.primary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginLeft: 'auto',
  },
  submittedPill: {
    backgroundColor: colors.successLight,
  },
  submittedPillText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  pendingPill: {
    backgroundColor: colors.warningLight,
  },
  pendingPillText: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '700',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  candidateInfo: {
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
    fontSize: 12.5,
    color: colors.secondaryText,
    fontWeight: '500',
    marginBottom: 3,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  jobText: {
    fontSize: 11,
    color: colors.secondaryText,
  },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    maxWidth: 100,
  },
  stagePillText: {
    fontSize: 10.5,
    color: colors.primary,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButtonGroup: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
    justifyContent: 'flex-end',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    gap: 5,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  btnDark: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 4,
  },
  btnDarkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
