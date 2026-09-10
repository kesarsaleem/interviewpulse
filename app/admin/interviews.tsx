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
  RefreshControl,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { EmptyState } from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import { ROUTES } from '../../constants/routes';

export default function AdminInterviewsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
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

      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
      {/* SEARCH & TABS */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={styles.searchIcon} />
          <Input
            placeholder="Search candidate, position, role..."
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
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
            <EmptyState
              title="No interviews found"
              description={
                tab === 'upcoming'
                  ? 'No interviews currently scheduled. Set interview dates when adding or editing candidates.'
                  : 'No past interview records found.'
              }
            />
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
                    pathname: ROUTES.adminCandidateDetail,
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
                    <Ionicons name="briefcase-outline" size={13} color={colors.secondaryText} />
                    <Text style={styles.metaText}>{item.jobs?.title || 'Open Role'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="git-branch-outline" size={13} color={colors.primary} />
                    <Text style={[styles.metaText, { color: colors.primary }]}>
                      {item.stages?.name || 'Stage'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.secondaryText },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  headerLeft: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.secondaryText, marginTop: 2 },
  searchSection: { backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.divider, paddingHorizontal: 12, borderRadius: 8, height: 38, marginBottom: 10 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, height: '100%' },
  tabsRow: { flexDirection: 'row', gap: 10 },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.divider, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.inputBorder },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: colors.secondaryText },
  tabBtnTextActive: { color: colors.primary, fontWeight: '700' },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.cardBorder, shadowColor: colors.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateBadgeText: { fontSize: 12, fontWeight: '700' },
  feedbackSubmittedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  feedbackSubmittedText: { fontSize: 11, fontWeight: '700', color: colors.success },
  pendingBadge: { backgroundColor: colors.divider, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pendingText: { fontSize: 11, fontWeight: '600', color: colors.secondaryText },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 10 },
  candidateName: { fontSize: 16, fontWeight: '700', color: colors.text },
  candidateRole: { fontSize: 13, color: colors.secondaryText, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: colors.secondaryText, fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.secondaryText, textAlign: 'center', marginTop: 4, lineHeight: 18 },
});
