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
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { ROUTES } from '../../constants/routes';

export default function CandidatesScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [candidates, setCandidates] = useState<any[]>([]);
  const [userFeedbackMap, setUserFeedbackMap] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('all');

  const loadCandidates = useCallback(async () => {
    try {
      if (!user?.id) return;

      // 1. Offline-First: load cached candidates from SQLite
      const local = getLocalInterviews();
      if (local.length > 0) {
        setCandidates(local);
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
        if (local.length === 0) setCandidates([]);
        return;
      }

      const [
        { data: remoteCandidates, error: candError },
        { data: remoteFeedbacks },
      ] = await Promise.all([
        supabase
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
          .in('job_id', jobIds),
        supabase
          .from('feedback')
          .select('id, candidate_id, stage_id, overall_verdict')
          .eq('interviewer_id', user.id),
      ]);

      if (candError) throw candError;

      if (remoteCandidates) {
        setCandidates(remoteCandidates);

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
      console.warn('Error loading candidates:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCandidates();
  };

  const handleManualSync = async () => {
    if (!user?.id) return;
    try {
      setSyncing(true);
      await runSync(user.id);
      await loadCandidates();
      Alert.alert('Synced', 'Candidates and evaluation loops updated.');
    } catch (err: any) {
      Alert.alert('Sync Notice', 'Offline mode or sync failed: ' + (err?.message || 'Check connection'));
    } finally {
      setSyncing(false);
    }
  };

  // Distinct stages for horizontal filter pills
  const availableStages = useMemo(() => {
    const stageMap = new Map<string, string>();
    candidates.forEach((c) => {
      const stageName = c.stages?.name;
      const stageId = c.current_stage_id;
      if (stageName && stageId) {
        stageMap.set(stageId, stageName);
      }
    });
    return Array.from(stageMap.entries()).map(([id, name]) => ({ id, name }));
  }, [candidates]);

  // Filtered candidate list
  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      // Stage filter
      if (selectedStage !== 'all' && item.current_stage_id !== selectedStage) {
        return false;
      }

      // Search query
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
    });
  }, [candidates, selectedStage, search]);

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
          <Text style={styles.loadingText}>Loading assigned candidates...</Text>
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
            style={styles.menuButton}
            onPress={() => setDrawerOpen(true)}
            hitSlop={12}
          >
            <Ionicons name="menu-outline" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Candidates</Text>
            <Text style={styles.headerSubtitle}>
              {candidates.length} assigned candidate{candidates.length === 1 ? '' : 's'}
            </Text>
          </View>

          <Pressable
            style={styles.addBtn}
            onPress={() => router.push(ROUTES.interviewerAddCandidate)}
            hitSlop={10}
          >
            <Ionicons name="person-add-outline" size={15} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>

          <Button
            label={syncing ? 'Syncing...' : 'Sync'}
            onPress={handleManualSync}
            loading={syncing}
            disabled={syncing}
            size="sm"
            icon={<Ionicons name="sync-outline" size={15} color="#FFFFFF" />}
          />
        </View>

        {/* SEARCH BAR (INTEGRATED IN HEADER CARD) */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="search-outline" size={18} color={colors.mutedText} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Input
              placeholder="Search candidate, role, company, or job..."
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
          </View>
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </Pressable>
          )}
        </View>
      </View>

      {/* HORIZONTAL STAGE FILTER PILLS */}
      {availableStages.length > 0 && (
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsScroll}
          >
            <Pressable
              style={[styles.filterPill, selectedStage === 'all' && styles.activeFilterPill]}
              onPress={() => setSelectedStage('all')}
            >
              <Text style={[styles.filterPillText, selectedStage === 'all' && styles.activeFilterPillText]}>
                All Stages ({candidates.length})
              </Text>
            </Pressable>

            {availableStages.map((stg) => {
              const count = candidates.filter((c) => c.current_stage_id === stg.id).length;
              const active = selectedStage === stg.id;
              return (
                <Pressable
                  key={stg.id}
                  style={[styles.filterPill, active && styles.activeFilterPill]}
                  onPress={() => setSelectedStage(stg.id)}
                >
                  <Ionicons
                    name="layers-outline"
                    size={13}
                    color={active ? '#FFFFFF' : colors.secondaryText}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.filterPillText, active && styles.activeFilterPillText]}>
                    {stg.name} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* CANDIDATES LIST */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {filteredCandidates.length === 0 ? (
          <View style={styles.emptyCard}>
            <EmptyState
              title="No Candidates Found"
              description={
                search.trim() || selectedStage !== 'all'
                  ? 'Try modifying your search keywords or stage filter.'
                  : 'When hiring managers assign you to candidate interview loops, they will appear here.'
              }
            />
            {(search.trim() || selectedStage !== 'all') && (
              <Pressable
                style={styles.clearFilterBtn}
                onPress={() => {
                  setSearch('');
                  setSelectedStage('all');
                }}
              >
                <Text style={styles.clearFilterBtnText}>Reset Filters</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredCandidates.map((candidate) => {
            const fbKey = `${candidate.id}_`;
            const userFb = userFeedbackMap[fbKey] || userFeedbackMap[candidate.id];
            const hasSubmitted = !!userFb;
            const stageName = candidate.stages?.name || 'Interview Stage';
            const jobTitle = candidate.jobs?.title || 'Open Position';
            const department = candidate.jobs?.department;
            const initials = getInitials(candidate.full_name || 'Candidate');

            return (
              <View key={candidate.id} style={styles.candidateCard}>
                {/* TOP HEADER: AVATAR, NAME, ROLE, STAGE BADGE */}
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.headerInfo}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {candidate.full_name}
                    </Text>
                    <Text style={styles.candidateRole} numberOfLines={1}>
                      {candidate.current_role || 'Candidate'}
                      {candidate.current_company ? ` • ${candidate.current_company}` : ''}
                    </Text>
                    <View style={styles.jobBadgeRow}>
                      <Ionicons name="briefcase-outline" size={11} color={colors.secondaryText} />
                      <Text style={styles.jobText} numberOfLines={1}>
                        {jobTitle}
                        {department ? ` (${department})` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stageBadge}>
                    <Ionicons name="layers-outline" size={11} color={colors.primary} />
                    <Text style={styles.stageBadgeText} numberOfLines={1}>
                      {stageName}
                    </Text>
                  </View>
                </View>

                {/* DIVIDER */}
                <View style={styles.cardDivider} />

                {/* SCHEDULE AND CONTACT METRICS */}
                <View style={styles.infoRow}>
                  {candidate.interview_date ? (
                    <View style={styles.infoPill}>
                      <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                      <Text style={styles.infoText}>
                        {candidate.interview_date}{candidate.interview_time ? ` at ${candidate.interview_time}` : ''}
                      </Text>
                    </View>
                  ) : null}

                  {candidate.email ? (
                    <View style={styles.infoPill}>
                      <Ionicons name="mail-outline" size={13} color={colors.secondaryText} />
                      <Text style={styles.infoText} numberOfLines={1}>
                        {candidate.email}
                      </Text>
                    </View>
                  ) : null}

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
                <View style={styles.cardActions}>
                  {hasSubmitted ? (
                    <View style={styles.actionButtonGroup}>
                      <Pressable
                        style={styles.btnSecondary}
                        onPress={() =>
                          router.push({
                            pathname: ROUTES.candidatePanel,
                            params: {
                              id: candidate.id,
                              stageId: candidate.current_stage_id,
                            },
                          })
                        }
                      >
                        <Ionicons name="people-outline" size={15} color={colors.primary} />
                        <Text style={styles.btnSecondaryText}>Panel Summary</Text>
                      </Pressable>

                      <Pressable
                        style={styles.btnDark}
                        onPress={() =>
                          router.push({
                            pathname: ROUTES.interviewerFeedbackDetails,
                            params: {
                              feedbackId: userFb.id,
                              candidateId: candidate.id,
                              stageId: candidate.current_stage_id,
                            },
                          })
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
                            pathname: ROUTES.candidatePanel,
                            params: {
                              id: candidate.id,
                              stageId: candidate.current_stage_id,
                            },
                          })
                        }
                      >
                        <Ionicons name="people-outline" size={15} color={colors.primary} />
                        <Text style={styles.btnSecondaryText}>Panel</Text>
                      </Pressable>

                      <Pressable
                        style={styles.btnPrimary}
                        onPress={() =>
                          router.push({
                            pathname: ROUTES.giveFeedback,
                            params: {
                              candidateId: candidate.id,
                              stageId: candidate.current_stage_id,
                              jobId: candidate.job_id,
                            },
                          })
                        }
                      >
                        <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.btnPrimaryText}>Give Feedback</Text>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginRight: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
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
  filterSection: {
    marginTop: 14,
    marginBottom: 4,
  },
  filterPillsScroll: {
    paddingHorizontal: 18,
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
  candidateCard: {
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
  cardHeader: {
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
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
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
  cardActions: {
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
