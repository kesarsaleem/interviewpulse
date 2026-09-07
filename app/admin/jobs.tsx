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

type StatusFilter = 'all' | 'open' | 'closed' | 'archived';

export default function JobsScreen() {
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
        return { bg: '#DCFCE7', text: '#16A34A', label: 'Open' };
      case 'closed':
        return { bg: '#F1F5F9', text: '#64748B', label: 'Closed' };
      case 'archived':
        return { bg: '#FEE2E2', text: '#DC2626', label: 'Archived' };
      default:
        return { bg: '#F1F5F9', text: '#64748B', label: status || 'Unknown' };
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
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
          onPress={() => router.push('/admin/create-job')}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.createText}>Create Job</Text>
        </Pressable>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            placeholder="Search by title, department..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
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
            <View style={styles.emptyIconCircle}>
              <Ionicons name="briefcase-outline" size={40} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>
              {search.trim() || statusFilter !== 'all'
                ? 'No matching jobs'
                : 'No job openings yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search.trim() || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Create your first job opening to configure hiring stages, criteria, and assign interviewers.'}
            </Text>
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
                onPress={() => router.push('/admin/create-job')}
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
                    pathname: '/admin/job-detail',
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
                    <Ionicons name="people" size={14} color="#2563EB" />
                    <Text style={styles.metricText}>
                      <Text style={styles.metricBold}>{candidateCount}</Text> Candidates
                    </Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Ionicons name="git-branch-outline" size={14} color="#64748B" />
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

                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 'auto' }} />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
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
    color: '#0F172A',
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
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#2563EB',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
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
    color: '#0F172A',
    marginBottom: 3,
  },
  department: {
    fontSize: 13,
    color: '#64748B',
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
    color: '#475569',
    marginTop: 8,
    lineHeight: 18,
  },
  stagesPreview: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
  },
  stagesPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  stagePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stagePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 130,
  },
  stagePillText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },
  stagePillMore: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stagePillMoreText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
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
    color: '#64748B',
  },
  metricBold: {
    fontWeight: '700',
    color: '#0F172A',
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
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  clearFilterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  clearFilterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  emptyCta: {
    backgroundColor: '#2563EB',
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
