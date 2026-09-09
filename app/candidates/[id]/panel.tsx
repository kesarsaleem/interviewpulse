import { useTheme } from '../../../context/ThemeContext';
import { ThemeColors } from '../../../theme/colors';
import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../../hooks/useAuth';
import { usePanelFeedback } from '../../../hooks/usePanelFeedback';
import { useCandidate } from '../../../hooks/useCandidate';
import { useCriteria } from '../../../hooks/useCriteria';
import { canViewPanelFeedback } from '../../../services/feedbackService';
import { RadarChart, RadarSeries } from '../../../components/charts/RadarChart';
import { getDb } from '../../../lib/sqlite/schema';
import { ROUTES } from '../../../constants/routes';

const PANEL_COLORS = ['#2563EB', '#16A34A', '#D97706', '#9333EA', '#DC2626'];

export default function PanelSummaryScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { id: candidateId, stageId: paramStageId } = useLocalSearchParams<{
    id: string;
    stageId?: string;
  }>();
  const { user } = useAuth();

  const { data: onlineCandidate, isLoading: candidateLoading } = useCandidate(candidateId);

  // Local fallback for candidate if offline
  const candidate = useMemo(() => {
    if (onlineCandidate) return onlineCandidate;
    if (!candidateId) return null;
    try {
      const db = getDb();
      const local = db.getFirstSync<any>(
        `SELECT c.*, j.title as job_title, j.department as job_department, s.name as stage_name
         FROM candidates c
         LEFT JOIN jobs j ON j.id = c.job_id
         LEFT JOIN stages s ON s.id = c.current_stage_id
         WHERE c.id = ?`,
        [candidateId]
      );
      if (!local) return null;
      return {
        ...local,
        stage_name: local.stage_name ?? null,
        jobs: { title: local.job_title, department: local.job_department },
        stages: { name: local.stage_name },
      };
    } catch (err) {
      console.warn('Error reading local candidate in panel:', err);
      return null;
    }
  }, [onlineCandidate, candidateId]);

  const effectiveStageId = paramStageId || candidate?.current_stage_id || '';

  const { data: criteria = [] } = useCriteria(candidate?.job_id);

  // Check Blind Feedback Rule: has caller submitted feedback for candidate + stage?
  const unlocked = useMemo(() => {
    if (!user || !candidateId || !effectiveStageId) return false;
    try {
      return canViewPanelFeedback({
        candidateId,
        stageId: effectiveStageId,
        interviewerId: user.id,
      });
    } catch (err) {
      console.warn('Error checking blind feedback rule:', err);
      return false;
    }
  }, [user, candidateId, effectiveStageId]);

  const { data: onlinePanel = [], isLoading: panelLoading } = usePanelFeedback(
    candidateId,
    effectiveStageId,
    { enabled: unlocked }
  );

  // Local fallback for panel feedback if offline
  const panel = useMemo(() => {
    if (onlinePanel && onlinePanel.length > 0) return onlinePanel;
    if (!unlocked || !candidateId || !effectiveStageId) return [];

    try {
      const db = getDb();
      const localRows = db.getAllSync<any>(
        `SELECT f.*
         FROM feedback f
         WHERE f.candidate_id = ? AND f.stage_id = ?`,
        [candidateId, effectiveStageId]
      );

      return localRows.map((f) => {
        let scores: any[] = [];
        try {
          scores = db.getAllSync<any>(
            `SELECT fs.*, cr.name as criterion_name
             FROM feedback_scores fs
             LEFT JOIN criteria cr ON cr.id = fs.criterion_id
             WHERE fs.feedback_id = ?`,
            [f.id]
          );
        } catch {
          scores = [];
        }

        let interviewerName = f.interviewer_id === user?.id ? (user?.name || 'You') : 'Interviewer';
        try {
          const profileRow = db.getFirstSync<any>(
            `SELECT name FROM profiles WHERE id = ?`,
            [f.interviewer_id]
          );
          if (profileRow?.name) {
            interviewerName = profileRow.name;
          }
        } catch {
          // profiles row/table optional
        }

        return {
          ...f,
          scores,
          interviewer_name: interviewerName,
        };
      });
    } catch (err) {
      console.warn('Error reading local panel feedback:', err);
      return [];
    }
  }, [onlinePanel, unlocked, candidateId, effectiveStageId, user?.id, user?.name]);

  // Calculations: Averages & Verdicts
  const { overallAverage, criterionAverages, verdictCounts, radarSeries } = useMemo(() => {
    if (panel.length === 0) {
      return {
        overallAverage: '0.0',
        criterionAverages: {},
        verdictCounts: { strong_yes: 0, maybe: 0, no: 0 },
        radarSeries: [] as RadarSeries[],
      };
    }

    let totalScoreSum = 0;
    let totalScoreCount = 0;
    const critSums: Record<string, { sum: number; count: number }> = {};
    const vCounts = { strong_yes: 0, maybe: 0, no: 0 };

    panel.forEach((item) => {
      if (item.overall_verdict in vCounts) {
        vCounts[item.overall_verdict as keyof typeof vCounts]++;
      }
      (item.scores || []).forEach((s: any) => {
        totalScoreSum += s.score;
        totalScoreCount++;
        if (!critSums[s.criterion_id]) {
          critSums[s.criterion_id] = { sum: 0, count: 0 };
        }
        critSums[s.criterion_id].sum += s.score;
        critSums[s.criterion_id].count++;
      });
    });

    const critAvg: Record<string, string> = {};
    Object.keys(critSums).forEach((cid) => {
      const { sum, count } = critSums[cid];
      critAvg[cid] = count > 0 ? (sum / count).toFixed(1) : '0.0';
    });

    // Radar series
    const series: RadarSeries[] = panel.map((item, idx) => ({
      interviewerName: item.interviewer_id === user?.id ? 'You' : item.interviewer_name || `Interviewer ${idx + 1}`,
      color: PANEL_COLORS[idx % PANEL_COLORS.length],
      scores: criteria.map((c) => {
        const found = (item.scores || []).find((s: any) => s.criterion_id === c.id);
        return found ? found.score : 0;
      }),
    }));

    return {
      overallAverage: totalScoreCount > 0 ? (totalScoreSum / totalScoreCount).toFixed(1) : '0.0',
      criterionAverages: critAvg,
      verdictCounts: vCounts,
      radarSeries: series,
    };
  }, [panel, criteria, user?.id]);

  // 1. BLIND FEEDBACK RULE ENFORCEMENT: If not submitted yet
  if (!unlocked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Panel Summary</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.lockContainer}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed" size={36} color={colors.primary} />
          </View>
          <Text style={styles.lockTitle}>Blind Review In Effect</Text>
          <Text style={styles.lockDescription}>
            To eliminate bias, interviewers cannot view peer feedback, ratings, or panel comments until their own evaluation has been submitted.
          </Text>

          <Pressable
            style={styles.submitOwnBtn}
            onPress={() => {
              router.push({
                pathname: ROUTES.giveFeedback,
                params: { candidateId, stageId: effectiveStageId },
              } as any);
            }}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.submitOwnText}>Submit Your Feedback Now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (panelLoading && panel.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading panel reviews...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Panel Summary</Text>
          <Text style={styles.headerSubtitle}>
            {candidate?.full_name || 'Candidate'} • {candidate?.stages?.name || 'Round'}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* CANDIDATE HERO CARD */}
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {candidate?.full_name?.charAt(0)?.toUpperCase() || 'C'}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.candidateName}>{candidate?.full_name}</Text>
            <Text style={styles.roleText}>
              {candidate?.current_role || 'Candidate'}
              {candidate?.current_company ? ` • ${candidate.current_company}` : ''}
            </Text>
            <Text style={styles.jobText}>💼 {candidate?.jobs?.title || 'Job Opening'}</Text>
          </View>
        </View>

        {/* OVERALL PANEL METRICS */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Average Score</Text>
            <Text style={styles.metricValue}>{overallAverage} / 5 ⭐</Text>
            <Text style={styles.metricSub}>{panel.length} reviewer{panel.length > 1 ? 's' : ''}</Text>
          </View>

          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Verdict Split</Text>
            <View style={styles.verdictSplit}>
              <Text style={[styles.verdictBadge, styles.greenBadge]}>
                👍 {verdictCounts.strong_yes} Yes
              </Text>
              <Text style={[styles.verdictBadge, styles.yellowBadge]}>
                😐 {verdictCounts.maybe} Maybe
              </Text>
              <Text style={[styles.verdictBadge, styles.redBadge]}>
                👎 {verdictCounts.no} No
              </Text>
            </View>
          </View>
        </View>

        {/* RADAR CHART (IF CRITERIA & REVIEWS EXIST) */}
        {criteria.length >= 3 && radarSeries.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Panel Score Comparison</Text>
            <Text style={styles.sectionHelp}>Compare how interviewers rated each criterion</Text>
            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <RadarChart
                criteriaLabels={criteria.map((c) => c.name)}
                series={radarSeries}
                size={270}
              />
            </View>
          </View>
        )}

        {/* CRITERIA AVERAGES BREAKDOWN */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Criteria Scores (Panel Average)</Text>
          {criteria.map((c) => {
            const avg = criterionAverages[c.id] || '0.0';
            const numAvg = parseFloat(avg);
            const percentage = Math.min(Math.max((numAvg / 5) * 100, 0), 100);

            return (
              <View key={c.id} style={styles.critRow}>
                <View style={styles.critHeader}>
                  <Text style={styles.critName}>{c.name}</Text>
                  <Text style={styles.critScore}>{avg} / 5</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
                </View>
              </View>
            );
          })}
        </View>

        {/* ALL INTERVIEWER FEEDBACK DETAILS */}
        <Text style={styles.listSectionTitle}>All Interviewer Feedback ({panel.length})</Text>

        {panel.map((f, idx) => {
          const isYou = f.interviewer_id === user?.id;
          const color = PANEL_COLORS[idx % PANEL_COLORS.length];

          return (
            <View key={f.id} style={styles.reviewCard}>
              <View style={styles.reviewerHeader}>
                <View style={[styles.reviewerDot, { backgroundColor: color }]} />
                <Text style={styles.reviewerName}>
                  {isYou ? 'You (Your Submission)' : f.interviewer_name || 'Interviewer'}
                </Text>
                <View
                  style={[
                    styles.verdictPill,
                    f.overall_verdict === 'strong_yes'
                      ? styles.verdictPillGreen
                      : f.overall_verdict === 'maybe'
                      ? styles.verdictPillYellow
                      : styles.verdictPillRed,
                  ]}
                >
                  <Text
                    style={[
                      styles.verdictPillText,
                      f.overall_verdict === 'strong_yes'
                        ? styles.greenText
                        : f.overall_verdict === 'maybe'
                        ? styles.yellowText
                        : styles.redText,
                    ]}
                  >
                    {f.overall_verdict === 'strong_yes'
                      ? 'Strong Yes'
                      : f.overall_verdict === 'maybe'
                      ? 'Maybe'
                      : 'No'}
                  </Text>
                </View>
              </View>

              {/* CRITERIA RATINGS WITH NOTES */}
              <View style={styles.reviewScoresSection}>
                <Text style={styles.reviewSubhead}>Scores & Notes</Text>
                {(f.scores || []).map((s: any) => {
                  const crit = criteria.find((c) => c.id === s.criterion_id);
                  return (
                    <View key={s.id || s.criterion_id} style={styles.scoreItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={styles.scoreItemName}>{crit?.name || 'Criterion'}</Text>
                        <Text style={styles.scoreItemVal}>{s.score} / 5 ⭐</Text>
                      </View>
                      {s.note ? <Text style={styles.scoreItemNote}>"{s.note}"</Text> : null}
                    </View>
                  );
                })}
              </View>

              {/* POSITIVES */}
              <View style={styles.commentSection}>
                <Text style={styles.commentLabel}>✓ Positives</Text>
                <Text style={styles.commentBody}>{f.positives || 'None noted'}</Text>
              </View>

              {/* CONCERNS */}
              <View style={styles.commentSection}>
                <Text style={styles.commentLabel}>⚠ Concerns / Gaps</Text>
                <Text style={styles.commentBody}>{f.concerns || 'None noted'}</Text>
              </View>

              {/* QUESTIONS */}
              <View style={styles.commentSection}>
                <Text style={styles.commentLabel}>? Questions for Next Round</Text>
                <Text style={styles.commentBody}>{f.questions || 'None noted'}</Text>
              </View>

              {/* QUICK DETAILS */}
              <View style={styles.quickDetailsRow}>
                <Text style={styles.quickDetailText}>⏱ {f.duration_minutes || 0} mins</Text>
                <Text style={styles.quickDetailText}>🎥 {f.interview_mode || 'video'}</Text>
                <Text style={styles.quickDetailText}>
                  Solo hire: {f.would_hire_solo ? 'Yes' : 'No'}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
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
  },
  header: {
    backgroundColor: '#06235C',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: colors.inputBorder,
    fontSize: 12,
    marginTop: 2,
  },
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  lockDescription: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  submitOwnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
    gap: 8,
  },
  submitOwnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  candidateName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  roleText: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  jobText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 4,
  },
  metricSub: {
    fontSize: 11,
    color: colors.mutedText,
    marginTop: 2,
  },
  verdictSplit: {
    flexDirection: 'column',
    gap: 4,
    marginTop: 6,
  },
  verdictBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  greenBadge: {
    backgroundColor: colors.successLight,
    color: colors.success,
  },
  yellowBadge: {
    backgroundColor: colors.warningLight,
    color: '#D97706',
  },
  redBadge: {
    backgroundColor: colors.dangerLight,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  sectionHelp: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  critRow: {
    marginTop: 12,
  },
  critHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  critName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  critScore: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.divider,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  listSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    marginVertical: 10,
  },
  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  reviewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  verdictPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verdictPillGreen: {
    backgroundColor: colors.successLight,
  },
  verdictPillYellow: {
    backgroundColor: colors.warningLight,
  },
  verdictPillRed: {
    backgroundColor: colors.dangerLight,
  },
  verdictPillText: {
    fontSize: 11,
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
  reviewScoresSection: {
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingTop: 10,
    marginBottom: 10,
  },
  reviewSubhead: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  scoreItem: {
    paddingVertical: 4,
  },
  scoreItemName: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '600',
  },
  scoreItemVal: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  scoreItemNote: {
    fontSize: 11,
    color: colors.secondaryText,
    fontStyle: 'italic',
    marginTop: 2,
  },
  commentSection: {
    marginTop: 8,
  },
  commentLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.secondaryText,
  },
  commentBody: {
    fontSize: 13,
    color: colors.secondaryText,
    marginTop: 2,
    lineHeight: 18,
  },
  quickDetailsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: colors.divider,
    gap: 16,
  },
  quickDetailText: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '600',
  },
});
