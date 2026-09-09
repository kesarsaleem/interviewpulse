import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ROUTES } from '../../constants/routes';

type SortOption = 'newest' | 'oldest' | 'name_asc' | 'interview_date' | 'last_activity';

export default function AdminCandidatesScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [decisionsMap, setDecisionsMap] = useState<Record<string, 'hired' | 'rejected'>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [selectedStageName, setSelectedStageName] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const loadCandidatesData = useCallback(async () => {
    try {
      // 1. Fetch Candidates
      const { data: candData, error: candErr } = await supabase
        .from('candidates')
        .select(
          `
          *,
          jobs (
            id,
            title,
            department
          ),
          stages (
            id,
            name,
            position
          )
        `
        )
        .order('created_at', { ascending: false });

      if (candErr) throw candErr;
      const candidateIds = (candData || []).map((candidate) => candidate.id);
      const lastActivityByCandidate: Record<string, string> = {};
      const activityPromise =
        candidateIds.length > 0
          ? supabase
              .from('activity_logs')
              .select('candidate_id, created_at')
              .in('candidate_id', candidateIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null, error: null });
      const [
        { data: activityData, error: activityErr },
        { data: jobsData, error: jobsErr },
        { data: logsData },
      ] = await Promise.all([
        activityPromise,
        supabase
          .from('jobs')
          .select('id, title, department')
          .order('title', { ascending: true }),
        supabase
          .from('activity_logs')
          .select('candidate_id, action, created_at')
          .in('action', ['marked_hire', 'marked_reject'])
          .order('created_at', { ascending: false }),
      ]);
      if (activityErr) {
        console.warn('Candidate activity fetch error:', activityErr);
      } else {
        (activityData || []).forEach((activity) => {
          if (!lastActivityByCandidate[activity.candidate_id]) {
            lastActivityByCandidate[activity.candidate_id] = activity.created_at;
          }
        });
      }
      setCandidates(
        (candData || []).map((candidate) => ({
          ...candidate,
          last_activity_at:
            lastActivityByCandidate[candidate.id] || candidate.updated_at || candidate.created_at,
        }))
      );

      if (jobsErr) console.warn('Jobs fetch error:', jobsErr);
      setJobs(jobsData || []);

      const dMap: Record<string, 'hired' | 'rejected'> = {};
      (candData || []).forEach((c: any) => {
        if (c.decision_status === 'hired' || c.decision_status === 'rejected') {
          dMap[c.id] = c.decision_status;
        }
      });
      (logsData || []).forEach((l) => {
        if (!dMap[l.candidate_id]) {
          dMap[l.candidate_id] = l.action === 'marked_hire' ? 'hired' : 'rejected';
        }
      });
      setDecisionsMap(dMap);
    } catch (err: any) {
      console.warn('Load candidates error:', err);
      Alert.alert('Error', err.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCandidatesData();
  }, [loadCandidatesData]);

  useFocusEffect(
    useCallback(() => {
      loadCandidatesData();
    }, [loadCandidatesData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCandidatesData();
  };

  // Distinct stages across candidates
  const availableStageNames = useMemo(() => {
    const stageSet = new Set<string>();
    candidates.forEach((c) => {
      if (c.stages?.name) stageSet.add(c.stages.name);
    });
    return Array.from(stageSet);
  }, [candidates]);

  // Filtered & Sorted Candidates
  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        // Job filter
        if (selectedJobId !== 'all' && c.job_id !== selectedJobId) {
          return false;
        }

        // Stage filter
        if (selectedStageName !== 'all' && c.stages?.name !== selectedStageName) {
          return false;
        }

        // Search query
        if (search.trim()) {
          const q = search.toLowerCase();
          const name = (c.full_name || '').toLowerCase();
          const role = (c.current_role || '').toLowerCase();
          const company = (c.current_company || '').toLowerCase();
          const email = (c.email || '').toLowerCase();
          const jobTitle = (c.jobs?.title || '').toLowerCase();

          return (
            name.includes(q) ||
            role.includes(q) ||
            company.includes(q) ||
            email.includes(q) ||
            jobTitle.includes(q)
          );
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        }
        if (sortBy === 'name_asc') {
          return (a.full_name || '').localeCompare(b.full_name || '');
        }
        if (sortBy === 'interview_date') {
          if (!a.interview_date) return 1;
          if (!b.interview_date) return -1;
          return a.interview_date.localeCompare(b.interview_date);
        }
        if (sortBy === 'last_activity') {
          return new Date(b.last_activity_at || 0).getTime() - new Date(a.last_activity_at || 0).getTime();
        }
        return 0;
      });
  }, [candidates, selectedJobId, selectedStageName, search, sortBy]);

  const deleteCandidateQuick = (candId: string, candName: string) => {
    console.log('[DELETE CANDIDATE QUICK] Triggered for:', candId, candName);
    Alert.alert(
      'Delete Candidate',
      `Permanently delete ${candName}? All evaluations and logs will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[DELETE CANDIDATE QUICK] Fetching feedback for:', candId);
              const { data: fbs, error: fbsErr } = await supabase
                .from('feedback')
                .select('id')
                .eq('candidate_id', candId);
              if (fbsErr) console.warn('[DELETE CANDIDATE QUICK] Feedback fetch note:', fbsErr);
              
              const fbIds = (fbs || []).map((f) => f.id);
              if (fbIds.length > 0) {
                console.log('[DELETE CANDIDATE QUICK] Deleting feedback_scores:', fbIds);
                const { error: sErr } = await supabase.from('feedback_scores').delete().in('feedback_id', fbIds);
                if (sErr) console.warn('[DELETE CANDIDATE QUICK] feedback_scores delete warning:', sErr);
              }

              console.log('[DELETE CANDIDATE QUICK] Deleting feedback for:', candId);
              const { error: fbErr } = await supabase.from('feedback').delete().eq('candidate_id', candId);
              if (fbErr) console.warn('[DELETE CANDIDATE QUICK] feedback delete warning:', fbErr);

              console.log('[DELETE CANDIDATE QUICK] Deleting activity_logs for:', candId);
              const { error: actErr } = await supabase.from('activity_logs').delete().eq('candidate_id', candId);
              if (actErr) console.warn('[DELETE CANDIDATE QUICK] activity_logs delete warning:', actErr);

              console.log('[DELETE CANDIDATE QUICK] Deleting candidate:', candId);
              const { error } = await supabase.from('candidates').delete().eq('id', candId);
              if (error) {
                console.error('[DELETE CANDIDATE QUICK] Delete error:', error);
                throw error;
              }

              // SQLite mirror cleanup
              try {
                const { getDb } = require('../../lib/sqlite/schema');
                const db = getDb();
                db.runSync(
                  'DELETE FROM feedback_scores WHERE feedback_id IN (SELECT id FROM feedback WHERE candidate_id = ?)',
                  [candId]
                );
                db.runSync('DELETE FROM feedback WHERE candidate_id = ?', [candId]);
                db.runSync('DELETE FROM activity_logs WHERE candidate_id = ?', [candId]);
                db.runSync('DELETE FROM candidates WHERE id = ?', [candId]);
              } catch (e) {}

              console.log('ACTION SUCCESS');
              Alert.alert('Deleted', `${candName} removed`);
              await loadCandidatesData();
            } catch (err: any) {
              console.error('[DELETE CANDIDATE QUICK] Error:', err);
              Alert.alert('Error', err.message || 'Failed to delete candidate');
            }
          },
        },
      ]
    );
  };

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Candidates...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Candidates</Text>
          <Text style={styles.subtitle}>
            {candidates.length} total applicant{candidates.length === 1 ? '' : 's'} across pipeline
          </Text>
        </View>

        <Pressable
          style={styles.addBtn}
          onPress={() => router.push(ROUTES.adminSelectJob)}
        >
          <Ionicons name="person-add" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Candidate</Text>
        </Pressable>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={styles.searchIcon} />
          <TextInput
            placeholder="Search candidate name, role, email..."
            placeholderTextColor={colors.mutedText}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </Pressable>
          )}
        </View>

        {/* JOB FILTER PILLS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <Pressable
            style={[styles.filterPill, selectedJobId === 'all' && styles.filterPillActive]}
            onPress={() => setSelectedJobId('all')}
          >
            <Text
              style={[styles.filterPillText, selectedJobId === 'all' && styles.filterPillTextActive]}
            >
              All Jobs ({candidates.length})
            </Text>
          </Pressable>

          {jobs.map((job) => {
            const count = candidates.filter((c) => c.job_id === job.id).length;
            const isActive = selectedJobId === job.id;
            return (
              <Pressable
                key={job.id}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setSelectedJobId(job.id)}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {job.title} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* STAGE FILTER PILLS & SORT TOGGLE */}
        <View style={styles.subFilterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stageFilterScroll}
          >
            <Pressable
              style={[styles.stagePill, selectedStageName === 'all' && styles.stagePillActive]}
              onPress={() => setSelectedStageName('all')}
            >
              <Text
                style={[
                  styles.stagePillText,
                  selectedStageName === 'all' && styles.stagePillTextActive,
                ]}
              >
                All Stages
              </Text>
            </Pressable>

            {availableStageNames.map((stName) => {
              const isActive = selectedStageName === stName;
              return (
                <Pressable
                  key={stName}
                  style={[styles.stagePill, isActive && styles.stagePillActive]}
                  onPress={() => setSelectedStageName(stName)}
                >
                  <Text style={[styles.stagePillText, isActive && styles.stagePillTextActive]}>
                    {stName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* SORT BUTTON */}
          <Pressable
            style={styles.sortToggleBtn}
            onPress={() => {
              const nextSort: Record<SortOption, SortOption> = {
                newest: 'interview_date',
                interview_date: 'name_asc',
                name_asc: 'oldest',
                oldest: 'last_activity',
                last_activity: 'newest',
              };
              setSortBy(nextSort[sortBy]);
            }}
          >
            <Ionicons name="funnel-outline" size={14} color={colors.primary} />
            <Text style={styles.sortToggleText}>
              {sortBy === 'newest'
                ? 'Newest'
                : sortBy === 'interview_date'
                ? 'Scheduled'
                : sortBy === 'name_asc'
                ? 'Name'
                : sortBy === 'oldest'
                ? 'Oldest'
                : 'Last Activity'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* CANDIDATE LIST */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredCandidates.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              title={
                search.trim() || selectedJobId !== 'all' || selectedStageName !== 'all'
                  ? 'No matching candidates'
                  : 'No candidates in system'
              }
              description={
                search.trim() || selectedJobId !== 'all' || selectedStageName !== 'all'
                  ? 'Try clearing filters or adjusting your search term.'
                  : 'Add your first candidate to an active job opening to begin interview evaluations.'
              }
            />
            {search.trim() || selectedJobId !== 'all' || selectedStageName !== 'all' ? (
              <Pressable
                style={styles.resetBtn}
                onPress={() => {
                  setSearch('');
                  setSelectedJobId('all');
                  setSelectedStageName('all');
                }}
              >
                <Text style={styles.resetBtnText}>Reset All Filters</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.emptyAddBtn}
                onPress={() => router.push(ROUTES.adminSelectJob)}
              >
                <Text style={styles.emptyAddBtnText}>Add Candidate Now</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredCandidates.map((cand) => {
            const initials = getInitials(cand.full_name);
            const jobTitle = cand.jobs?.title || 'Open Position';
            const dept = cand.jobs?.department;
            const stageName = cand.stages?.name || 'Screening';
            const decision = decisionsMap[cand.id];

            return (
              <Pressable
                key={cand.id}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: ROUTES.adminCandidateDetail,
                    params: { id: cand.id },
                  })
                }
              >
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.candidateName}>{cand.full_name}</Text>
                    <Text style={styles.candidateRole} numberOfLines={1}>
                      {cand.current_role || 'Candidate'}
                      {cand.current_company ? ` • ${cand.current_company}` : ''}
                    </Text>
                  </View>

                  {decision === 'hired' ? (
                    <View style={[styles.stageBadge, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
                      <Ionicons name="checkmark-circle" size={11} color={colors.success} />
                      <Text style={[styles.stageBadgeText, { color: colors.success }]}>HIRED</Text>
                    </View>
                  ) : decision === 'rejected' ? (
                    <View style={[styles.stageBadge, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
                      <Ionicons name="close-circle" size={11} color={colors.danger} />
                      <Text style={[styles.stageBadgeText, { color: colors.danger }]}>REJECTED</Text>
                    </View>
                  ) : (
                    <View style={styles.stageBadge}>
                      <Ionicons name="git-branch-outline" size={11} color={colors.primary} />
                      <Text style={styles.stageBadgeText} numberOfLines={1}>
                        {stageName}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardDivider} />

                {/* DETAILS ROW */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="briefcase-outline" size={14} color={colors.secondaryText} />
                    <Text style={styles.detailText} numberOfLines={1}>
                      {jobTitle}
                      {dept ? ` (${dept})` : ''}
                    </Text>
                  </View>

                  {cand.email ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="mail-outline" size={14} color={colors.secondaryText} />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {cand.email}
                      </Text>
                    </View>
                  ) : null}

                  {cand.interview_date ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={14} color="#0D9488" />
                      <Text style={[styles.detailText, { color: '#0F766E' }]}>
                        {cand.interview_date}
                        {cand.interview_time ? ` at ${cand.interview_time}` : ''}
                      </Text>
                    </View>
                  ) : null}

                  {cand.resume_url ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="document-text-outline" size={14} color="#7C3AED" />
                      <Text style={[styles.detailText, { color: '#7C3AED' }]}>Resume on file</Text>
                    </View>
                  ) : null}
                </View>

                {/* CARD ACTIONS */}
                <View style={styles.cardFooter}>
                  <Text style={styles.referralText}>
                    Source: <Text style={{ fontWeight: '600' }}>{cand.referral_source || 'other'}</Text>
                  </Text>

                  <View style={styles.footerActionGroup}>
                    <Pressable
                      style={styles.quickDeleteBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteCandidateQuick(cand.id, cand.full_name);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                    </Pressable>

                    <View style={styles.footerAction}>
                      <Text style={styles.viewProfileText}>Candidate Profile</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerLeft: {
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchSection: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.divider,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 38,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    height: '100%',
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.divider,
    marginRight: 6,
  },
  filterPillActive: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.secondaryText,
  },
  filterPillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  subFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  stageFilterScroll: {
    gap: 6,
  },
  stagePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginRight: 6,
  },
  stagePillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  stagePillText: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '500',
  },
  stagePillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  sortToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  sortToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  candidateRole: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    maxWidth: 120,
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 12,
  },
  detailsRow: {
    gap: 6,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: colors.secondaryText,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
    marginTop: 12,
  },
  referralText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  footerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewProfileText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  resetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyAddBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
