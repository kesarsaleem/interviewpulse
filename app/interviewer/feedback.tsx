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
import Input from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

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
        .select(
          `
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
        `
        )
        .eq('interviewer_id', user.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formatted = data.map((item: any) => {
          const scs = item.feedback_scores || [];
          const avg = scs.length > 0
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

  // Statistics (kept for logic/consumers even though not shown in this screen's UI)
  const pendingSyncCount = useMemo(() => {
    return feedbackList.filter((x) => x.sync_status === 'pending').length;
  }, [feedbackList]);

  const strongYesCount = useMemo(() => {
    return feedbackList.filter((x) => x.overall_verdict === 'strong_yes').length;
  }, [feedbackList]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading submitted feedback...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <InterviewerDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={() => setDrawerOpen(true)} hitSlop={10}>
          <Ionicons name="menu" size={26} color="#fff" />
        </Pressable>

        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>Feedback Given</Text>
          <Text style={styles.headerSubtitle}>All candidate evaluations you've submitted</Text>
        </View>

        <Button
          label={syncing ? 'Syncing...' : 'Sync'}
          onPress={syncNow}
          loading={syncing}
          disabled={syncing}
          size="sm"
          icon={<Ionicons name="sync" size={16} color="#fff" />}
        />
      </View>

      {/* SEARCH BOX */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="search-outline" size={19} color={colors.mutedText} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Input
            placeholder="Search by candidate name, role, or stage..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedText} />
          </Pressable>
        ) : null}
      </View>

      {/* JOB FILTER TABS */}
      {availableJobs.length > 0 && (
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
            <Pressable
              style={[styles.filterPill, selectedJobId === 'all' && styles.activeFilterPill]}
              onPress={() => setSelectedJobId('all')}
            >
              <Text style={[styles.filterPillText, selectedJobId === 'all' && styles.activeFilterPillText]}>
                All Jobs ({feedbackList.length})
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
                  <Text style={[styles.filterPillText, active && styles.activeFilterPillText]}>
                    💼 {j.title} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* CONTENT LIST */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* SECTION HEADER */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Submitted Feedback</Text>
          <View style={styles.countBadgeWrap}>
            <Text style={styles.countBadge}>{filtered.length}</Text>
          </View>
        </View>

        {/* CARDS LIST */}
        {filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              title="No feedback records found"
              description={
                search || selectedJobId !== 'all'
                  ? 'No evaluations match your current filter. Try adjusting search or job selection.'
                  : 'You have not submitted any feedback yet. Go to My Interviews to review candidates.'
              }
            />
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
            const avg = item.average_score ? Number(item.average_score).toFixed(1) : '0.0';

            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => openFeedbackDetails(item)}
              >
                <View style={styles.cardRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {item.candidates?.full_name?.charAt(0)?.toUpperCase() || 'C'}
                    </Text>
                  </View>

                  <View style={styles.cardMiddle}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.candidates?.full_name || 'Candidate'}
                    </Text>

                    <Text style={styles.roleText} numberOfLines={1}>
                      {item.candidates?.current_role || 'Candidate'} • {item.jobs?.title || 'Job'}
                    </Text>

                    <View style={styles.metaRow}>
                      <View style={styles.stagePill}>
                        <Ionicons name="layers-outline" size={12} color={colors.secondaryText} />
                        <Text style={styles.stageText}>{item.stages?.name || 'Round'}</Text>
                      </View>

                      <View style={styles.datePill}>
                        <Ionicons name="calendar-outline" size={12} color={colors.mutedText} />
                        <Text style={styles.dateText}>
                          {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'Recent'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    <View
                      style={[
                        styles.verdictBadge,
                        verdict === 'strong_yes'
                          ? styles.verdictStrongYes
                          : verdict === 'maybe'
                          ? styles.verdictMaybe
                          : styles.verdictNo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.verdictText,
                          verdict === 'strong_yes'
                            ? styles.greenText
                            : verdict === 'maybe'
                            ? styles.yellowText
                            : styles.redText,
                        ]}
                      >
                        {verdict === 'strong_yes'
                          ? 'Strong Yes'
                          : verdict === 'maybe'
                          ? 'Maybe'
                          : 'No'}
                      </Text>
                    </View>

                    <View style={styles.scoreRow}>
                      <Ionicons name="star" size={16} color="#F59E0B" />
                      <Text style={styles.scoreText}>{avg}</Text>
                      <Text style={styles.scoreMax}>/5</Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#06235C',
    paddingHorizontal: 18,
    paddingTop: 45,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: colors.inputBorder,
    fontSize: 12.5,
    marginTop: 3,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
  },
  syncText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.card,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  filterSection: {
    marginTop: 14,
  },
  filterPills: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterPill: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  activeFilterPill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '700',
  },
  activeFilterPillText: {
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  countBadgeWrap: {
    backgroundColor: colors.primaryLight,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadge: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    elevation: 3,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  cardPressed: {
    backgroundColor: colors.background,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  cardMiddle: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  roleText: {
    fontSize: 13,
    color: colors.secondaryText,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.divider,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  stageText: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '700',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11.5,
    color: colors.mutedText,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 52,
    marginLeft: 8,
  },
  verdictBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  verdictStrongYes: {
    backgroundColor: colors.successLight,
  },
  verdictMaybe: {
    backgroundColor: colors.warningLight,
  },
  verdictNo: {
    backgroundColor: colors.dangerLight,
  },
  verdictText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  greenText: {
    color: colors.success,
  },
  yellowText: {
    color: '#D97706',
  },
  redText: {
    color: colors.danger,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  scoreMax: {
    fontSize: 11,
    color: colors.mutedText,
    marginRight: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  resetFilterBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
  },
  resetFilterText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
