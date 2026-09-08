import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { runSync } from '../../lib/sync/syncEngine';
import { getLocalInterviewerFeedback } from '../../services/feedbackService';
import InterviewerDrawer from '../../components/interviewer/InterviewerDrawer';

export default function FeedbackGiven() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');

  const loadFeedback = useCallback(async () => {
    try {
      if (!user?.id) return;

      // 1. Offline First: SQLite
      const local = getLocalInterviewerFeedback(user.id);
      if (local.length > 0) {
        setFeedbackList(local);
      }

      // 2. Online Update: Supabase
      const { data, error } = await supabase
        .from('feedback')
        .select(`
          id,
          candidate_id,
          stage_id,
          overall_verdict,
          submitted_at,
          sync_status,
          candidates (
            id,
            full_name,
            current_role,
            job_id,
            jobs (
              id,
              title
            )
          ),
          stages (
            id,
            name
          ),
          feedback_scores (
            score
          )
        `)
        .eq('interviewer_id', user.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formatted = data.map((item: any) => {
          const scs = item.feedback_scores || [];
          const avg =
            scs.length > 0
              ? Number((scs.reduce((sum: number, s: any) => sum + s.score, 0) / scs.length).toFixed(1))
              : 0;

          return {
            ...item,
            candidates: {
              id: item.candidates?.id || item.candidate_id,
              full_name: item.candidates?.full_name || 'Candidate',
              current_role: item.candidates?.current_role || 'Role',
              job_id: item.candidates?.job_id || item.candidates?.jobs?.id,
            },
            jobs: {
              id: item.candidates?.jobs?.id || item.candidates?.job_id,
              title: item.candidates?.jobs?.title || 'Job Opening',
            },
            stages: {
              name: item.stages?.name || 'Interview Round',
            },
            average_score: avg,
          };
        });

        setFeedbackList(formatted);
      }
    } catch (e: any) {
      console.log('FEEDBACK LOAD ERROR', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeedback();
    setRefreshing(false);
  };

  const syncNow = async () => {
    if (!user?.id) return;
    setSyncing(true);
    try {
      await runSync(user.id);
      await loadFeedback();
      Alert.alert('Synced', 'Feedback records are up to date.');
    } catch (e: any) {
      Alert.alert('Sync Notice', 'Offline mode or sync failed: ' + (e?.message || 'Check connection'));
    } finally {
      setSyncing(false);
    }
  };

  const openFeedbackDetails = (item: any) => {
    router.push({
      pathname: '/interviewer/feedback-details',
      params: {
        feedbackId: item.id,
        candidateId: item.candidate_id || item.candidates?.id,
        stageId: item.stage_id,
      },
    } as any);
  };

  // Distinct jobs for filtering
  const availableJobs = useMemo(() => {
    const map = new Map<string, string>();
    feedbackList.forEach((item) => {
      const jid = item.jobs?.id || item.candidates?.job_id;
      const title = item.jobs?.title;
      if (jid && title) {
        map.set(jid, title);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [feedbackList]);

  // Filtered feedback
  const filtered = useMemo(() => {
    return feedbackList.filter((item) => {
      // Filter by job
      if (selectedJobId !== 'all') {
        const itemJobId = item.jobs?.id || item.candidates?.job_id;
        if (itemJobId !== selectedJobId) return false;
      }

      // Filter by search
      if (search.trim()) {
        const q = search.toLowerCase();
        const name = (item.candidates?.full_name || '').toLowerCase();
        const role = (item.candidates?.current_role || '').toLowerCase();
        const stage = (item.stages?.name || '').toLowerCase();
        const job = (item.jobs?.title || '').toLowerCase();
        return name.includes(q) || role.includes(q) || stage.includes(q) || job.includes(q);
      }

      return true;
    });
  }, [feedbackList, selectedJobId, search]);

  // Statistics
  const totalCount = feedbackList.length;
  const strongYesCount = useMemo(() => {
    return feedbackList.filter((x) => x.overall_verdict === 'strong_yes').length;
  }, [feedbackList]);

  const maybeCount = useMemo(() => {
    return feedbackList.filter((x) => x.overall_verdict === 'maybe').length;
  }, [feedbackList]);

  const noCount = useMemo(() => {
    return feedbackList.filter((x) => x.overall_verdict === 'no').length;
  }, [feedbackList]);

  const avgOverallScore = useMemo(() => {
    const withScores = feedbackList.filter((x) => typeof x.average_score === 'number' && x.average_score > 0);
    if (withScores.length === 0) return '0.0';
    const sum = withScores.reduce((acc, curr) => acc + curr.average_score, 0);
    return (sum / withScores.length).toFixed(1);
  }, [feedbackList]);

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading submitted evaluations...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <InterviewerDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* MODERN SaaS TOP HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            style={styles.headerMenuBtn}
            onPress={() => setDrawerOpen(true)}
            hitSlop={10}
          >
            <Ionicons name="menu-outline" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Feedback Given</Text>
            <Text style={styles.headerSubtitle}>Candidate evaluation audit history</Text>
          </View>

          <Pressable
            style={styles.syncBtn}
            onPress={syncNow}
            disabled={syncing}
            hitSlop={8}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={15} color="#FFFFFF" />
                <Text style={styles.syncText}>Sync</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* SEARCH BAR (INTEGRATED IN HEADER CARD) */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.mutedText} />
          <TextInput
            placeholder="Search candidate, role, or stage..."
            placeholderTextColor={colors.mutedText}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* SUMMARY METRICS CARDS */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="documents-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricNumber}>{totalCount}</Text>
            <Text style={styles.metricLabel}>Total Submitted</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
            </View>
            <Text style={[styles.metricNumber, { color: '#059669' }]}>{strongYesCount}</Text>
            <Text style={styles.metricLabel}>Strong Yes</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="help-circle-outline" size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.metricNumber, { color: '#D97706' }]}>{maybeCount}</Text>
            <Text style={styles.metricLabel}>Maybe</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="star-outline" size={18} color="#8B5CF6" />
            </View>
            <Text style={[styles.metricNumber, { color: '#7C3AED' }]}>{avgOverallScore}</Text>
            <Text style={styles.metricLabel}>Avg Score</Text>
          </View>
        </View>

        {/* JOB FILTER PILLS */}
        {availableJobs.length > 0 && (
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsContainer}
            >
              <Pressable
                style={[styles.filterPill, selectedJobId === 'all' && styles.activeFilterPill]}
                onPress={() => setSelectedJobId('all')}
              >
                <Text style={[styles.filterPillText, selectedJobId === 'all' && styles.activeFilterPillText]}>
                  All Roles ({totalCount})
                </Text>
              </Pressable>

              {availableJobs.map((j) => {
                const count = feedbackList.filter(
                  (item) => (item.jobs?.id || item.candidates?.job_id) === j.id
                ).length;
                const active = selectedJobId === j.id;

                return (
                  <Pressable
                    key={j.id}
                    style={[styles.filterPill, active && styles.activeFilterPill]}
                    onPress={() => setSelectedJobId(j.id)}
                  >
                    <Ionicons
                      name="briefcase-outline"
                      size={13}
                      color={active ? '#FFFFFF' : colors.secondaryText}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.filterPillText, active && styles.activeFilterPillText]}>
                      {j.title} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* SECTION TITLE & BADGE */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Evaluations</Text>
            <Text style={styles.sectionSubtitle}>Tap card for complete criterion breakdown</Text>
          </View>
          <View style={styles.countBadgeWrap}>
            <Text style={styles.countBadgeText}>{filtered.length}</Text>
          </View>
        </View>

        {/* EVALUATION CARDS (HORIZONTAL LAYOUT: LEFT AVATAR, CENTER INFO, RIGHT VERDICT + SCORE + CHEVRON) */}
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbox-ellipses-outline" size={36} color={colors.mutedText} />
            </View>
            <Text style={styles.emptyTitle}>No Feedback Records Found</Text>
            <Text style={styles.emptySubtitle}>
              {search || selectedJobId !== 'all'
                ? 'No evaluations match your search filter criteria. Try adjusting keywords.'
                : 'You have not submitted candidate feedback yet. Go to My Interviews to start evaluating.'}
            </Text>
            {search || selectedJobId !== 'all' ? (
              <Pressable
                style={styles.resetFilterBtn}
                onPress={() => {
                  setSearch('');
                  setSelectedJobId('all');
                }}
              >
                <Text style={styles.resetFilterText}>Reset Filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          filtered.map((item) => {
            const verdict = item.overall_verdict;
            const isStrong = verdict === 'strong_yes';
            const isMaybe = verdict === 'maybe';
            const avg = item.average_score ? Number(item.average_score).toFixed(1) : '0.0';
            const candidateInitial = item.candidates?.full_name?.charAt(0)?.toUpperCase() || 'C';

            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.feedbackCard, pressed && styles.cardPressed]}
                onPress={() => openFeedbackDetails(item)}
              >
                {/* HORIZONTAL THREE-COLUMN LAYOUT */}
                <View style={styles.horizontalRow}>
                  {/* LEFT: CANDIDATE AVATAR */}
                  <View style={styles.avatarWrap}>
                    <Text style={styles.avatarText}>{candidateInitial}</Text>
                  </View>

                  {/* CENTER: CANDIDATE NAME, ROLE, JOB, STAGE + DATE */}
                  <View style={styles.centerInfo}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {item.candidates?.full_name || 'Candidate'}
                    </Text>

                    <Text style={styles.candidateRole} numberOfLines={1}>
                      {item.candidates?.current_role || 'Candidate'}
                    </Text>

                    <View style={styles.jobRow}>
                      <Ionicons name="briefcase-outline" size={11} color={colors.secondaryText} />
                      <Text style={styles.jobText} numberOfLines={1}>
                        {item.jobs?.title || 'Job Opening'}
                      </Text>
                    </View>

                    <View style={styles.stageDateRow}>
                      <View style={styles.stageBadge}>
                        <Ionicons name="layers-outline" size={10} color={colors.primary} />
                        <Text style={styles.stageBadgeText} numberOfLines={1}>
                          {item.stages?.name || 'Round'}
                        </Text>
                      </View>

                      <Text style={styles.dateSubtext}>
                        {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'Recent'}
                      </Text>
                    </View>
                  </View>

                  {/* RIGHT: VERDICT BADGE, SCORE, CHEVRON */}
                  <View style={styles.rightVerdictCol}>
                    <View
                      style={[
                        styles.verdictBadge,
                        isStrong ? styles.verdictStrongYes : isMaybe ? styles.verdictMaybe : styles.verdictNo,
                      ]}
                    >
                      <Ionicons
                        name={isStrong ? 'checkmark-circle' : isMaybe ? 'alert-circle' : 'close-circle'}
                        size={12}
                        color={isStrong ? '#15803D' : isMaybe ? '#B45309' : '#B91C1C'}
                        style={{ marginRight: 3 }}
                      />
                      <Text
                        style={[
                          styles.verdictText,
                          isStrong ? styles.textStrongYes : isMaybe ? styles.textMaybe : styles.textNo,
                        ]}
                      >
                        {isStrong ? 'Strong Yes' : isMaybe ? 'Maybe' : 'No'}
                      </Text>
                    </View>

                    <View style={styles.scoreRow}>
                      <Ionicons name="star" size={14} color="#F59E0B" />
                      <Text style={styles.scoreValue}>{avg}</Text>
                      <Text style={styles.scoreMax}>/5</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedText} style={{ marginLeft: 2 }} />
                    </View>
                  </View>
                </View>
              </Pressable>
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
    shadowColor: '#000',
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
    shadowColor: '#000',
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
  headerMenuBtn: {
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
  syncText: {
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
    shadowColor: '#000',
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
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 40,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricNumber: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.secondaryText,
    fontWeight: '600',
    textAlign: 'center',
  },
  filterSection: {
    marginBottom: 16,
  },
  filterPillsContainer: {
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  activeFilterPill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '700',
  },
  activeFilterPillText: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 1,
  },
  countBadgeWrap: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  countBadgeText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: 8,
  },
  emptyIconWrap: {
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
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  resetFilterBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
  },
  resetFilterText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  feedbackCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
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
    backgroundColor: colors.background,
    transform: [{ scale: 0.99 }],
  },
  horizontalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
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
    color: colors.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  centerInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
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
    fontWeight: '500',
    marginBottom: 3,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  jobText: {
    fontSize: 11,
    color: colors.secondaryText,
    flex: 1,
  },
  stageDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  stageBadgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
    maxWidth: 90,
  },
  dateSubtext: {
    fontSize: 10.5,
    color: colors.mutedText,
  },
  rightVerdictCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  verdictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  verdictStrongYes: {
    backgroundColor: '#DCFCE7',
  },
  verdictMaybe: {
    backgroundColor: '#FEF3C7',
  },
  verdictNo: {
    backgroundColor: '#FEE2E2',
  },
  verdictText: {
    fontSize: 11,
    fontWeight: '800',
  },
  textStrongYes: {
    color: '#15803D',
  },
  textMaybe: {
    color: '#B45309',
  },
  textNo: {
    color: '#B91C1C',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginLeft: 2,
  },
  scoreMax: {
    fontSize: 10,
    color: colors.mutedText,
  },
});
