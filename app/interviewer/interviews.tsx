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
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { getDb } from '../../lib/sqlite/schema';
import { runSync } from '../../lib/sync/syncEngine';
import { getLocalInterviews } from '../../services/feedbackService';
import InterviewerDrawer from '../../components/interviewer/InterviewerDrawer';
import { EmptyState } from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

type SortOption = 'date_asc' | 'date_desc' | 'name_asc' | 'stage';

export default function MyInterviews() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [interviews, setInterviews] = useState<any[]>([]);
  const [userFeedbackMap, setUserFeedbackMap] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_asc');
  const [showSortModal, setShowSortModal] = useState(false);

  const loadInterviews = useCallback(async () => {
    try {
      if (!user?.id) return;

      // 1. Offline First: SQLite
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
      });
      setUserFeedbackMap(fbMap);

      // 2. Online Update: Supabase
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

      const { data: candidates, error: candError } = await supabase
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
            title,
            department
          ),
          stages (
            name
          )
        `)
        .in('job_id', jobIds);

      if (candError) throw candError;

      if (candidates) {
        setInterviews(candidates);
      }

      // Fetch user's feedback online
      const { data: onlineFeedback } = await supabase
        .from('feedback')
        .select('id, candidate_id, stage_id, overall_verdict')
        .eq('interviewer_id', user.id);

      if (onlineFeedback) {
        const updatedFbMap = { ...fbMap };
        onlineFeedback.forEach((f) => {
          updatedFbMap[`${f.candidate_id}_${f.stage_id}`] = f;
        });
        setUserFeedbackMap(updatedFbMap);
      }
    } catch (e: any) {
      console.log('INTERVIEW LOAD ERROR', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadInterviews();
  }, [loadInterviews]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInterviews();
    setRefreshing(false);
  };

  const syncNow = async () => {
    if (!user?.id) return;
    setSyncing(true);
    try {
      await runSync(user.id);
      await loadInterviews();
      Alert.alert('Synced', 'Interview assignments refreshed from server.');
    } catch (e: any) {
      Alert.alert('Sync Notice', 'Offline mode or sync failed: ' + (e?.message || 'Check connection'));
    } finally {
      setSyncing(false);
    }
  };

  // Filter & Sort
  const processedInterviews = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    // Filter by tab
    let list = interviews.filter((item) => {
      const date = item.interview_date || '';
      if (tab === 'upcoming') {
        return date === '' || date >= today;
      } else {
        return date !== '' && date < today;
      }
    });

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) => {
        const name = (item.full_name || '').toLowerCase();
        const role = (item.current_role || '').toLowerCase();
        const company = (item.current_company || '').toLowerCase();
        const job = (item.jobs?.title || '').toLowerCase();
        const stage = (item.stages?.name || '').toLowerCase();
        return name.includes(q) || role.includes(q) || company.includes(q) || job.includes(q) || stage.includes(q);
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'date_asc') {
        const d1 = a.interview_date || '9999-12-31';
        const d2 = b.interview_date || '9999-12-31';
        return d1.localeCompare(d2);
      }
      if (sortBy === 'date_desc') {
        const d1 = a.interview_date || '0000-00-00';
        const d2 = b.interview_date || '0000-00-00';
        return d2.localeCompare(d1);
      }
      if (sortBy === 'name_asc') {
        return (a.full_name || '').localeCompare(b.full_name || '');
      }
      if (sortBy === 'stage') {
        const s1 = a.stages?.name || '';
        const s2 = b.stages?.name || '';
        return s1.localeCompare(s2);
      }
      return 0;
    });

    return list;
  }, [interviews, tab, search, sortBy]);

  const upcomingCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return interviews.filter((i) => !i.interview_date || i.interview_date >= today).length;
  }, [interviews]);

  const pastCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return interviews.filter((i) => i.interview_date && i.interview_date < today).length;
  }, [interviews]);

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading assigned interviews...</Text>
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
            <Text style={styles.headerTitle}>My Interviews</Text>
            <Text style={styles.headerSub}>Assigned candidate rounds & evaluations</Text>
          </View>

          <Button
            label={syncing ? 'Syncing...' : 'Sync'}
            onPress={syncNow}
            loading={syncing}
            disabled={syncing}
            size="sm"
            icon={<Ionicons name="sync-outline" size={15} color="#FFFFFF" />}
          />
        </View>

        {/* SEARCH & SORT INPUT */}
        <View style={styles.searchRow}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="search-outline" size={18} color={colors.mutedText} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Input
                placeholder="Search candidate, role, or stage..."
                value={search}
                onChangeText={setSearch}
              />
            </View>
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={6}>
                <Ionicons name="close-circle" size={18} color={colors.mutedText} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={styles.sortBtn}
            onPress={() => setShowSortModal(true)}
            hitSlop={6}
          >
            <Ionicons name="swap-vertical" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* SEGMENTED TAB SWITCHER */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, tab === 'upcoming' && styles.activeTabItem]}
          onPress={() => setTab('upcoming')}
        >
          <Ionicons
            name="calendar"
            size={15}
            color={tab === 'upcoming' ? '#2563EB' : colors.secondaryText}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabItemText, tab === 'upcoming' && styles.activeTabItemText]}>
            Upcoming ({upcomingCount})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabItem, tab === 'past' && styles.activeTabItem]}
          onPress={() => setTab('past')}
        >
          <Ionicons
            name="time"
            size={15}
            color={tab === 'past' ? '#2563EB' : colors.secondaryText}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabItemText, tab === 'past' && styles.activeTabItemText]}>
            Past ({pastCount})
          </Text>
        </Pressable>
      </View>

      {/* ACTIVE SORT CHIP */}
      <View style={styles.activeSortRow}>
        <View style={styles.sortPill}>
          <Ionicons name="funnel-outline" size={12} color={colors.primary} />
          <Text style={styles.sortPillText}>
            {sortBy === 'date_asc'
              ? 'Date: Earliest First'
              : sortBy === 'date_desc'
              ? 'Date: Latest First'
              : sortBy === 'name_asc'
              ? 'Name: A to Z'
              : 'Stage'}
          </Text>
        </View>
        <Text style={styles.resultCountText}>{processedInterviews.length} candidates</Text>
      </View>

      {/* CANDIDATES LIST */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {processedInterviews.length === 0 ? (
          <View style={styles.emptyCard}>
            <EmptyState
              title={
                search
                  ? 'No matching candidates'
                  : tab === 'upcoming'
                  ? 'No Upcoming Interviews'
                  : 'No Past Interviews'
              }
              description={
                search
                  ? `No assigned candidates match "${search}". Try clearing the search query.`
                  : tab === 'upcoming'
                  ? 'When candidates are scheduled for your assigned interview rounds, they will appear here.'
                  : 'Candidates you evaluated previously will appear in your past interview archive.'
              }
            />
            {search ? (
              <Pressable style={styles.clearSearchBtn} onPress={() => setSearch('')}>
                <Text style={styles.clearSearchText}>Clear Search</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          processedInterviews.map((item) => {
            const feedbackKey = `${item.id}_${item.current_stage_id}`;
            const existingFeedback = userFeedbackMap[feedbackKey];
            const hasSubmitted = !!existingFeedback;
            const candidateInitial = item.full_name?.charAt(0)?.toUpperCase() || 'C';

            return (
              <View key={item.id} style={styles.interviewCard}>
                {/* TOP HEADER: AVATAR, NAME, ROLE, STAGE BADGE */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{candidateInitial}</Text>
                  </View>

                  <View style={styles.headerInfo}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {item.full_name}
                    </Text>
                    <Text style={styles.candidateRole} numberOfLines={1}>
                      {item.current_role || 'Candidate'}{item.current_company ? ` • ${item.current_company}` : ''}
                    </Text>
                    <View style={styles.jobBadgeRow}>
                      <Ionicons name="briefcase-outline" size={11} color={colors.secondaryText} />
                      <Text style={styles.jobText} numberOfLines={1}>
                        {item.jobs?.title || 'Open Position'}
                        {item.jobs?.department ? ` (${item.jobs.department})` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stageBadge}>
                    <Ionicons name="layers-outline" size={11} color={colors.primary} />
                    <Text style={styles.stageBadgeText} numberOfLines={1}>
                      {item.stages?.name || 'Interview Round'}
                    </Text>
                  </View>
                </View>

                {/* DIVIDER */}
                <View style={styles.cardDivider} />

                {/* SCHEDULE AND STATUS INFO ROW */}
                <View style={styles.infoRow}>
                  <View style={styles.infoPill}>
                    <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                    <Text style={styles.infoText}>{item.interview_date || 'Date TBD'}</Text>
                  </View>

                  <View style={styles.infoPill}>
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={styles.infoText}>{item.interview_time || 'Time TBD'}</Text>
                  </View>

                  {hasSubmitted ? (
                    <View style={[styles.statusPill, styles.submittedPill]}>
                      <Ionicons name="checkmark-circle" size={13} color="#15803D" />
                      <Text style={styles.submittedPillText}>Feedback In</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, styles.pendingPill]}>
                      <Ionicons name="hourglass-outline" size={13} color="#B45309" />
                      <Text style={styles.pendingPillText}>Scorecard Pending</Text>
                    </View>
                  )}
                </View>

                {/* CARD ACTIONS */}
                <View style={styles.cardActionsRow}>
                  {hasSubmitted ? (
                    <View style={styles.actionBtnGroup}>
                      <Pressable
                        style={styles.panelSummaryBtn}
                        onPress={() => {
                          router.push({
                            pathname: `/candidates/${item.id}/panel`,
                            params: { stageId: item.current_stage_id },
                          } as any);
                        }}
                      >
                        <Ionicons name="people-outline" size={14} color={colors.primary} />
                        <Text style={styles.panelSummaryText}>Panel Summary</Text>
                      </Pressable>

                      <Pressable
                        style={styles.viewFeedbackBtn}
                        onPress={() => {
                          router.push({
                            pathname: '/interviewer/feedback-details',
                            params: {
                              feedbackId: existingFeedback.id,
                              candidateId: item.id,
                              stageId: item.current_stage_id,
                            },
                          } as any);
                        }}
                      >
                        <Text style={styles.viewFeedbackText}>View Feedback</Text>
                        <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.actionBtnGroup}>
                      <Pressable
                        style={styles.panelSummaryBtn}
                        onPress={() => {
                          router.push({
                            pathname: `/candidates/${item.id}/panel`,
                            params: { stageId: item.current_stage_id },
                          } as any);
                        }}
                      >
                        <Ionicons name="people-outline" size={14} color={colors.primary} />
                        <Text style={styles.panelSummaryText}>Panel</Text>
                      </Pressable>

                      <Pressable
                        style={styles.giveFeedbackBtn}
                        onPress={() => {
                          router.push({
                            pathname: `/feedback/${item.id}`,
                            params: { stageId: item.current_stage_id },
                          } as any);
                        }}
                      >
                        <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.giveFeedbackText}>Evaluate Candidate</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* SORT BOTTOM SHEET / MODAL */}
      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.sortModal}>
            <View style={styles.modalDragHandle} />
            <Text style={styles.sortModalTitle}>Sort Interviews</Text>

            {[
              { id: 'date_asc', label: 'Interview Date (Earliest first)', icon: 'calendar-outline' },
              { id: 'date_desc', label: 'Interview Date (Latest first)', icon: 'time-outline' },
              { id: 'name_asc', label: 'Candidate Name (A - Z)', icon: 'person-outline' },
              { id: 'stage', label: 'Interview Stage', icon: 'layers-outline' },
            ].map((opt) => (
              <Pressable
                key={opt.id}
                style={[styles.sortOption, sortBy === opt.id && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy(opt.id as SortOption);
                  setShowSortModal(false);
                }}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={18}
                  color={sortBy === opt.id ? '#2563EB' : colors.secondaryText}
                />
                <Text style={[styles.sortOptionText, sortBy === opt.id && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
                {sortBy === opt.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  headerSub: {
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
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
  sortBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabBar: {
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
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  activeTabItem: {
    backgroundColor: colors.primaryLight,
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  activeTabItemText: {
    color: colors.primary,
    fontWeight: '800',
  },
  activeSortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sortPillText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  resultCountText: {
    fontSize: 12,
    color: colors.mutedText,
    fontWeight: '500',
  },
  scrollArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
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
  clearSearchBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  clearSearchText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  interviewCard: {
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    color: colors.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  headerInfo: {
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
    marginBottom: 4,
  },
  jobBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  jobText: {
    fontSize: 11,
    color: colors.secondaryText,
    flex: 1,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    maxWidth: 100,
  },
  stageBadgeText: {
    fontSize: 10.5,
    color: colors.primary,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  infoText: {
    fontSize: 11.5,
    color: colors.secondaryText,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
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
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionBtnGroup: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
    justifyContent: 'flex-end',
  },
  panelSummaryBtn: {
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
  panelSummaryText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  viewFeedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 4,
  },
  viewFeedbackText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  giveFeedbackBtn: {
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
  giveFeedbackText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sortModal: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 40,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cardBorder,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  sortOptionActive: {
    backgroundColor: colors.primaryLight,
  },
  sortOptionText: {
    fontSize: 14,
    color: colors.secondaryText,
    fontWeight: '600',
    flex: 1,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
});
