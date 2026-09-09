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
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';
import { RadarChart, RadarSeries } from '../../components/charts/RadarChart';

const VERDICT_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  strong_yes: { label: 'Strong Yes', bg: '#DCFCE7', text: '#15803D', icon: 'checkmark-circle' },
  maybe: { label: 'Maybe', bg: '#FEF3C7', text: '#B45309', icon: 'help-circle' },
  no: { label: 'No', bg: '#FEE2E2', text: '#DC2626', icon: 'close-circle' },
};

const CHART_COLORS = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DC2626'];

interface CandidateCompareRow {
  candidate: any;
  feedbacks: any[];
  averageScore: number;
  interviewCount: number;
  consensusVerdict: string;
}

export default function CompareCandidatesScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();

  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, any[]>>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Deep Dive Modal state
  const [selectedCandidateRow, setSelectedCandidateRow] = useState<CandidateCompareRow | null>(null);
  const [deepDiveVisible, setDeepDiveVisible] = useState(false);

  // 1. Fetch Open Jobs
  const fetchJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, department')
        .order('title', { ascending: true });

      if (error) throw error;
      setJobs(data || []);

      if (data && data.length > 0 && !selectedJobId) {
        setSelectedJobId(data[0].id);
      }
    } catch (err: any) {
      console.warn('Compare fetch jobs error:', err);
    }
  }, [selectedJobId]);

  // 2. Fetch Candidates, Stages, Criteria & Feedback for selected Job
  const loadJobData = useCallback(async (jobIdToLoad: string) => {
    if (!jobIdToLoad) return;
    try {
      setLoading(true);

      const [
        { data: stageData },
        { data: critData },
        { data: candData, error: candErr },
      ] = await Promise.all([
        supabase
          .from('stages')
          .select('*')
          .eq('job_id', jobIdToLoad)
          .order('position', { ascending: true }),
        supabase
          .from('criteria')
          .select('*')
          .eq('job_id', jobIdToLoad)
          .order('position', { ascending: true }),
        supabase
          .from('candidates')
          .select(
            `
            *,
            stages (
              id,
              name,
              position
            )
          `
          )
          .eq('job_id', jobIdToLoad)
          .order('created_at', { ascending: false }),
      ]);

      if (candErr) throw candErr;
      setStages(stageData || []);
      setCriteria(critData || []);
      setCandidates(candData || []);

      // Fetch Feedback for all candidates in this job
      const candIds = (candData || []).map((c) => c.id);
      if (candIds.length > 0) {
        const { data: fbData, error: fbErr } = await supabase
          .from('feedback')
          .select(
            `
            *,
            stages (
              name,
              position
            ),
            profiles (
              id,
              name,
              email
            ),
            feedback_scores (
              id,
              criterion_id,
              score,
              note,
              criteria (
                name
              )
            )
          `
          )
          .in('candidate_id', candIds);

        if (fbErr) console.warn('Feedback query error:', fbErr);

        const map: Record<string, any[]> = {};
        (fbData || []).forEach((fb) => {
          const list = map[fb.candidate_id] || [];
          list.push(fb);
          map[fb.candidate_id] = list;
        });
        setFeedbackMap(map);
      } else {
        setFeedbackMap({});
      }
    } catch (err: any) {
      console.warn('Compare load error:', err);
      Alert.alert('Error', err.message || 'Failed to load comparison data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (selectedJobId) {
      loadJobData(selectedJobId);
    }
  }, [selectedJobId, loadJobData]);

  useFocusEffect(
    useCallback(() => {
      if (selectedJobId) {
        loadJobData(selectedJobId);
      }
    }, [selectedJobId, loadJobData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    if (selectedJobId) {
      await loadJobData(selectedJobId);
    }
  };

  // Build Compare Rows with calculated stats
  const compareRows = useMemo((): CandidateCompareRow[] => {
    return candidates.map((cand) => {
      const feedbacks = feedbackMap[cand.id] || [];

      // Calculate average score across all feedback_scores
      let totalScore = 0;
      let scoreCount = 0;
      const verdictCounts: Record<string, number> = {};

      feedbacks.forEach((fb) => {
        if (fb.overall_verdict) {
          verdictCounts[fb.overall_verdict] = (verdictCounts[fb.overall_verdict] || 0) + 1;
        }
        (fb.feedback_scores || []).forEach((s: any) => {
          totalScore += s.score;
          scoreCount++;
        });
      });

      const averageScore = scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(1)) : 0;

      // Determine consensus verdict
      let consensusVerdict = 'None';
      let maxCount = 0;
      Object.entries(verdictCounts).forEach(([v, count]) => {
        if (count > maxCount) {
          maxCount = count;
          consensusVerdict = v;
        }
      });

      return {
        candidate: cand,
        feedbacks,
        averageScore,
        interviewCount: feedbacks.length,
        consensusVerdict,
      };
    });
  }, [candidates, feedbackMap]);

  // Deep dive radar data
  const deepDiveRadar = useMemo(() => {
    if (!selectedCandidateRow || criteria.length === 0) {
      return { labels: [], series: [] };
    }
    const labels = criteria.map((c) => c.name);
    const series: RadarSeries[] = selectedCandidateRow.feedbacks.map((fb, idx) => {
      const name = fb.profiles?.name || `Interviewer ${idx + 1}`;
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      const scoreMap = new Map<string, number>();
      (fb.feedback_scores || []).forEach((s: any) => {
        scoreMap.set(s.criterion_id, s.score);
      });
      const scores = criteria.map((c) => scoreMap.get(c.id) ?? 0);
      return { interviewerName: name, color, scores };
    });
    return { labels, series };
  }, [selectedCandidateRow, criteria]);

  const deepDiveFeedbacks = useMemo(() => {
    if (!selectedCandidateRow) return [];

    return [...selectedCandidateRow.feedbacks].sort((a, b) => {
      const aPosition = a.stages?.position ?? Number.MAX_SAFE_INTEGER;
      const bPosition = b.stages?.position ?? Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition;
    });
  }, [selectedCandidateRow]);

  // --- ACTIONS IN DEEP DIVE ---

  const handleAdvanceStage = async () => {
    if (!selectedCandidateRow) return;
    const cand = selectedCandidateRow.candidate;
    const currentPos = cand.stages?.position || 1;
    const nextStage = stages.find((s) => s.position === currentPos + 1);

    if (!nextStage) {
      Alert.alert('Final Stage', 'Candidate is already at the final interview stage.');
      return;
    }

    Alert.alert(
      'Advance Stage',
      `Move ${cand.full_name} to "${nextStage.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance Stage',
          onPress: async () => {
            try {
              setActionLoading(true);
              const { error } = await supabase
                .from('candidates')
                .update({ current_stage_id: nextStage.id, updated_at: new Date().toISOString() })
                .eq('id', cand.id);

              if (error) throw error;

              if (user?.id) {
                await supabase.from('activity_logs').insert({
                  candidate_id: cand.id,
                  user_id: user.id,
                  action: 'stage_moved',
                  metadata: {
                    from_stage_id: cand.current_stage_id,
                    from_stage_name: cand.stages?.name,
                    to_stage_id: nextStage.id,
                    stage_name: nextStage.name,
                  },
                });
              }

              Alert.alert('Success', `${cand.full_name} advanced to ${nextStage.name}`);
              setDeepDiveVisible(false);
              loadJobData(selectedJobId);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to move candidate');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleHireDecision = async () => {
    if (!selectedCandidateRow) return;
    const cand = selectedCandidateRow.candidate;

    Alert.alert('Hire Candidate', `Extend offer and mark ${cand.full_name} as HIRED?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Hire 🎉',
        onPress: async () => {
          try {
            setActionLoading(true);

            const updatedAt = new Date().toISOString();
            const { error: candidateUpdateError } = await supabase
              .from('candidates')
              .update({
                decision_status: 'hired',
                updated_at: updatedAt,
              })
              .eq('id', cand.id);

            if (candidateUpdateError) throw candidateUpdateError;

            try {
              const { getDb } = require('../../lib/sqlite/schema');
              const db = getDb();
              db.runSync(
                `UPDATE candidates SET decision_status = 'hired', updated_at = ? WHERE id = ?`,
                [updatedAt, cand.id]
              );
            } catch (e) {
              console.warn('[HIRE CANDIDATE] Local candidate mirror update note:', e);
            }

            if (user?.id) {
              await supabase.from('activity_logs').insert({
                candidate_id: cand.id,
                user_id: user.id,
                action: 'marked_hire',
                metadata: {
                  decision_note: 'Candidate accepted offer / Hired',
                  candidate_name: cand.full_name,
                },
              });
            }
            Alert.alert('Hired!', `${cand.full_name} has been marked as Hired.`);
            setDeepDiveVisible(false);
            loadJobData(selectedJobId);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to record hire decision');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleRejectDecision = async () => {
    if (!selectedCandidateRow) return;
    const cand = selectedCandidateRow.candidate;

    Alert.alert('Reject Candidate', `Are you sure you want to mark ${cand.full_name} as REJECTED?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            setActionLoading(true);

            const updatedAt = new Date().toISOString();
            const { error: candidateUpdateError } = await supabase
              .from('candidates')
              .update({
                decision_status: 'rejected',
                updated_at: updatedAt,
              })
              .eq('id', cand.id);

            if (candidateUpdateError) throw candidateUpdateError;

            try {
              const { getDb } = require('../../lib/sqlite/schema');
              const db = getDb();
              db.runSync(
                `UPDATE candidates SET decision_status = 'rejected', updated_at = ? WHERE id = ?`,
                [updatedAt, cand.id]
              );
            } catch (e) {
              console.warn('[REJECT CANDIDATE] Local candidate mirror update note:', e);
            }

            if (user?.id) {
              await supabase.from('activity_logs').insert({
                candidate_id: cand.id,
                user_id: user.id,
                action: 'marked_reject',
                metadata: {
                  decision_note: 'Application rejected',
                  candidate_name: cand.full_name,
                },
              });
            }
            Alert.alert('Rejected', `${cand.full_name} application closed.`);
            setDeepDiveVisible(false);
            loadJobData(selectedJobId);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to record reject decision');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };
  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Candidate Comparison</Text>
          <Text style={styles.subtitle}>Side-by-side evaluation metrics & consensus</Text>
        </View>
      </View>

      {/* JOB SELECTOR CHIPS */}
      <View style={styles.jobSelectSection}>
        <Text style={styles.jobSelectLabel}>Compare Candidates For:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jobScroll}>
          {jobs.map((job) => {
            const isSelected = selectedJobId === job.id;
            return (
              <Pressable
                key={job.id}
                style={[styles.jobPill, isSelected && styles.jobPillActive]}
                onPress={() => setSelectedJobId(job.id)}
              >
                <Text style={[styles.jobPillText, isSelected && styles.jobPillTextActive]}>
                  {job.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* COMPARISON CONTENT */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Analyzing Candidate Evaluations...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {compareRows.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="git-compare-outline" size={42} color={colors.mutedText} />
              <Text style={styles.emptyTitle}>No Candidates to Compare</Text>
              <Text style={styles.emptySubtitle}>
                Add candidates and collect panel evaluations to see side-by-side competency comparisons.
              </Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={() =>
                  router.push({
                    pathname: ROUTES.adminAddCandidate,
                    params: { jobId: selectedJobId },
                  })
                }
              >
                <Text style={styles.emptyBtnText}>Add Candidate to this Job</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* TABLE HEADER */}
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Candidate & Stage</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>Avg Score</Text>
                <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>Verdict</Text>
                <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Reviews</Text>
              </View>

              {/* TABLE ROWS / CARDS */}
              {compareRows.map((row) => {
                const cand = row.candidate;
                const verdictCfg = VERDICT_CONFIG[row.consensusVerdict] || {
                  label: 'Pending',
                  bg: colors.divider,
                  text: colors.secondaryText,
                  icon: 'hourglass-outline',
                };

                return (
                  <Pressable
                    key={cand.id}
                    style={styles.tableRow}
                    onPress={() => {
                      setSelectedCandidateRow(row);
                      setDeepDiveVisible(true);
                    }}
                  >
                    {/* COL 1: CANDIDATE & STAGE */}
                    <View style={{ flex: 2 }}>
                      <Text style={styles.rowCandName} numberOfLines={1}>
                        {cand.full_name}
                      </Text>
                      <Text style={styles.rowCandRole} numberOfLines={1}>
                        {cand.current_role || 'Candidate'}
                      </Text>
                      <View style={styles.rowStageBadge}>
                        <Ionicons name="git-branch-outline" size={10} color={colors.primary} />
                        <Text style={styles.rowStageText} numberOfLines={1}>
                          {cand.stages?.name || 'Screening'}
                        </Text>
                      </View>
                    </View>

                    {/* COL 2: AVG SCORE */}
                    <View style={{ flex: 1.2, alignItems: 'center' }}>
                      <View style={styles.scorePill}>
                        <Ionicons name="star" size={13} color="#F59E0B" />
                        <Text style={styles.scorePillText}>
                          {row.averageScore > 0 ? row.averageScore : '—'}
                        </Text>
                      </View>
                      <Text style={styles.scoreMaxText}>out of 5.0</Text>
                    </View>

                    {/* COL 3: VERDICT */}
                    <View style={{ flex: 1.5, alignItems: 'center' }}>
                      <View style={[styles.verdictPill, { backgroundColor: verdictCfg.bg }]}>
                        <Text style={[styles.verdictPillText, { color: verdictCfg.text }]} numberOfLines={1}>
                          {verdictCfg.label}
                        </Text>
                      </View>
                    </View>

                    {/* COL 4: INTERVIEW COUNT & ACTION ARROW */}
                    <View style={{ width: 60, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <View style={styles.countWrap}>
                        <Text style={styles.countText}>{row.interviewCount}</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.mutedText} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.tapTipText}>
                💡 Tap on any candidate to open the Candidate Deep Dive modal with detailed criteria scores and Radar Chart.
              </Text>
            </>
          )}
        </ScrollView>
      )}

      {/* DEEP DIVE MODAL */}
      <Modal visible={deepDiveVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedCandidateRow && (
              <>
                {/* MODAL HEADER */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalCandidateName}>
                      {selectedCandidateRow.candidate.full_name}
                    </Text>
                    <Text style={styles.modalCandidateSub}>
                      {selectedCandidateRow.candidate.current_role || 'Candidate'} • Current Stage:{' '}
                      <Text style={{ fontWeight: '700', color: colors.primary }}>
                        {selectedCandidateRow.candidate.stages?.name || 'Screening'}
                      </Text>
                    </Text>
                  </View>
                  <Pressable
                    style={styles.modalCloseBtn}
                    onPress={() => setDeepDiveVisible(false)}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={22} color={colors.text} />
                  </Pressable>
                </View>

                {/* MODAL BODY */}
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {/* METRICS ROW */}
                  <View style={styles.modalMetricsRow}>
                    <View style={styles.modalMetricBox}>
                      <Text style={styles.modalMetricNum}>
                        {selectedCandidateRow.averageScore > 0 ? selectedCandidateRow.averageScore : '—'}
                      </Text>
                      <Text style={styles.modalMetricLabel}>Avg Rating</Text>
                    </View>
                    <View style={styles.modalMetricBox}>
                      <Text style={styles.modalMetricNum}>
                        {selectedCandidateRow.interviewCount}
                      </Text>
                      <Text style={styles.modalMetricLabel}>Reviews</Text>
                    </View>
                    <View style={styles.modalMetricBox}>
                      <Text style={[styles.modalMetricNum, { textTransform: 'capitalize' }]}>
                        {selectedCandidateRow.consensusVerdict.replace('_', ' ')}
                      </Text>
                      <Text style={styles.modalMetricLabel}>Consensus</Text>
                    </View>
                  </View>

                  {/* RADAR CHART */}
                  {deepDiveRadar.labels.length > 0 && deepDiveRadar.series.length > 0 ? (
                    <View style={styles.modalRadarCard}>
                      <Text style={styles.radarCardTitle}>Interviewer Comparison Radar</Text>
                      <RadarChart
                        criteriaLabels={deepDiveRadar.labels}
                        series={deepDiveRadar.series}
                        size={280}
                      />
                    </View>
                  ) : null}

                  {/* ALL REVIEWER FEEDBACK CARDS */}
                  <Text style={styles.modalFeedbackSectionTitle}>
                    Interviewer Evaluations ({selectedCandidateRow.feedbacks.length})
                  </Text>

                  {selectedCandidateRow.feedbacks.length === 0 ? (
                    <View style={styles.emptyFeedbacksBox}>
                      <Text style={styles.emptyFeedbacksText}>
                        No interview evaluations submitted for this candidate yet.
                      </Text>
                    </View>
                  ) : (
                    deepDiveFeedbacks.map((fb) => {
                      const reviewerName = fb.profiles?.name || 'Interviewer';
                      const vCfg = VERDICT_CONFIG[fb.overall_verdict] || VERDICT_CONFIG.maybe;

                      return (
                        <View key={fb.id} style={styles.modalFbCard}>
                          <View style={styles.modalFbHeader}>
                            <View>
                              <Text style={styles.reviewerNameText}>{reviewerName}</Text>
                              <Text style={styles.reviewerStageText}>{fb.stages?.name || 'Round'}</Text>
                            </View>
                            <View style={[styles.verdictPill, { backgroundColor: vCfg.bg }]}>
                              <Text style={[styles.verdictPillText, { color: vCfg.text }]}>
                                {vCfg.label}
                              </Text>
                            </View>
                          </View>

                          {/* CRITERIA SCORES */}
                          {fb.feedback_scores && fb.feedback_scores.length > 0 && (
                            <View style={styles.criteriaGrid}>
                              {fb.feedback_scores.map((sc: any) => (
                                <View key={sc.id} style={styles.criterionScoreRow}>
                                  <Text style={styles.criterionNameText} numberOfLines={1}>
                                    {sc.criteria?.name}
                                  </Text>
                                  <View style={styles.criterionStarsWrap}>
                                    <Ionicons name="star" size={12} color="#F59E0B" />
                                    <Text style={styles.criterionScoreText}>{sc.score}/5</Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}

                          {fb.positives ? (
                            <Text style={styles.commentText}>
                              <Text style={{ fontWeight: '700' }}>Strengths: </Text>
                              {fb.positives}
                            </Text>
                          ) : null}
                          {fb.concerns ? (
                            <Text style={styles.commentText}>
                              <Text style={{ fontWeight: '700' }}>Concerns: </Text>
                              {fb.concerns}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })
                  )}

                  {/* DECISION ACTIONS */}
                  <View style={styles.modalActionsCard}>
                    <Text style={styles.modalActionsTitle}>Candidate Decision Actions</Text>
                    <View style={styles.modalActionButtons}>
                      <Pressable
                        style={styles.modalAdvanceBtn}
                        onPress={handleAdvanceStage}
                        disabled={actionLoading}
                      >
                        <Ionicons name="arrow-forward-circle" size={16} color="#FFFFFF" />
                        <Text style={styles.modalAdvanceBtnText}>Advance Stage</Text>
                      </Pressable>

                      <View style={styles.modalDecisionSplit}>
                        <Pressable
                          style={styles.modalHireBtn}
                          onPress={handleHireDecision}
                          disabled={actionLoading}
                        >
                          <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                          <Text style={styles.modalHireBtnText}>Hire Candidate</Text>
                        </Pressable>

                        <Pressable
                          style={styles.modalRejectBtn}
                          onPress={handleRejectDecision}
                          disabled={actionLoading}
                        >
                          <Ionicons name="close-circle" size={16} color="#DC2626" />
                          <Text style={styles.modalRejectBtnText}>Reject</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  jobSelectSection: { backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  jobSelectLabel: { fontSize: 12, fontWeight: '700', color: colors.secondaryText, marginBottom: 6, textTransform: 'uppercase' },
  jobScroll: { gap: 8 },
  jobPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.cardBorder, marginRight: 6 },
  jobPillActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  jobPillText: { fontSize: 12, fontWeight: '600', color: colors.secondaryText },
  jobPillTextActive: { color: colors.primary, fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.secondaryText, textAlign: 'center', marginTop: 4, lineHeight: 18, marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.primaryLight, borderRadius: 8, marginBottom: 10 },
  th: { fontSize: 11, fontWeight: '700', color: colors.primaryDark, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.cardBorder, shadowColor: colors.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  rowCandName: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowCandRole: { fontSize: 12, color: colors.secondaryText, marginTop: 1 },
  rowStageBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
  rowStageText: { fontSize: 10, fontWeight: '600', color: colors.primary },
  scorePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.warningLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  scorePillText: { fontSize: 13, fontWeight: '800', color: colors.warning },
  scoreMaxText: { fontSize: 10, color: colors.mutedText, marginTop: 2 },
  verdictPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  verdictPillText: { fontSize: 11, fontWeight: '700' },
  countWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countText: { fontSize: 13, fontWeight: '700', color: colors.text },
  tapTipText: { fontSize: 12, color: colors.secondaryText, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  modalCandidateName: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalCandidateSub: { fontSize: 12, color: colors.secondaryText, marginTop: 2 },
  modalCloseBtn: { padding: 4 },
  modalScroll: { padding: 16 },
  modalMetricsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modalMetricBox: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  modalMetricNum: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalMetricLabel: { fontSize: 11, color: colors.secondaryText, marginTop: 2 },
  modalRadarCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder, marginBottom: 16 },
  radarCardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8 },
  modalFeedbackSectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
  emptyFeedbacksBox: { backgroundColor: colors.background, borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 16 },
  emptyFeedbacksText: { fontSize: 12, color: colors.secondaryText, fontStyle: 'italic' },
  modalFbCard: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.cardBorder, gap: 8 },
  modalFbHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reviewerNameText: { fontSize: 14, fontWeight: '700', color: colors.text },
  reviewerStageText: { fontSize: 11, color: colors.secondaryText },
  criteriaGrid: { gap: 4, backgroundColor: colors.card, borderRadius: 6, padding: 8 },
  criterionScoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  criterionNameText: { fontSize: 12, color: colors.secondaryText, flex: 1 },
  criterionStarsWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  criterionScoreText: { fontSize: 11, fontWeight: '700', color: colors.text },
  commentText: { fontSize: 12, color: colors.secondaryText, lineHeight: 17 },
  modalActionsCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.cardBorder },
  modalActionsTitle: { fontSize: 12, fontWeight: '700', color: colors.secondaryText, textTransform: 'uppercase', marginBottom: 10 },
  modalActionButtons: { gap: 10 },
  modalAdvanceBtn: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8 },
  modalAdvanceBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  modalDecisionSplit: { flexDirection: 'row', gap: 10 },
  modalHireBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.successLight, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.success },
  modalHireBtnText: { color: colors.success, fontWeight: '700', fontSize: 13 },
  modalRejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.dangerLight, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  modalRejectBtnText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
