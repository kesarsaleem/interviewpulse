import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';

export default function AdminReportsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [candidatesCount, setCandidatesCount] = useState(0);
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  const loadReportsData = useCallback(async () => {
    try {
      // 1. Total Candidates
      const { count: cCount } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true });
      setCandidatesCount(cCount || 0);

      // 2. Feedback with scores
      const { data: fbData } = await supabase
        .from('feedback')
        .select('*, feedback_scores(score), candidates(job_id)');
      setFeedbackList(fbData || []);

      // 3. Activity Logs for Decisions
      const { data: logsData } = await supabase
        .from('activity_logs')
        .select('action, created_at');
      setActivityLogs(logsData || []);

      // 4. Jobs with status
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, department, status, candidates(id)');
      setJobs(jobsData || []);
    } catch (err: any) {
      console.warn('Error loading reports:', err);
      Alert.alert('Error', err.message || 'Failed to load report analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReportsData();
  }, [loadReportsData]);

  useFocusEffect(
    useCallback(() => {
      loadReportsData();
    }, [loadReportsData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReportsData();
  };

  // Funnel Calculations
  const hiredCount = useMemo(
    () => activityLogs.filter((l) => l.action === 'marked_hire').length,
    [activityLogs]
  );

  const rejectedCount = useMemo(
    () => activityLogs.filter((l) => l.action === 'marked_reject').length,
    [activityLogs]
  );

  const hiringConversionRate = useMemo(
    () => (candidatesCount > 0 ? Math.round((hiredCount / candidatesCount) * 100) : 0),
    [hiredCount, candidatesCount]
  );

  const rejectionRate = useMemo(
    () => (candidatesCount > 0 ? Math.round((rejectedCount / candidatesCount) * 100) : 0),
    [rejectedCount, candidatesCount]
  );

  // Job Opening Status
  const openingStatus = useMemo(() => {
    const open = jobs.filter((j) => j.status === 'open').length;
    const closed = jobs.filter((j) => j.status === 'closed').length;
    const archived = jobs.filter((j) => j.status === 'archived').length;
    const total = jobs.length || 1;
    return {
      open: { count: open, pct: Math.round((open / total) * 100) },
      closed: { count: closed, pct: Math.round((closed / total) * 100) },
      archived: { count: archived, pct: Math.round((archived / total) * 100) },
    };
  }, [jobs]);

  // Verdict breakdown
  const verdictDistribution = useMemo(() => {
    const counts = { strong_yes: 0, yes: 0, maybe: 0, no: 0, strong_no: 0 };
    feedbackList.forEach((fb) => {
      if (fb.overall_verdict in counts) {
        counts[fb.overall_verdict as keyof typeof counts]++;
      }
    });
    const total = feedbackList.length || 1;
    return {
      strong_yes: { count: counts.strong_yes, pct: Math.round((counts.strong_yes / total) * 100) },
      yes: { count: counts.yes, pct: Math.round((counts.yes / total) * 100) },
      maybe: { count: counts.maybe, pct: Math.round((counts.maybe / total) * 100) },
      no: { count: counts.no, pct: Math.round((counts.no / total) * 100) },
      strong_no: { count: counts.strong_no, pct: Math.round((counts.strong_no / total) * 100) },
    };
  }, [feedbackList]);

  // Overall Avg Rating
  const overallAvgRating = useMemo(() => {
    let sum = 0;
    let count = 0;
    feedbackList.forEach((fb) => {
      (fb.feedback_scores || []).forEach((s: any) => {
        sum += s.score;
        count++;
      });
    });
    return count > 0 ? (sum / count).toFixed(1) : '—';
  }, [feedbackList]);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Computing Pipeline Reports...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Reports & Analytics</Text>
        <Text style={styles.subtitle}>Hiring funnel health & evaluation metrics</Text>
      </View>

      {/* HIRING FUNNEL OVERVIEW */}
      <Text style={styles.sectionTitle}>Pipeline Conversion Funnel</Text>
      <View style={styles.funnelCard}>
        <View style={styles.funnelStep}>
          <View style={[styles.funnelIconCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="people" size={20} color={colors.primary} />
          </View>
          <View style={styles.funnelInfo}>
            <Text style={styles.funnelStepTitle}>Total Applicants</Text>
            <Text style={styles.funnelStepSub}>Candidates in pipeline</Text>
          </View>
          <Text style={styles.funnelStepCount}>{candidatesCount}</Text>
        </View>

        <View style={styles.funnelDivider} />

        <View style={styles.funnelStep}>
          <View style={[styles.funnelIconCircle, { backgroundColor: '#F5F3FF' }]}>
            <Ionicons name="chatbubbles" size={20} color="#7C3AED" />
          </View>
          <View style={styles.funnelInfo}>
            <Text style={styles.funnelStepTitle}>Evaluations Completed</Text>
            <Text style={styles.funnelStepSub}>Panel feedback submissions</Text>
          </View>
          <Text style={styles.funnelStepCount}>{feedbackList.length}</Text>
        </View>

        <View style={styles.funnelDivider} />

        <View style={styles.funnelStep}>
          <View style={[styles.funnelIconCircle, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="trophy" size={20} color="#16A34A" />
          </View>
          <View style={styles.funnelInfo}>
            <Text style={styles.funnelStepTitle}>Offers Extended / Hired</Text>
            <Text style={styles.funnelStepSub}>Confirmed hiring decisions</Text>
          </View>
          <Text style={[styles.funnelStepCount, { color: '#16A34A' }]}>{hiredCount}</Text>
        </View>

        <View style={styles.funnelDivider} />

        <View style={styles.funnelStep}>
          <View style={[styles.funnelIconCircle, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          </View>
          <View style={styles.funnelInfo}>
            <Text style={styles.funnelStepTitle}>Rejected</Text>
            <Text style={styles.funnelStepSub}>Closed applications</Text>
          </View>
          <Text style={[styles.funnelStepCount, { color: '#DC2626' }]}>{rejectedCount}</Text>
        </View>
        <View style={styles.funnelDivider} />

        <View style={styles.conversionMetricsRow}>
          <View style={styles.conversionBox}>
            <Text style={styles.conversionNum}>{hiringConversionRate}%</Text>
            <Text style={styles.conversionLabel}>Hire Conversion Rate</Text>
          </View>
          <View style={styles.conversionBox}>
            <Text style={[styles.conversionNum, { color: '#DC2626' }]}>{rejectionRate}%</Text>
            <Text style={styles.conversionLabel}>Rejection Rate</Text>
          </View>
        </View>
      </View>

      {/* OPENING STATUS BREAKDOWN */}
      <Text style={styles.sectionTitle}>Requisition Status</Text>
      <View style={styles.card}>
        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={[styles.statusNum, { color: '#16A34A' }]}>{openingStatus.open.count}</Text>
            <Text style={styles.statusLabel}>Open ({openingStatus.open.pct}%)</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={[styles.statusNum, { color: colors.secondaryText }]}>{openingStatus.closed.count}</Text>
            <Text style={styles.statusLabel}>Closed ({openingStatus.closed.pct}%)</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={[styles.statusNum, { color: '#DC2626' }]}>{openingStatus.archived.count}</Text>
            <Text style={styles.statusLabel}>Archived ({openingStatus.archived.pct}%)</Text>
          </View>
        </View>
      </View>

      {/* VERDICT BREAKDOWN */}
      <Text style={styles.sectionTitle}>Interviewer Verdict Distribution</Text>
      <View style={styles.card}>
        <View style={styles.overallRatingRow}>
          <View>
            <Text style={styles.overallRatingLabel}>Panel Rating Benchmark</Text>
            <Text style={styles.overallRatingSub}>Across all criteria scores</Text>
          </View>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={16} color="#F59E0B" />
            <Text style={styles.ratingBadgeText}>{overallAvgRating} / 5.0</Text>
          </View>
        </View>

        <View style={styles.verdictBarSection}>
          <View style={styles.verdictRow}>
            <Text style={styles.verdictLabel}>Strong Yes</Text>
            <View style={styles.barWrap}>
              <View style={[styles.barFill, { width: `${verdictDistribution.strong_yes.pct}%`, backgroundColor: '#15803D' }]} />
            </View>
            <Text style={styles.verdictCountText}>{verdictDistribution.strong_yes.count} ({verdictDistribution.strong_yes.pct}%)</Text>
          </View>

          <View style={styles.verdictRow}>
            <Text style={styles.verdictLabel}>Yes</Text>
            <View style={styles.barWrap}>
              <View style={[styles.barFill, { width: `${verdictDistribution.yes.pct}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={styles.verdictCountText}>{verdictDistribution.yes.count} ({verdictDistribution.yes.pct}%)</Text>
          </View>

          <View style={styles.verdictRow}>
            <Text style={styles.verdictLabel}>Maybe</Text>
            <View style={styles.barWrap}>
              <View style={[styles.barFill, { width: `${verdictDistribution.maybe.pct}%`, backgroundColor: '#F59E0B' }]} />
            </View>
            <Text style={styles.verdictCountText}>{verdictDistribution.maybe.count} ({verdictDistribution.maybe.pct}%)</Text>
          </View>

          <View style={styles.verdictRow}>
            <Text style={styles.verdictLabel}>No</Text>
            <View style={styles.barWrap}>
              <View style={[styles.barFill, { width: `${verdictDistribution.no.pct}%`, backgroundColor: '#DC2626' }]} />
            </View>
            <Text style={styles.verdictCountText}>{verdictDistribution.no.count} ({verdictDistribution.no.pct}%)</Text>
          </View>
        </View>
      </View>

      {/* JOBS SUMMARY */}
      <Text style={styles.sectionTitle}>Requisition Breakdown</Text>
      <View style={styles.card}>
        {jobs.length === 0 ? (
          <Text style={styles.emptyText}>No active job requisitions.</Text>
        ) : (
          jobs.map((j) => (
            <View key={j.id} style={styles.jobRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobRowTitle}>{j.title}</Text>
                <Text style={styles.jobRowDept}>{j.department || 'General'}</Text>
              </View>
              <View style={styles.jobCountPill}>
                <Text style={styles.jobCountText}>{j.candidates?.length || 0} Candidates</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.secondaryText },
  header: { marginBottom: 20, paddingTop: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.secondaryText, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10, marginTop: 10 },
  funnelCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: 16 },
  funnelStep: { flexDirection: 'row', alignItems: 'center' },
  funnelIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  funnelInfo: { flex: 1 },
  funnelStepTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  funnelStepSub: { fontSize: 11, color: colors.secondaryText, marginTop: 1 },
  funnelStepCount: { fontSize: 18, fontWeight: '800', color: colors.text },
  funnelDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: 16 },
  overallRatingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  overallRatingLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  overallRatingSub: { fontSize: 11, color: colors.secondaryText, marginTop: 1 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  ratingBadgeText: { fontSize: 14, fontWeight: '800', color: '#B45309' },
  verdictBarSection: { marginTop: 14, gap: 10 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verdictLabel: { width: 75, fontSize: 12, fontWeight: '600', color: colors.secondaryText },
  barWrap: { flex: 1, height: 8, backgroundColor: colors.divider, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  verdictCountText: { width: 70, fontSize: 11, fontWeight: '600', color: colors.secondaryText, textAlign: 'right' },
  jobRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  jobRowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  jobRowDept: { fontSize: 12, color: colors.secondaryText, marginTop: 1 },
  jobCountPill: { backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  jobCountText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  conversionMetricsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  conversionBox: { flex: 1, backgroundColor: colors.background, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.divider },
  conversionNum: { fontSize: 18, fontWeight: '800', color: '#16A34A' },
  conversionLabel: { fontSize: 11, color: colors.secondaryText, marginTop: 2, textAlign: 'center' },
  statusGrid: { flexDirection: 'row', gap: 10 },
  statusCard: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.divider },
  statusNum: { fontSize: 20, fontWeight: '800' },
  statusLabel: { fontSize: 11, fontWeight: '600', color: colors.secondaryText, marginTop: 2, textAlign: 'center' },
  emptyText: { fontSize: 13, color: colors.mutedText, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
});
