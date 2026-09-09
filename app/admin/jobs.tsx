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

type StatusFilter = 'all' | 'open' | 'closed' | 'archived';

export default function JobsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(
          `
          *,
          stages (
            id,
            name,
            position
          ),
          criteria (
            id,
            name,
            position
          ),
          candidates (
            id
          ),
          job_interviewers (
            id
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.warn('FETCH JOB ERROR:', error);
      Alert.alert('Error', error.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (job.status !== statusFilter) return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const title = (job.title || '').toLowerCase();
        const dept = (job.department || '').toLowerCase();
        const desc = (job.description || '').toLowerCase();
        return title.includes(q) || dept.includes(q) || desc.includes(q);
      }

      return true;
    });
  }, [jobs, statusFilter, search]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return { bg: colors.successLight, text: colors.success, label: 'Open' };
      case 'closed':
        return { bg: colors.divider, text: colors.secondaryText, label: 'Closed' };
      case 'archived':
        return { bg: colors.dangerLight, text: colors.danger, label: 'Archived' };
      default:
        return { bg: colors.divider, text: colors.secondaryText, label: status || 'Unknown' };
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Job Openings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* SCREEN HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Job Openings</Text>
          <Text style={styles.subtitle}>
            {jobs.length} total requisition{jobs.length === 1 ? '' : 's'}
          </Text>
        </View>

        <Pressable
          style={styles.createButton}
          onPress={() => router.push(ROUTES.adminCreateJob)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.createText}>Create Job</Text>
        </Pressable>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={styles.searchIcon} />
          <TextInput
            placeholder="Search by title, department..."
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

        {/* STATUS FILTER TABS */}
        <View style={styles.tabsRow}>
          {(['all', 'open', 'closed', 'archived'] as StatusFilter[]).map((tab) => {
            const count =
              tab === 'all'
                ? jobs.length
                : jobs.filter((j) => j.status === tab).length;
            const isActive = statusFilter === tab;

            return (
              <Pressable
                key={tab}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setStatusFilter(tab)}
              >
                <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* JOB CARDS LIST */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredJobs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              title={
                search.trim() || statusFilter !== 'all'
                  ? 'No matching jobs'
                  : 'No job openings yet'
              }
              description={
                search.trim() || statusFilter !== 'all'
                  ? 'Try adjusting your search query or status filter.'
                  : 'Create your first job opening to configure hiring stages, criteria, and assign interviewers.'
              }
            />
            {search.trim() || statusFilter !== 'all' ? (
              <Pressable
                style={styles.clearFilterBtn}
                onPress={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                <Text style={styles.clearFilterBtnText}>Reset Filters</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.emptyCta}
                onPress={() => router.push(ROUTES.adminCreateJob)}
              >
                <Text style={styles.emptyCtaText}>Create First Job</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredJobs.map((job) => {
            const statusBadge = getStatusBadge(job.status);
            const candidateCount = job.candidates?.length || 0;
            const stagesCount = job.stages?.length || 0;
            const interviewerCount = job.job_interviewers?.length || 0;
            const sortedStages = [...(job.stages || [])].sort((a, b) => a.position - b.position);

            return (
              <Pressable
                key={job.id}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: ROUTES.adminJobDetail,
                    params: { id: String(job.id) },
                  })
                }
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.cardInfoLeft}>
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.department}>{job.department || 'General Department'}</Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
                      {statusBadge.label}
                    </Text>
                  </View>
                </View>

                {job.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {job.description}
                  </Text>
                ) : null}

                {/* STAGES CHIPS PREVIEW */}
                {sortedStages.length > 0 && (
                  <View style={styles.stagesPreview}>
                    <Text style={styles.stagesPreviewLabel}>Pipeline:</Text>
                    <View style={styles.stagePillsRow}>
                      {sortedStages.slice(0, 3).map((st, idx) => (
                        <View key={st.id || idx} style={styles.stagePill}>
                          <Text style={styles.stagePillText} numberOfLines={1}>
                            {idx + 1}. {st.name}
                          </Text>
                        </View>
                      ))}
                      {sortedStages.length > 3 && (
                        <View style={styles.stagePillMore}>
                          <Text style={styles.stagePillMoreText}>
                            +{sortedStages.length - 3} more
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* CARD FOOTER METRICS */}
                <View style={styles.cardFooter}>
                  <View style={styles.metricItem}>
                    <Ionicons name="people" size={14} color={colors.primary} />
                    <Text style={styles.metricText}>
                      <Text style={styles.metricBold}>{candidateCount}</Text> Candidates
                    </Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Ionicons name="git-branch-outline" size={14} color={colors.secondaryText} />
                    <Text style={styles.metricText}>
                      <Text style={styles.metricBold}>{stagesCount}</Text> Stages
                    </Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#0D9488" />
                    <Text style={styles.metricText}>
                      <Text style={styles.metricBold}>{interviewerCount}</Text> Panel
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={colors.mutedText} style={{ marginLeft: 'auto' }} />
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchSection: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.divider,
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
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.divider,
  },
  tabBtnActive: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.secondaryText,
  },
  tabBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
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
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfoLeft: {
    flex: 1,
    marginRight: 8,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  department: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 13,
    color: colors.secondaryText,
    marginTop: 8,
    lineHeight: 18,
  },
  stagesPreview: {
    marginTop: 10,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 8,
  },
  stagesPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondaryText,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  stagePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stagePill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 130,
  },
  stagePillText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  stagePillMore: {
    backgroundColor: colors.divider,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stagePillMoreText: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
    marginTop: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  metricBold: {
    fontWeight: '700',
    color: colors.text,
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
  clearFilterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  clearFilterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyCta: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
