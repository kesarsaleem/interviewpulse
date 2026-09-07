import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { RadarChart, RadarSeries } from '../../components/charts/RadarChart';

const VERDICT_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  strong_yes: { label: 'Strong Yes', bg: '#DCFCE7', text: '#15803D', icon: 'checkmark-circle' },
  yes: { label: 'Yes', bg: '#EFF6FF', text: '#2563EB', icon: 'thumbs-up' },
  maybe: { label: 'Maybe', bg: '#FEF3C7', text: '#B45309', icon: 'help-circle' },
  no: { label: 'No', bg: '#FEE2E2', text: '#DC2626', icon: 'close-circle' },
  strong_no: { label: 'Strong No', bg: '#7F1D1D', text: '#FFFFFF', icon: 'hand-left' },
};

const CHART_COLORS = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DC2626'];

export default function CandidateDetail() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const candidateId = (params.id || params.candidateId) as string;

  const [candidate, setCandidate] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [decisionState, setDecisionState] = useState<'hired' | 'rejected' | 'pending'>('pending');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'feedback' | 'radar' | 'timeline'>('overview');

  const loadCandidateData = useCallback(async () => {
    if (!candidateId) return;
    try {
      const { data: cand, error: candErr } = await supabase
        .from('candidates')
        .select(
          `
          *,
          jobs (
            id,
            title,
            department,
            description
          ),
          stages (
            id,
            name,
            position
          )
        `
        )
        .eq('id', candidateId)
        .single();

      if (candErr) throw candErr;
      setCandidate(cand);

      if (cand?.job_id) {
        const { data: stageData } = await supabase
          .from('stages')
          .select('*')
          .eq('job_id', cand.job_id)
          .order('position', { ascending: true });
        setStages(stageData || []);

        const { data: critData } = await supabase
          .from('criteria')
          .select('*')
          .eq('job_id', cand.job_id)
          .order('position', { ascending: true });
        setCriteria(critData || []);
      }

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
        .eq('candidate_id', candidateId)
        .order('submitted_at', { ascending: false });

      if (fbErr) console.warn('Feedback query error:', fbErr);
      setFeedbackList(fbData || []);

      const { data: logsData, error: logsErr } = await supabase
        .from('activity_logs')
        .select(
          `
          *,
          profiles (
            name
          )
        `
        )
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false });

      if (logsErr) console.warn('Logs query error:', logsErr);
      setActivityLogs(logsData || []);

      const candDecision = (cand as any)?.decision_status;
      const hireLog = logsData?.find((l) => l.action === 'marked_hire');
      const rejectLog = logsData?.find((l) => l.action === 'marked_reject');
      if (candDecision === 'hired' || hireLog) {
        setDecisionState('hired');
      } else if (candDecision === 'rejected' || rejectLog) {
        setDecisionState('rejected');
      } else {
        setDecisionState('pending');
      }
    } catch (err: any) {
      console.warn('Error loading candidate details:', err);
      Alert.alert('Error', err.message || 'Failed to load candidate profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [candidateId]);

  useEffect(() => {
    loadCandidateData();
  }, [loadCandidateData]);

  useFocusEffect(
    useCallback(() => {
      loadCandidateData();
    }, [loadCandidateData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCandidateData();
  };

  const refreshCandidate = async () => {
    await loadCandidateData();
  };

  const refreshActivity = async () => {
    await loadCandidateData();
  };

  const moveNextStage = async () => {
    if (!candidate || stages.length === 0) return;
    const currentPosition = candidate.stages?.position || 1;
    const nextStage = stages.find((s) => s.position === currentPosition + 1);

    if (!nextStage) {
      Alert.alert('Final Stage', 'This candidate is already at the final interview stage');
      return;
    }

    const fromStageName = candidate.stages?.name || 'Current Stage';
    const toStageName = nextStage.name || 'Next Stage';

    Alert.alert(
      'Advance Candidate',
      `Advance ${candidate.full_name} from "${fromStageName}" to "${toStageName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance Stage',
          onPress: async () => {
            try {
              setActionLoading(true);
              console.log('[MOVE STAGE] Advancing candidate:', candidate.id, 'to stage:', nextStage.id);

              // 1. Update candidates table
              const { data: updateRes, error: updateErr } = await supabase
                .from('candidates')
                .update({
                  current_stage_id: nextStage.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', candidate.id)
                .select();

              if (updateErr) {
                console.error('[MOVE STAGE] Error updating candidate:', updateErr);
                throw updateErr;
              }
              console.log('[MOVE STAGE] Supabase candidate updated:', updateRes);

              // Update SQLite mirror
              try {
                const { getDb } = require('../../lib/sqlite/schema');
                const db = getDb();
                db.runSync(
                  `UPDATE candidates SET current_stage_id = ?, updated_at = ? WHERE id = ?`,
                  [nextStage.id, new Date().toISOString(), candidate.id]
                );
              } catch (e) {
                console.warn('[MOVE STAGE] SQLite mirror update note:', e);
              }

              // 2. Insert activity_logs
              const actorId =
                user?.id || (await supabase.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000000';
              const actPayload = {
                candidate_id: candidate.id,
                user_id: actorId,
                action: 'stage_moved',
                metadata: {
                  from_stage: fromStageName,
                  to_stage: toStageName,
                },
              };

              console.log('[MOVE STAGE] Inserting activity log:', actPayload);
              const { data: actResult, error: actError } = await supabase
                .from('activity_logs')
                .insert(actPayload)
                .select();

              console.log('ACTIVITY INSERT RESULT', actResult, actError);

              // Insert into SQLite activity_logs
              try {
                const { getDb } = require('../../lib/sqlite/schema');
                const db = getDb();
                const actId = require('react-native-uuid').v4();
                db.runSync(
                  `INSERT INTO activity_logs (id, candidate_id, user_id, action, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    actId,
                    candidate.id,
                    actorId,
                    'stage_moved',
                    JSON.stringify(actPayload.metadata),
                    new Date().toISOString(),
                  ]
                );
              } catch (e) {}

              console.log('ACTION SUCCESS');
              await refreshCandidate();
              await refreshActivity();

              Alert.alert('Success', `${candidate.full_name} moved to ${toStageName}`);
            } catch (err: any) {
              console.error('[MOVE STAGE] Failed with error:', err);
              Alert.alert('Error', err.message || 'Failed to advance stage');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleHire = async () => {
    if (!candidate) return;
    Alert.alert('Hire Candidate', `Extend offer and mark ${candidate.full_name} as HIRED?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Hire 🎉',
        onPress: async () => {
          try {
            setActionLoading(true);
            console.log('[HIRE CANDIDATE] Initiating hire for:', candidate.id, candidate.full_name);

            // 1. Update candidates table decision_status = 'hired'
            try {
              const { data: cUpdate, error: cErr } = await supabase
                .from('candidates')
                .update({
                  decision_status: 'hired',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', candidate.id)
                .select();

              if (cErr) {
                console.warn('[HIRE CANDIDATE] Candidate table update note:', cErr.message);
              } else {
                console.log('[HIRE CANDIDATE] Candidate table updated:', cUpdate);
              }
            } catch (e) {
              console.warn('[HIRE CANDIDATE] Candidate update note:', e);
            }

            // Update SQLite mirror
            try {
              const { getDb } = require('../../lib/sqlite/schema');
              const db = getDb();
              db.runSync(
                `UPDATE candidates SET decision_status = 'hired', updated_at = ? WHERE id = ?`,
                [new Date().toISOString(), candidate.id]
              );
            } catch (e) {}

            // 2. Insert activity_logs
            const actorId =
              user?.id || (await supabase.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000000';
            const actPayload = {
              candidate_id: candidate.id,
              user_id: actorId,
              action: 'marked_hire',
              metadata: {
                candidate_name: candidate.full_name,
              },
            };

            console.log('[HIRE CANDIDATE] Inserting activity log:', actPayload);
            const { data: actResult, error: actError } = await supabase
              .from('activity_logs')
              .insert(actPayload)
              .select();

            console.log('ACTIVITY INSERT RESULT', actResult, actError);

            // Insert into SQLite activity_logs
            try {
              const { getDb } = require('../../lib/sqlite/schema');
              const db = getDb();
              const actId = require('react-native-uuid').v4();
              db.runSync(
                `INSERT INTO activity_logs (id, candidate_id, user_id, action, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  actId,
                  candidate.id,
                  actorId,
                  'marked_hire',
                  JSON.stringify(actPayload.metadata),
                  new Date().toISOString(),
                ]
              );
            } catch (e) {}

            console.log('ACTION SUCCESS');
            setDecisionState('hired');
            await refreshCandidate();
            await refreshActivity();

            Alert.alert('Hired!', `${candidate.full_name} has been marked as Hired.`);
          } catch (err: any) {
            console.error('[HIRE CANDIDATE] Failed with error:', err);
            Alert.alert('Error', err.message || 'Failed to log hire decision');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleReject = async () => {
    if (!candidate) return;
    Alert.alert('Reject Candidate', `Are you sure you want to mark ${candidate.full_name} as REJECTED?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            setActionLoading(true);
            console.log('[REJECT CANDIDATE] Initiating reject for:', candidate.id, candidate.full_name);

            // 1. Update candidates table decision_status = 'rejected'
            try {
              const { data: cUpdate, error: cErr } = await supabase
                .from('candidates')
                .update({
                  decision_status: 'rejected',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', candidate.id)
                .select();

              if (cErr) {
                console.warn('[REJECT CANDIDATE] Candidate table update note:', cErr.message);
              } else {
                console.log('[REJECT CANDIDATE] Candidate table updated:', cUpdate);
              }
            } catch (e) {
              console.warn('[REJECT CANDIDATE] Candidate update note:', e);
            }

            // Update SQLite mirror
            try {
              const { getDb } = require('../../lib/sqlite/schema');
              const db = getDb();
              db.runSync(
                `UPDATE candidates SET decision_status = 'rejected', updated_at = ? WHERE id = ?`,
                [new Date().toISOString(), candidate.id]
              );
            } catch (e) {}

            // 2. Insert activity_logs
            const actorId =
              user?.id || (await supabase.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000000';
            const actPayload = {
              candidate_id: candidate.id,
              user_id: actorId,
              action: 'marked_reject',
              metadata: {
                candidate_name: candidate.full_name,
              },
            };

            console.log('[REJECT CANDIDATE] Inserting activity log:', actPayload);
            const { data: actResult, error: actError } = await supabase
              .from('activity_logs')
              .insert(actPayload)
              .select();

            console.log('ACTIVITY INSERT RESULT', actResult, actError);

            // Insert into SQLite activity_logs
            try {
              const { getDb } = require('../../lib/sqlite/schema');
              const db = getDb();
              const actId = require('react-native-uuid').v4();
              db.runSync(
                `INSERT INTO activity_logs (id, candidate_id, user_id, action, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  actId,
                  candidate.id,
                  actorId,
                  'marked_reject',
                  JSON.stringify(actPayload.metadata),
                  new Date().toISOString(),
                ]
              );
            } catch (e) {}

            console.log('ACTION SUCCESS');
            setDecisionState('rejected');
            await refreshCandidate();
            await refreshActivity();

            Alert.alert('Rejected', `${candidate.full_name} application closed.`);
          } catch (err: any) {
            console.error('[REJECT CANDIDATE] Failed with error:', err);
            Alert.alert('Error', err.message || 'Failed to log reject decision');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleDeleteCandidate = () => {
    if (!candidate) return;
    Alert.alert(
      'Delete Candidate',
      `Are you sure you want to delete ${candidate.full_name}? All associated interview evaluations, scores, and activity logs will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              console.log('[DELETE CANDIDATE] Initiating delete for candidate:', candidate.id);

              // 1. Delete feedback scores
              const { data: fbs, error: fbsErr } = await supabase
                .from('feedback')
                .select('id')
                .eq('candidate_id', candidate.id);
              if (fbsErr) console.warn('[DELETE CANDIDATE] Error fetching feedback:', fbsErr);
              
              const fbIds = (fbs || []).map((f) => f.id);
              if (fbIds.length > 0) {
                console.log('[DELETE CANDIDATE] Step 1: Deleting feedback_scores for:', fbIds);
                const { error: sErr } = await supabase.from('feedback_scores').delete().in('feedback_id', fbIds);
                if (sErr) console.warn('[DELETE CANDIDATE] feedback_scores delete warning:', sErr);
                else console.log('[DELETE CANDIDATE] Deleted feedback_scores successfully');
              }

              // 2. Delete feedback
              console.log('[DELETE CANDIDATE] Step 2: Deleting feedback for candidate:', candidate.id);
              const { error: fbErr } = await supabase.from('feedback').delete().eq('candidate_id', candidate.id);
              if (fbErr) console.warn('[DELETE CANDIDATE] feedback delete warning:', fbErr);
              else console.log('[DELETE CANDIDATE] Deleted feedback successfully');

              // 3. Delete activity logs
              console.log('[DELETE CANDIDATE] Step 3: Deleting activity_logs for candidate:', candidate.id);
              const { error: actErr } = await supabase.from('activity_logs').delete().eq('candidate_id', candidate.id);
              if (actErr) console.warn('[DELETE CANDIDATE] activity_logs delete warning:', actErr);
              else console.log('[DELETE CANDIDATE] Deleted activity_logs successfully');

              // 4. Delete candidate
              console.log('[DELETE CANDIDATE] Step 4: Deleting candidate from candidates table:', candidate.id);
              const { error: candErr } = await supabase.from('candidates').delete().eq('id', candidate.id);
              if (candErr) {
                console.error('[DELETE CANDIDATE] Delete candidate error:', candErr);
                throw candErr;
              }
              console.log('[DELETE CANDIDATE] Deleted candidate successfully');

              // Clean SQLite mirror
              try {
                const { getDb } = require('../../lib/sqlite/schema');
                const db = getDb();
                db.runSync(
                  'DELETE FROM feedback_scores WHERE feedback_id IN (SELECT id FROM feedback WHERE candidate_id = ?)',
                  [candidate.id]
                );
                db.runSync('DELETE FROM feedback WHERE candidate_id = ?', [candidate.id]);
                db.runSync('DELETE FROM activity_logs WHERE candidate_id = ?', [candidate.id]);
                db.runSync('DELETE FROM candidates WHERE id = ?', [candidate.id]);
                console.log('[DELETE CANDIDATE] SQLite mirror cleaned');
              } catch (e) {}

              console.log('ACTION SUCCESS');
              Alert.alert('Deleted', 'Candidate removed from system', [
                { text: 'OK', onPress: () => router.replace('/admin/candidates') },
              ]);
            } catch (err: any) {
              console.error('[DELETE CANDIDATE] Failed with error:', err);
              Alert.alert('Error', err.message || 'Failed to delete candidate');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const openResume = async (url: string) => {
    if (!url) return;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Invalid Link', 'Cannot open the provided resume URL');
    }
  };

  const radarData = useMemo(() => {
    if (criteria.length === 0 || feedbackList.length === 0) {
      return { labels: [], series: [] };
    }

    const labels = criteria.map((c) => c.name);
    const series: RadarSeries[] = feedbackList.map((fb, idx) => {
      const interviewerName = fb.profiles?.name || `Interviewer ${idx + 1}`;
      const color = CHART_COLORS[idx % CHART_COLORS.length];

      const scoreMap = new Map<string, number>();
      (fb.feedback_scores || []).forEach((s: any) => {
        scoreMap.set(s.criterion_id, s.score);
      });

      const scores = criteria.map((c) => scoreMap.get(c.id) ?? 0);
      return { interviewerName, color, scores };
    });

    return { labels, series };
  }, [criteria, feedbackList]);

  const averageScore = useMemo(() => {
    let totalScore = 0;
    let count = 0;
    feedbackList.forEach((fb) => {
      (fb.feedback_scores || []).forEach((s: any) => {
        totalScore += s.score;
        count++;
      });
    });
    return count > 0 ? (totalScore / count).toFixed(1) : '—';
  }, [feedbackList]);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading Candidate Profile...</Text>
      </View>
    );
  }

  if (!candidate) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
        <Text style={styles.errorTitle}>Candidate Not Found</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back to Candidates</Text>
        </Pressable>
      </View>
    );
  }

  const currentStagePos = candidate.stages?.position || 1;
  const isFinalStage = stages.length > 0 && currentStagePos === stages.length;
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.topNav}>
        <Pressable style={styles.navBackBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {candidate.full_name}
        </Text>
        <View style={styles.navActionsRow}>
          <Pressable
            style={styles.navEditBtn}
            onPress={() =>
              router.push({
                pathname: '/admin/add-candidate',
                params: { candidateId: candidate.id },
              })
            }
          >
            <Ionicons name="create-outline" size={16} color="#2563EB" />
            <Text style={styles.navEditText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.navDeleteBtn}
            onPress={handleDeleteCandidate}
            disabled={actionLoading}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
          </Pressable>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{candidate.full_name?.charAt(0) || 'C'}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.candidateName}>{candidate.full_name}</Text>
            <Text style={styles.candidateRole}>
              {candidate.current_role || 'Candidate'}
              {candidate.current_company ? ` • ${candidate.current_company}` : ''}
            </Text>
            <Text style={styles.jobBadgeText}>
              Applying for: <Text style={{ fontWeight: '700' }}>{candidate.jobs?.title || 'Open Role'}</Text>
            </Text>
          </View>
          {decisionState === 'hired' ? (
            <View style={[styles.decisionBadge, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={[styles.decisionBadgeText, { color: '#16A34A' }]}>HIRED</Text>
            </View>
          ) : decisionState === 'rejected' ? (
            <View style={[styles.decisionBadge, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="close-circle" size={14} color="#DC2626" />
              <Text style={[styles.decisionBadgeText, { color: '#DC2626' }]}>REJECTED</Text>
            </View>
          ) : (
            <View style={[styles.decisionBadge, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="hourglass-outline" size={13} color="#2563EB" />
              <Text style={[styles.decisionBadgeText, { color: '#2563EB' }]}>IN REVIEW</Text>
            </View>
          )}
        </View>

        <View style={styles.stageProgressBox}>
          <View style={styles.stageProgressHeader}>
            <Text style={styles.stageProgressTitle}>Current Stage</Text>
            <Text style={styles.stageProgressStep}>
              Round {currentStagePos} of {stages.length || 1}
            </Text>
          </View>
          <Text style={styles.stageNameHighlight}>
            {candidate.stages?.name || 'Screening Round'}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(
                    100,
                    stages.length > 0 ? (currentStagePos / stages.length) * 100 : 25
                  )}%`,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricVal}>{feedbackList.length}</Text>
            <Text style={styles.metricLbl}>Evaluations</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricVal, { color: '#2563EB' }]}>{averageScore}</Text>
            <Text style={styles.metricLbl}>Avg Score</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricVal}>{candidate.referral_source || 'other'}</Text>
            <Text style={styles.metricLbl}>Source</Text>
          </View>
        </View>
      </View>

      <View style={styles.decisionActionsCard}>
        <Text style={styles.decisionActionsTitle}>Hiring Decision & Actions</Text>
        <View style={styles.actionsBtnGroup}>
          {!isFinalStage && decisionState === 'pending' && (
            <Pressable style={styles.advanceBtn} onPress={moveNextStage} disabled={actionLoading}>
              <Ionicons name="arrow-forward-circle" size={18} color="#FFFFFF" />
              <Text style={styles.advanceBtnText}>Move to Next Stage</Text>
            </Pressable>
          )}

          <View style={styles.finalDecisionRow}>
            <Pressable
              style={[styles.hireBtn, decisionState === 'hired' && styles.actionBtnActive]}
              onPress={handleHire}
              disabled={actionLoading}
            >
              <Ionicons name="checkmark-circle-outline" size={17} color="#16A34A" />
              <Text style={styles.hireBtnText}>
                {decisionState === 'hired' ? 'Offer Extended' : 'Hire Candidate'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.rejectBtn, decisionState === 'rejected' && styles.actionBtnActive]}
              onPress={handleReject}
              disabled={actionLoading}
            >
              <Ionicons name="close-circle-outline" size={17} color="#DC2626" />
              <Text style={styles.rejectBtnText}>
                {decisionState === 'rejected' ? 'Application Closed' : 'Reject'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {(
          [
            { key: 'overview', label: 'Contact' },
            { key: 'feedback', label: `Evaluations (${feedbackList.length})` },
            { key: 'radar', label: 'Radar' },
            { key: 'timeline', label: `Timeline (${activityLogs.length})` },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabItemText, activeTab === t.key && styles.tabItemTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'overview' && (
        <View style={styles.tabContent}>
          <View style={styles.infoCard}>
            <Text style={styles.infoSectionTitle}>Contact Details</Text>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color="#64748B" />
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{candidate.email || 'Not provided'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#64748B" />
              <Text style={styles.infoLabel}>Phone:</Text>
              <Text style={styles.infoValue}>{candidate.phone || 'Not provided'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color="#0D9488" />
              <Text style={styles.infoLabel}>Interview:</Text>
              <Text style={styles.infoValue}>
                {candidate.interview_date
                  ? `${candidate.interview_date} ${candidate.interview_time || ''}`
                  : 'Not scheduled yet'}
              </Text>
            </View>
            {candidate.resume_url ? (
              <Pressable style={styles.resumeBtn} onPress={() => openResume(candidate.resume_url)}>
                <Ionicons name="document-attach-outline" size={18} color="#2563EB" />
                <Text style={styles.resumeBtnText}>Open Resume / Portfolio Link</Text>
                <Ionicons name="open-outline" size={14} color="#2563EB" style={{ marginLeft: 'auto' }} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      {activeTab === 'feedback' && (
        <View style={styles.tabContent}>
          {feedbackList.length === 0 ? (
            <View style={styles.emptySubCard}>
              <Ionicons name="chatbubbles-outline" size={36} color="#94A3B8" />
              <Text style={styles.emptySubTitle}>No feedback submitted yet</Text>
              <Text style={styles.emptySubText}>
                When panel interviewers evaluate this candidate, their verdicts, scores, and structured notes will appear here.
              </Text>
            </View>
          ) : (
            feedbackList.map((fb) => {
              const verdictCfg = VERDICT_CONFIG[fb.overall_verdict] || VERDICT_CONFIG.maybe;
              const interviewerName = fb.profiles?.name || 'Interviewer';
              const stageName = fb.stages?.name || 'Interview Round';

              let fbTotal = 0;
              let fbCount = 0;
              (fb.feedback_scores || []).forEach((sc: any) => {
                fbTotal += sc.score;
                fbCount++;
              });
              const fbAvg = fbCount > 0 ? (fbTotal / fbCount).toFixed(1) : null;

              return (
                <View key={fb.id} style={styles.fbCard}>
                  <View style={styles.fbHeader}>
                    <View style={styles.fbHeaderLeft}>
                      <Text style={styles.fbInterviewer}>{interviewerName}</Text>
                      <Text style={styles.fbStageText}>{stageName}</Text>
                    </View>
                    <View style={styles.fbHeaderRight}>
                      {fbAvg && (
                        <View style={styles.fbAvgBadge}>
                          <Ionicons name="star" size={12} color="#F59E0B" />
                          <Text style={styles.fbAvgText}>{fbAvg}/5</Text>
                        </View>
                      )}
                      <View style={[styles.verdictBadge, { backgroundColor: verdictCfg.bg }]}>
                        <Ionicons name={verdictCfg.icon as any} size={14} color={verdictCfg.text} />
                        <Text style={[styles.verdictText, { color: verdictCfg.text }]}>{verdictCfg.label}</Text>
                      </View>
                    </View>
                  </View>

                  {fb.feedback_scores && fb.feedback_scores.length > 0 && (
                    <View style={styles.fbScoresContainer}>
                      <Text style={styles.subHeading}>Criteria Scores</Text>
                      {fb.feedback_scores.map((sc: any) => (
                        <View key={sc.id} style={styles.scoreRow}>
                          <Text style={styles.criterionName} numberOfLines={1}>
                            {sc.criteria?.name || 'Criterion'}
                          </Text>
                          <View style={styles.starsWrap}>
                            <Ionicons name="star" size={13} color="#F59E0B" />
                            <Text style={styles.scoreNumber}>{sc.score}/5</Text>
                          </View>
                          {sc.note ? <Text style={styles.scoreNoteText}>{sc.note}</Text> : null}
                        </View>
                      ))}
                    </View>
                  )}

                  {fb.positives ? (
                    <View style={styles.noteSection}>
                      <Text style={styles.noteLabel}>✅ Key Strengths & Positives</Text>
                      <Text style={styles.noteBody}>{fb.positives}</Text>
                    </View>
                  ) : null}

                  {fb.concerns ? (
                    <View style={styles.noteSection}>
                      <Text style={styles.noteLabel}>⚠️ Concerns & Risks</Text>
                      <Text style={styles.noteBody}>{fb.concerns}</Text>
                    </View>
                  ) : null}

                  {fb.questions ? (
                    <View style={styles.noteSection}>
                      <Text style={styles.noteLabel}>❓ Follow-up Questions</Text>
                      <Text style={styles.noteBody}>{fb.questions}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}

      {activeTab === 'radar' && (
        <View style={styles.tabContent}>
          {radarData.labels.length === 0 || radarData.series.length === 0 ? (
            <View style={styles.emptySubCard}>
              <Ionicons name="analytics-outline" size={36} color="#94A3B8" />
              <Text style={styles.emptySubTitle}>No Radar Data Available</Text>
              <Text style={styles.emptySubText}>
                Radar visualization requires evaluation criteria and at least one submitted interviewer score.
              </Text>
            </View>
          ) : (
            <View style={styles.radarCard}>
              <Text style={styles.radarTitle}>Competency Comparison Radar</Text>
              <Text style={styles.radarSubtitle}>
                Overlaying scores from all {radarData.series.length} reviewer(s)
              </Text>
              <RadarChart criteriaLabels={radarData.labels} series={radarData.series} size={300} />
            </View>
          )}
        </View>
      )}

      {activeTab === 'timeline' && (
        <View style={styles.tabContent}>
          {activityLogs.length === 0 ? (
            <View style={styles.emptySubCard}>
              <Ionicons name="time-outline" size={36} color="#94A3B8" />
              <Text style={styles.emptySubTitle}>No Activity Recorded</Text>
            </View>
          ) : (
            <View style={styles.timelineCard}>
              {activityLogs.map((log, idx) => {
                const isLast = idx === activityLogs.length - 1;
                let title = log.action;
                let desc = '';
                let color = '#2563EB';

                if (log.action === 'candidate_added') {
                  title = 'Candidate Added';
                  desc = 'Created in pipeline';
                  color = '#2563EB';
                } else if (log.action === 'stage_moved') {
                  title = `Stage Moved: ${log.metadata?.stage_name || 'Advanced'}`;
                  desc = `Updated by ${log.profiles?.name || 'Hiring Manager'}`;
                  color = '#0D9488';
                } else if (log.action === 'feedback_submitted') {
                  title = 'Feedback Submitted';
                  desc = `Submitted by ${log.profiles?.name || 'Interviewer'}`;
                  color = '#7C3AED';
                } else if (log.action === 'marked_hire') {
                  title = 'Candidate Marked as Hired 🎉';
                  desc = log.metadata?.decision_note || 'Offer extended';
                  color = '#16A34A';
                } else if (log.action === 'marked_reject') {
                  title = 'Candidate Rejected';
                  desc = log.metadata?.decision_note || 'Application closed';
                  color = '#DC2626';
                }

                return (
                  <View key={log.id} style={styles.timelineRow}>
                    <View style={styles.timelineCol}>
                      <View style={[styles.timelineDot, { backgroundColor: color }]} />
                      {!isLast && <View style={styles.timelineBar} />}
                    </View>
                    <View style={styles.timelineBody}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineActionTitle}>{title}</Text>
                        <Text style={styles.timelineDate}>{new Date(log.created_at).toLocaleDateString()}</Text>
                      </View>
                      {desc ? <Text style={styles.timelineActionDesc}>{desc}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  contentContainer: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748B' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 12 },
  backButton: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#2563EB', borderRadius: 8 },
  backButtonText: { color: '#FFFFFF', fontWeight: '600' },
  topNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBackBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  navTitle: { flex: 1, marginHorizontal: 12, fontSize: 16, fontWeight: '700', color: '#0F172A' },
  navActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  navEditText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  navDeleteBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' },
  fbHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fbAvgBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  fbAvgText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  heroCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#1E40AF' },
  heroInfo: { flex: 1, marginRight: 8 },
  candidateName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  candidateRole: { fontSize: 13, color: '#64748B', marginTop: 1 },
  jobBadgeText: { fontSize: 12, color: '#334155', marginTop: 3 },
  decisionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  decisionBadgeText: { fontSize: 11, fontWeight: '800' },
  stageProgressBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginTop: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  stageProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  stageProgressTitle: { fontSize: 11, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' },
  stageProgressStep: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  stageNameHighlight: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  metricCard: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  metricVal: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  metricLbl: { fontSize: 11, color: '#64748B', marginTop: 2 },
  decisionActionsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  decisionActionsTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },
  actionsBtnGroup: { gap: 10 },
  advanceBtn: { backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8 },
  advanceBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  finalDecisionRow: { flexDirection: 'row', gap: 10 },
  hireBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DCFCE7', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0' },
  hireBtnText: { fontSize: 13, fontWeight: '700', color: '#15803D' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEE2E2', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  actionBtnActive: { opacity: 0.6 },
  tabsRow: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 10, padding: 3, marginBottom: 14 },
  tabItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabItemActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  tabItemText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  tabItemTextActive: { color: '#2563EB', fontWeight: '700' },
  tabContent: { gap: 12 },
  infoCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  infoSectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', width: 70 },
  infoValue: { fontSize: 13, color: '#0F172A', flex: 1 },
  resumeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12, marginTop: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  resumeBtnText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  emptySubCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptySubTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 10 },
  emptySubText: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4, lineHeight: 18 },
  fbCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  fbHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  fbHeaderLeft: { flex: 1 },
  fbInterviewer: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  fbStageText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  verdictText: { fontSize: 12, fontWeight: '700' },
  fbScoresContainer: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, gap: 6 },
  subHeading: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  criterionName: { fontSize: 13, color: '#334155', flex: 1 },
  starsWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scoreNumber: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  scoreNoteText: { fontSize: 11, color: '#64748B', fontStyle: 'italic', marginTop: 2 },
  noteSection: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10 },
  noteLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4 },
  noteBody: { fontSize: 13, color: '#475569', lineHeight: 18 },
  radarCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  radarTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  radarSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 16 },
  timelineCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  timelineRow: { flexDirection: 'row', marginBottom: 16 },
  timelineCol: { alignItems: 'center', marginRight: 12, width: 20 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineBar: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginTop: 4 },
  timelineBody: { flex: 1 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineActionTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  timelineDate: { fontSize: 11, color: '#94A3B8' },
  timelineActionDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
