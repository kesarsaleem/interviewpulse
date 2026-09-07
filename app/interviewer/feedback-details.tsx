import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase/client';
import { RadarChart, RadarSeries } from '../../components/charts/RadarChart';
import { useAuth } from '../../hooks/useAuth';
import { getLocalFeedbackDetails, isFeedbackEditable } from '../../services/feedbackService';
import { getDb } from '../../lib/sqlite/schema';

export default function FeedbackDetails() {
  const params = useLocalSearchParams<{
    feedbackId?: string;
    candidateId?: string;
    stageId?: string;
  }>();

  const { user } = useAuth();

  const [candidate, setCandidate] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'scores' | 'panel'>('overview');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      if (!user?.id) return;
      const fId = params.feedbackId;

      // 1. Offline First: SQLite
      if (fId) {
        const local = getLocalFeedbackDetails(fId);
        if (local) {
          setFeedback(local.feedback);
          setCandidate(local.candidate);
          setCriteria(local.criteria);
        }
      }

      // 2. Online Update: Supabase
      let fetchedFeedback: any = null;

      if (fId) {
        const { data: fbData, error: fbError } = await supabase
          .from('feedback')
          .select(
            `
            *,
            feedback_scores (
              id,
              criterion_id,
              score,
              note
            )
          `
          )
          .eq('id', fId)
          .maybeSingle();

        if (fbError) throw fbError;
        fetchedFeedback = fbData;
      } else if (params.candidateId && params.stageId) {
        const { data: fbData, error: fbError } = await supabase
          .from('feedback')
          .select(
            `
            *,
            feedback_scores (
              id,
              criterion_id,
              score,
              note
            )
          `
          )
          .eq('candidate_id', params.candidateId)
          .eq('stage_id', params.stageId)
          .eq('interviewer_id', user.id)
          .maybeSingle();

        if (fbError) throw fbError;
        fetchedFeedback = fbData;
      }

      if (fetchedFeedback) {
        setFeedback(fetchedFeedback);

        const targetCandidateId = fetchedFeedback.candidate_id || params.candidateId;

        // Fetch candidate
        if (targetCandidateId) {
          const { data: cData, error: cError } = await supabase
            .from('candidates')
            .select(
              `
              id,
              full_name,
              current_role,
              current_company,
              interview_date,
              interview_time,
              job_id,
              jobs (
                title,
                department
              ),
              stages (
                name
              )
            `
            )
            .eq('id', targetCandidateId)
            .maybeSingle();

          if (cError) throw cError;
          if (cData) {
            setCandidate(cData);

            // Fetch criteria for candidate's job
            if (cData.job_id) {
              const { data: crData, error: crError } = await supabase
                .from('criteria')
                .select('*')
                .eq('job_id', cData.job_id)
                .order('position');

              if (crError) throw crError;
              if (crData) setCriteria(crData);
            }
          }
        }
      }
    } catch (error: any) {
      console.log('FEEDBACK DETAIL ERROR', error?.message || error);
    } finally {
      setLoading(false);
    }
  }, [params.feedbackId, params.candidateId, params.stageId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 1-Hour Edit Rule Check
  const isEditable = useMemo(() => {
    if (!feedback) return false;
    return isFeedbackEditable(feedback);
  }, [feedback]);

  // Minutes remaining in 1-hour window
  const minutesRemaining = useMemo(() => {
    if (!feedback?.editable_until) return 0;
    const diff = new Date(feedback.editable_until).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / (60 * 1000)));
  }, [feedback]);

  // Average score
  const averageScore = useMemo(() => {
    const scores = feedback?.feedback_scores || [];
    if (scores.length === 0) return '0.0';
    const sum = scores.reduce((acc: number, item: any) => acc + (item.score || 0), 0);
    return (sum / scores.length).toFixed(1);
  }, [feedback]);

  // Radar Chart Series
  const radarSeries: RadarSeries[] = useMemo(() => {
    if (!criteria.length) return [];
    return [
      {
        interviewerName: 'Your Score',
        color: '#2563EB',
        scores: criteria.map((c) => {
          const found = feedback?.feedback_scores?.find((s: any) => s.criterion_id === c.id);
          return found ? found.score : 0;
        }),
      },
    ];
  }, [criteria, feedback]);

  const handleEditPress = () => {
    if (!isEditable) {
      Alert.alert(
        'Feedback Locked',
        'Feedback can only be edited within 1 hour after submission. This evaluation is now final.'
      );
      return;
    }

    router.push({
      pathname: `/feedback/${candidate?.id || feedback?.candidate_id}`,
      params: {
        stageId: feedback?.stage_id,
        feedbackId: feedback?.id,
      },
    } as any);
  };

  if (loading && !feedback) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading evaluation details...</Text>
      </SafeAreaView>
    );
  }

  if (!feedback) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="document-text-outline" size={48} color="#94A3B8" />
        <Text style={styles.notFoundTitle}>Feedback not found</Text>
        <Text style={styles.notFoundSub}>This feedback record could not be loaded.</Text>
        <Pressable style={styles.backButtonCenter} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.topHeader}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backIconBtn}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Feedback Details</Text>
          <Text style={styles.headerSubtitle}>
            {candidate?.full_name || 'Candidate Review'}
          </Text>
        </View>

        {/* Edit Button in Header — Visible only within 1 hour */}
        {isEditable ? (
          <Pressable style={styles.headerEditBtn} onPress={handleEditPress}>
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.headerEditText}>Edit</Text>
          </Pressable>
        ) : (
          <View style={styles.headerLockedPill}>
            <Ionicons name="lock-closed" size={13} color="#CBD5E1" />
            <Text style={styles.headerLockedText}>Locked</Text>
          </View>
        )}
      </View>

      {/* CANDIDATE INFO HERO CARD */}
      <View style={styles.candidateCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {candidate?.full_name?.charAt(0)?.toUpperCase() || 'C'}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.candidateName}>{candidate?.full_name || 'Candidate'}</Text>
          <Text style={styles.role}>
            {candidate?.current_role || 'Role'}
            {candidate?.current_company ? ` • ${candidate.current_company}` : ''}
          </Text>
          <Text style={styles.jobBadgeText}>
            💼 {candidate?.jobs?.title || 'Job Opening'} • {candidate?.stages?.name || 'Interview Round'}
          </Text>
          {candidate?.interview_date && (
            <Text style={styles.round}>
              📅 {candidate.interview_date} {candidate.interview_time ? `• ⏰ ${candidate.interview_time}` : ''}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.badge,
            feedback.overall_verdict === 'strong_yes'
              ? styles.badgeGreen
              : feedback.overall_verdict === 'maybe'
              ? styles.badgeYellow
              : styles.badgeRed,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              feedback.overall_verdict === 'strong_yes'
                ? styles.greenText
                : feedback.overall_verdict === 'maybe'
                ? styles.yellowText
                : styles.redText,
            ]}
          >
            {feedback.overall_verdict === 'strong_yes'
              ? 'Strong Yes'
              : feedback.overall_verdict === 'maybe'
              ? 'Maybe'
              : 'No'}
          </Text>
        </View>
      </View>

      {/* 1-HOUR EDIT STATUS BANNER */}
      {isEditable ? (
        <View style={styles.editWindowBanner}>
          <Ionicons name="time-outline" size={18} color="#2563EB" />
          <Text style={styles.editWindowText}>
            Editable for {minutesRemaining} more minutes (within 1 hour of submission).
          </Text>
          <Pressable style={styles.bannerEditBtn} onPress={handleEditPress}>
            <Text style={styles.bannerEditText}>Edit Now</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={16} color="#64748B" />
          <Text style={styles.lockedBannerText}>
            Read only. Feedback is locked 1 hour after submission.
          </Text>
        </View>
      )}

      {/* TABS */}
      <View style={styles.tabs}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'scores', label: 'Criteria & Radar' },
          { id: 'panel', label: 'Panel Summary' },
        ].map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTab(t.id as any)}
            style={[styles.tab, activeTab === t.id && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === t.id && styles.activeTabText]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* TAB CONTENT */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            {/* SCORE & VERDICT SUMMARY ROW */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Summary Overview</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Verdict</Text>
                  <Text style={styles.verdictEmoji}>
                    {feedback.overall_verdict === 'strong_yes'
                      ? '😊'
                      : feedback.overall_verdict === 'maybe'
                      ? '😐'
                      : '☹️'}
                  </Text>
                  <Text
                    style={[
                      styles.verdictName,
                      feedback.overall_verdict === 'strong_yes'
                        ? styles.greenText
                        : feedback.overall_verdict === 'maybe'
                        ? styles.yellowText
                        : styles.redText,
                    ]}
                  >
                    {feedback.overall_verdict === 'strong_yes'
                      ? 'Strong Yes'
                      : feedback.overall_verdict === 'maybe'
                      ? 'Maybe'
                      : 'No'}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Average Score</Text>
                  <Text style={styles.scoreBig}>{averageScore} / 5 ⭐</Text>
                  <Text style={styles.scoreCount}>
                    {feedback.feedback_scores?.length || 0} criteria
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Solo Hire</Text>
                  <Text style={styles.soloHireText}>
                    {feedback.would_hire_solo ? '👍 Yes' : '👎 No'}
                  </Text>
                  <Text style={styles.scoreCount}>as solo decider</Text>
                </View>
              </View>
            </View>

            {/* STRUCTURED COMMENTS */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Detailed Feedback</Text>

              <FeedbackRow
                icon="checkmark-circle"
                color="#16A34A"
                title="Positives & Strengths"
                text={feedback.positives}
              />

              <FeedbackRow
                icon="warning"
                color="#D97706"
                title="Concerns & Gaps"
                text={feedback.concerns}
              />

              <FeedbackRow
                icon="help-circle"
                color="#7C3AED"
                title="Questions for Next Round"
                text={feedback.questions}
              />
            </View>

            {/* QUICK DETAILS */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Session Details</Text>
              <View style={styles.quickRow}>
                <QuickBox title="Duration" value={`${feedback.duration_minutes || 0} mins`} icon="time-outline" />
                <QuickBox title="Interview Mode" value={feedback.interview_mode || 'Video'} icon="videocam-outline" />
                <QuickBox title="Sync Status" value={feedback.sync_status || 'synced'} icon="cloud-done-outline" />
              </View>
            </View>
          </>
        )}

        {/* TAB 2: SCORES & RADAR CHART */}
        {activeTab === 'scores' && (
          <>
            {/* RADAR CHART */}
            {criteria.length >= 3 && radarSeries.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Criteria Radar Chart</Text>
                <Text style={styles.sectionHelp}>Visual representation of your rating across criteria</Text>
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <RadarChart
                    criteriaLabels={criteria.map((c) => c.name)}
                    series={radarSeries}
                    size={280}
                  />
                </View>
              </View>
            )}

            {/* CRITERIA BREAKDOWN WITH NOTES */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Scores by Criteria</Text>

              {criteria.map((c) => {
                const foundScore = (feedback.feedback_scores || []).find(
                  (s: any) => s.criterion_id === c.id
                );
                const scoreVal = foundScore?.score ?? 0;
                const note = foundScore?.note;

                return (
                  <View key={c.id} style={styles.criterionDetailBlock}>
                    <View style={styles.criterionDetailHeader}>
                      <Text style={styles.criterionDetailName}>{c.name}</Text>
                      <Text style={styles.criterionDetailScore}>{scoreVal} / 5 ⭐</Text>
                    </View>

                    {/* Visual Star Display */}
                    <View style={styles.starsDisplayRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= scoreVal ? 'star' : 'star-outline'}
                          size={18}
                          color={star <= scoreVal ? '#F59E0B' : '#CBD5E1'}
                        />
                      ))}
                    </View>

                    {note ? (
                      <View style={styles.criterionNoteBox}>
                        <Text style={styles.criterionNoteText}>"{note}"</Text>
                      </View>
                    ) : (
                      <Text style={styles.noNoteText}>No specific note recorded.</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* TAB 3: PANEL SUMMARY NAVIGATION */}
        {activeTab === 'panel' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Full Panel Summary</Text>
            <Text style={styles.sectionHelp}>
              View evaluations, scores, and consensus feedback from all panel interviewers on this stage.
            </Text>

            <Pressable
              style={styles.openPanelBtn}
              onPress={() => {
                router.push({
                  pathname: `/candidates/${candidate?.id || feedback.candidate_id}/panel`,
                  params: { stageId: feedback.stage_id },
                } as any);
              }}
            >
              <Ionicons name="people" size={20} color="#fff" />
              <Text style={styles.openPanelBtnText}>Open Panel Summary Screen</Text>
            </Pressable>
          </View>
        )}

        {/* BOTTOM ACTION: EDIT BUTTON (IF EDITABLE) */}
        {isEditable ? (
          <Pressable style={styles.bottomEditBtn} onPress={handleEditPress}>
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.bottomEditText}>Edit Feedback ({minutesRemaining}m left)</Text>
          </Pressable>
        ) : (
          <View style={styles.bottomLockedContainer}>
            <Ionicons name="lock-closed" size={18} color="#64748B" />
            <Text style={styles.bottomLockedText}>
              Feedback is permanently locked. The 1-hour editing window has elapsed.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeedbackRow({
  icon,
  color,
  title,
  text,
}: {
  icon: any;
  color: string;
  title: string;
  text?: string;
}) {
  return (
    <View style={styles.feedbackRow}>
      <View style={[styles.feedbackIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.feedbackTitle}>{title}</Text>
        <Text style={styles.feedbackText}>{text || 'No remarks provided.'}</Text>
      </View>
    </View>
  );
}

function QuickBox({ title, value, icon }: { title: string; value: string; icon: any }) {
  return (
    <View style={styles.quickBox}>
      <Ionicons name={icon} size={18} color="#2563EB" style={{ marginBottom: 4 }} />
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickValue}>{value}</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },
  notFoundTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
  },
  notFoundSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  backButtonCenter: {
    marginTop: 20,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  topHeader: {
    backgroundColor: '#06235C',
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backIconBtn: {
    marginRight: 10,
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
  },
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  headerEditText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  headerLockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  headerLockedText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  candidateCard: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    height: 48,
    width: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2563EB',
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  role: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  jobBadgeText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 3,
  },
  round: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  badgeYellow: {
    backgroundColor: '#FEF3C7',
  },
  badgeRed: {
    backgroundColor: '#FEE2E2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  greenText: {
    color: '#15803D',
  },
  yellowText: {
    color: '#B45309',
  },
  redText: {
    color: '#DC2626',
  },
  editWindowBanner: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editWindowText: {
    flex: 1,
    fontSize: 11.5,
    color: '#1E40AF',
    fontWeight: '600',
  },
  bannerEditBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  bannerEditText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  lockedBanner: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockedBannerText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  tabs: {
    height: 46,
    backgroundColor: '#fff',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 12,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderColor: '#2563EB',
  },
  tabText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  activeTabText: {
    color: '#2563EB',
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  sectionHelp: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryItemLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  verdictEmoji: {
    fontSize: 26,
    marginTop: 4,
  },
  verdictName: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  scoreBig: {
    fontSize: 17,
    fontWeight: '900',
    color: '#2563EB',
    marginTop: 4,
  },
  scoreCount: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  soloHireText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  divider: {
    height: 40,
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  feedbackRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  feedbackIcon: {
    height: 36,
    width: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  feedbackTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  feedbackText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  quickBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickTitle: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  quickValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  criterionDetailBlock: {
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 12,
  },
  criterionDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  criterionDetailName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  criterionDetailScore: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  starsDisplayRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  criterionNoteBox: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
    padding: 8,
    borderRadius: 4,
  },
  criterionNoteText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
  },
  noNoteText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  openPanelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 14,
    gap: 8,
  },
  openPanelBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomEditBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  bottomEditText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomLockedContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  bottomLockedText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
});