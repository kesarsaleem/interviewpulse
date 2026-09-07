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

export default function AdminInterviewsScreen() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const loadInterviews = useCallback(async () => {
    try {
      // Fetch candidates with interview dates or feedback
      const { data, error } = await supabase
        .from('candidates')
        .select(
          `
          id,
          full_name,
          current_role,
          current_company,
          interview_date,
          interview_time,
          current_stage_id,
          jobs (
            id,
            title,
            department
          ),
          stages (
            id,
            name
          ),
          feedback (
            id,
            overall_verdict,
            submitted_at,
            profiles (
              name
            )
          )
        `
        )
        .order('interview_date', { ascending: true });

      if (error) throw error;
      setInterviews(data || []);
    } catch (err: any) {
      console.warn('Error loading admin interviews:', err);
      Alert.alert('Error', err.message || 'Failed to load interviews');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInterviews();
  }, [loadInterviews]);

  useFocusEffect(
    useCallback(() => {
      loadInterviews();
    }, [loadInterviews])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInterviews();
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredInterviews = useMemo(() => {
    return interviews.filter((item) => {
      const isPast = item.interview_date && item.interview_date < todayStr;
      if (tab === 'upcoming' && isPast) return false;
      if (tab === 'past' && !isPast) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const name = (item.full_name || '').toLowerCase();
        const job = (item.jobs?.title || '').toLowerCase();
        const role = (item.current_role || '').toLowerCase();
        return name.includes(q) || job.includes(q) || role.includes(q);
      }
      return true;
    });
  }, [interviews, tab, search, todayStr]);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading Interview Sessions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Interviews Schedule</Text>
          <Text style={styles.subtitle}>
            Organization-wide candidate evaluation sessions
          </Text>
        </View>
      </View>

      {/* SEARCH & TABS */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            placeholder="Search candidate, position, role..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>

        <View style={styles.tabsRow}>
          <Pressable
            style={[styles.tabBtn, tab === 'upcoming' && styles.tabBtnActive]}
            onPress={() => setTab('upcoming')}
          >
            <Text style={[styles.tabBtnText, tab === 'upcoming' && styles.tabBtnTextActive]}>
              Scheduled & Upcoming
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === 'past' && styles.tabBtnActive]}
            onPress={() => setTab('past')}
          >
            <Text style={[styles.tabBtnText, tab === 'past' && styles.tabBtnTextActive]}>
              Past / Completed
            </Text>
          </Pressable>
        </View>
      </View>

      {/* LIST */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredInterviews.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={40} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No interviews found</Text>
            <Text style={styles.emptySubtitle}>
              {tab === 'upcoming'
                ? 'No interviews currently scheduled. Set interview dates when adding or editing candidates.'
                : 'No past interview records found.'}
            </Text>
          </View>
        ) : (
          filteredInterviews.map((item) => {
            const hasFeedback = item.feedback && item.feedback.length > 0;
            const isToday = item.interview_date === todayStr;

            return (
              <Pressable
                key={item.id}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/admin/candidate-detail',
                    params: { id: item.id },
                  })
                }
              >
                <View style={styles.cardTop}>
                  <View style={styles.dateBadge}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={isToday ? '#059669' : '#2563EB'}
                    />
                    <Text
                      style={[
                        styles.dateBadgeText,
                        { color: isToday ? '#059669' : '#2563EB' },
                      ]}
                    >
                      {item.interview_date
                        ? `${isToday ? 'TODAY: ' : ''}${item.interview_date}`
                        : 'Unscheduled'}
                      {item.interview_time ? ` at ${item.interview_time}` : ''}
                    </Text>
                  </View>

                  {hasFeedback ? (
                    <View style={styles.feedbackSubmittedBadge}>
                      <Ionicons name="checkmark-done" size={12} color="#16A34A" />
                      <Text style={styles.feedbackSubmittedText}>
                        {item.feedback.length} Evaluation(s)
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingText}>Awaiting Review</Text>
                    </View>
                  )}
                </View>

                <View style={styles.divider} />

                <Text style={styles.candidateName}>{item.full_name}</Text>
                <Text style={styles.candidateRole}>
                  {item.current_role || 'Candidate'}
                  {item.current_company ? ` • ${item.current_company}` : ''}
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="briefcase-outline" size={13} color="#64748B" />
                    <Text style={styles.metaText}>{item.jobs?.title || 'Open Role'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="git-branch-outline" size={13} color="#2563EB" />
                    <Text style={[styles.metaText, { color: '#2563EB' }]}>
                      {item.stages?.name || 'Stage'}
                    </Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748B' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerLeft: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  searchSection: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 12, borderRadius: 8, height: 38, marginBottom: 10 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', height: '100%' },
  tabsRow: { flexDirection: 'row', gap: 10 },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  tabBtnTextActive: { color: '#2563EB', fontWeight: '700' },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateBadgeText: { fontSize: 12, fontWeight: '700' },
  feedbackSubmittedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  feedbackSubmittedText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
  pendingBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pendingText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  candidateName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  candidateRole: { fontSize: 13, color: '#64748B', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4, lineHeight: 18 },
});
