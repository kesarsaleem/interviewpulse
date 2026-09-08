import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';

export default function JobDetail() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const params = useLocalSearchParams();
  const id = params.id as string;

  const [job, setJob] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [interviewers, setInterviewers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'candidates' | 'stages' | 'criteria' | 'panel'>('candidates');

  const loadJob = useCallback(async () => {
    if (!id) {
      Alert.alert('Error', 'Job ID is missing');
      return;
    }

    try {
      // 1. Fetch Job + Stages + Criteria
      const { data: jobData, error: jobErr } = await supabase
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
          )
        `
        )
        .eq('id', id)
        .single();

      if (jobErr) throw jobErr;
      setJob(jobData);

      // 2. Fetch Candidates for this job
      const { data: candData, error: candErr } = await supabase
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
        .eq('job_id', id)
        .order('created_at', { ascending: false });

      if (candErr) console.warn('Candidates fetch error:', candErr);
      setCandidates(candData || []);

      // 3. Fetch Assigned Interviewers
      const { data: panelData, error: panelErr } = await supabase
        .from('job_interviewers')
        .select(
          `
          id,
          job_id,
          user_id,
          invited_email,
          status,
          created_at,
          profiles (
            id,
            name,
            email,
            avatar_url
          )
        `
        )
        .eq('job_id', id);

      if (panelErr) console.warn('Panel fetch error:', panelErr);
      setInterviewers(panelData || []);
    } catch (err: any) {
      console.warn('Error loading job details:', err);
      Alert.alert('Error', err.message || 'Failed to load job details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  useFocusEffect(
    useCallback(() => {
      loadJob();
    }, [loadJob])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadJob();
  };

  const updateStatus = async (newStatus: 'open' | 'closed' | 'archived') => {
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      Alert.alert('Status Updated', `Job status set to ${newStatus}`);
      await loadJob();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update job status');
    } finally {
      setUpdating(false);
    }
  };

  const removePanelMember = (panelId: string, name: string) => {
    Alert.alert(
      'Remove Interviewer',
      `Are you sure you want to remove ${name} from this job panel?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('job_interviewers')
                .delete()
                .eq('id', panelId);

              if (error) throw error;
              Alert.alert('Success', 'Interviewer removed from panel');
              await loadJob();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove interviewer');
            }
          },
        },
      ]
    );
  };

  const deleteJob = () => {
    console.log('[DELETE JOB] Action initiated for job ID:', id);
    Alert.alert(
      'Delete Job Opening',
      'Are you sure you want to delete this job opening? All associated candidates, interview feedback, panel assignments, stages, and criteria will also be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('[DELETE JOB] Confirmed deletion for job ID:', id);
            try {
              setUpdating(true);

              // Step 0: Find all candidates under this job
              console.log('[DELETE JOB] Step 0: Fetching candidate IDs for job:', id);
              const { data: cands, error: candsErr } = await supabase
                .from('candidates')
                .select('id')
                .eq('job_id', id);

              if (candsErr) {
                console.error('[DELETE JOB] Error fetching candidates:', candsErr);
              }
              const candIds = (cands || []).map((c) => c.id);
              console.log('[DELETE JOB] Found candidates to clean:', candIds.length, candIds);

              let fbIds: string[] = [];
              if (candIds.length > 0) {
                const { data: fbs, error: fbsErr } = await supabase
                  .from('feedback')
                  .select('id')
                  .in('candidate_id', candIds);
                if (fbsErr) {
                  console.error('[DELETE JOB] Error fetching feedback:', fbsErr);
                }
                fbIds = (fbs || []).map((f) => f.id);
                console.log('[DELETE JOB] Found feedback records to clean:', fbIds.length, fbIds);
              }

              // 1. Delete feedback_scores
              if (fbIds.length > 0) {
                console.log('[DELETE JOB] Step 1: Deleting feedback_scores for feedback IDs:', fbIds);
                const { error: scoresErr } = await supabase
                  .from('feedback_scores')
                  .delete()
                  .in('feedback_id', fbIds);
                if (scoresErr) {
                  console.warn('[DELETE JOB] feedback_scores delete warning:', scoresErr);
                } else {
                  console.log('[DELETE JOB] Successfully deleted feedback_scores');
                }
              }

              // 2. Delete feedback
              if (candIds.length > 0) {
                console.log('[DELETE JOB] Step 2: Deleting feedback for candidate IDs:', candIds);
                const { error: fbErr } = await supabase
                  .from('feedback')
                  .delete()
                  .in('candidate_id', candIds);
                if (fbErr) {
                  console.warn('[DELETE JOB] feedback delete warning:', fbErr);
                } else {
                  console.log('[DELETE JOB] Successfully deleted feedback');
                }

                // 3. Delete activity_logs
                console.log('[DELETE JOB] Step 3: Deleting activity_logs for candidate IDs:', candIds);
                const { error: actErr } = await supabase
                  .from('activity_logs')
                  .delete()
                  .in('candidate_id', candIds);
                if (actErr) {
                  console.warn('[DELETE JOB] activity_logs delete warning:', actErr);
                } else {
                  console.log('[DELETE JOB] Successfully deleted activity_logs');
                }
              }

              // 4. Delete job_interviewers
              console.log('[DELETE JOB] Step 4: Deleting job_interviewers for job ID:', id);
              const { error: intErr } = await supabase
                .from('job_interviewers')
                .delete()
                .eq('job_id', id);
              if (intErr) {
                console.warn('[DELETE JOB] job_interviewers delete warning:', intErr);
              } else {
                console.log('[DELETE JOB] Successfully deleted job_interviewers');
              }

              // 5. Delete candidates (first null out current_stage_id to break foreign key constraint on stages)
              if (candIds.length > 0) {
                console.log('[DELETE JOB] Step 5a: Nulling current_stage_id on candidates...');
                await supabase
                  .from('candidates')
                  .update({ current_stage_id: null })
                  .in('id', candIds);

                console.log('[DELETE JOB] Step 5b: Deleting candidates for job ID:', id);
                const { error: candErr } = await supabase
                  .from('candidates')
                  .delete()
                  .in('id', candIds);
                if (candErr) {
                  console.error('[DELETE JOB] candidates delete error:', candErr);
                  throw candErr;
                } else {
                  console.log('[DELETE JOB] Successfully deleted candidates');
                }
              }

              // 6. Delete criteria
              console.log('[DELETE JOB] Step 6: Deleting criteria for job ID:', id);
              const { error: critErr } = await supabase
                .from('criteria')
                .delete()
                .eq('job_id', id);
              if (critErr) {
                console.warn('[DELETE JOB] criteria delete warning:', critErr);
              } else {
                console.log('[DELETE JOB] Successfully deleted criteria');
              }

              // 7. Delete stages
              console.log('[DELETE JOB] Step 7: Deleting stages for job ID:', id);
              const { error: stageErr } = await supabase
                .from('stages')
                .delete()
                .eq('job_id', id);
              if (stageErr) {
                console.warn('[DELETE JOB] stages delete warning:', stageErr);
              } else {
                console.log('[DELETE JOB] Successfully deleted stages');
              }

              // 8. Delete job itself
              console.log('[DELETE JOB] Step 8: Deleting job record for ID:', id);
              const { error: jobErr } = await supabase
                .from('jobs')
                .delete()
                .eq('id', id);
              if (jobErr) {
                console.error('[DELETE JOB] Final jobs table delete error:', jobErr);
                throw jobErr;
              }
              console.log('[DELETE JOB] ACTION SUCCESS: Job record deleted from Supabase');

              // Also clean local SQLite mirror
              try {
                const { getDb } = require('../../lib/sqlite/schema');
                const db = getDb();
                db.runSync('DELETE FROM jobs WHERE id = ?', [id]);
                db.runSync('DELETE FROM stages WHERE job_id = ?', [id]);
                db.runSync('DELETE FROM criteria WHERE job_id = ?', [id]);
                db.runSync('DELETE FROM candidates WHERE job_id = ?', [id]);
                console.log('[DELETE JOB] SQLite mirror cleaned successfully');
              } catch (sqlErr) {
                console.warn('[DELETE JOB] SQLite cleanup note:', sqlErr);
              }

              Alert.alert('Deleted', 'Job opening deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => {
                    router.replace('/admin/jobs');
                  },
                },
              ]);
            } catch (err: any) {
              console.error('[DELETE JOB] Supabase deletion failed:', err);
              Alert.alert('Error', err.message || 'Failed to delete job opening');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Job Details...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
        <Text style={styles.errorTitle}>Job Not Found</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back to Jobs</Text>
        </Pressable>
      </View>
    );
  }

  const sortedStages = [...(job.stages || [])].sort((a, b) => a.position - b.position);
  const sortedCriteria = [...(job.criteria || [])].sort((a, b) => a.position - b.position);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* TOP NAV BAR */}
      <View style={styles.topNav}>
        <Pressable style={styles.navBackBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {job.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            style={styles.navEditBtn}
            onPress={() =>
              router.push({
                pathname: '/admin/create-job',
                params: { jobId: job.id },
              })
            }
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.navEditText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.navDeleteBtn}
            onPress={deleteJob}
            disabled={updating}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </Pressable>
        </View>
      </View>

      {/* JOB HEADER CARD */}
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.jobTitle}>{job.title}</Text>
            <View style={styles.deptRow}>
              <Ionicons name="business-outline" size={14} color={colors.secondaryText} />
              <Text style={styles.department}>{job.department || 'General'}</Text>
            </View>
          </View>

          <View
            style={[
              styles.statusPill,
              job.status === 'open'
                ? styles.statusOpen
                : job.status === 'closed'
                ? styles.statusClosed
                : styles.statusArchived,
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                job.status === 'open'
                  ? styles.statusOpenText
                  : job.status === 'closed'
                  ? styles.statusClosedText
                  : styles.statusArchivedText,
              ]}
            >
              {job.status?.toUpperCase() || 'OPEN'}
            </Text>
          </View>
        </View>

        {job.description ? (
          <Text style={styles.description}>{job.description}</Text>
        ) : null}

        {/* METRICS ROW */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{candidates.length}</Text>
            <Text style={styles.statLabel}>Candidates</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sortedStages.length}</Text>
            <Text style={styles.statLabel}>Stages</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sortedCriteria.length}</Text>
            <Text style={styles.statLabel}>Criteria</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{interviewers.length}</Text>
            <Text style={styles.statLabel}>Panel</Text>
          </View>
        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.quickActionRow}>
          <Pressable
            style={styles.primaryActionBtn}
            onPress={() =>
              router.push({
                pathname: '/admin/add-candidate',
                params: { jobId: job.id },
              })
            }
          >
            <Ionicons name="person-add" size={15} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>Add Candidate</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryActionBtn}
            onPress={() =>
              router.push({
                pathname: '/admin/assign-interviewer',
                params: { jobId: job.id },
              })
            }
          >
            <Ionicons name="people" size={15} color={colors.primary} />
            <Text style={styles.secondaryActionBtnText}>Assign Panel</Text>
          </Pressable>
        </View>
      </View>

      {/* JOB LIFECYCLE MANAGEMENT */}
      <View style={styles.statusManagementCard}>
        <Text style={styles.statusSectionHeading}>Job Status Actions</Text>
        <View style={styles.statusActionsRow}>
          {job.status === 'open' ? (
            <Pressable
              style={styles.statusActionBtn}
              onPress={() => updateStatus('closed')}
              disabled={updating}
            >
              <Ionicons name="lock-closed-outline" size={16} color="#D97706" />
              <Text style={[styles.statusActionText, { color: '#D97706' }]}>Close Job</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.statusActionBtn}
              onPress={() => updateStatus('open')}
              disabled={updating}
            >
              <Ionicons name="lock-open-outline" size={16} color="#16A34A" />
              <Text style={[styles.statusActionText, { color: '#16A34A' }]}>Reopen Job</Text>
            </Pressable>
          )}

          {job.status !== 'archived' && (
            <Pressable
              style={styles.statusActionBtn}
              onPress={() => updateStatus('archived')}
              disabled={updating}
            >
              <Ionicons name="archive-outline" size={16} color={colors.secondaryText} />
              <Text style={[styles.statusActionText, { color: colors.secondaryText }]}>Archive</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.statusActionBtn}
            onPress={deleteJob}
            disabled={updating}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={[styles.statusActionText, { color: '#DC2626' }]}>Delete</Text>
          </Pressable>
        </View>
      </View>

      {/* NAVIGATION TABS */}
      <View style={styles.tabsRow}>
        {(
          [
            { key: 'candidates', label: `Candidates (${candidates.length})` },
            { key: 'stages', label: `Stages (${sortedStages.length})` },
            { key: 'criteria', label: `Criteria (${sortedCriteria.length})` },
            { key: 'panel', label: `Panel (${interviewers.length})` },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text
              style={[styles.tabItemText, activeTab === t.key && styles.tabItemTextActive]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* TAB CONTENT: CANDIDATES */}
      {activeTab === 'candidates' && (
        <View style={styles.tabContent}>
          {candidates.length === 0 ? (
            <View style={styles.emptySubCard}>
              <Ionicons name="people-outline" size={32} color={colors.mutedText} />
              <Text style={styles.emptySubTitle}>No candidates in this pipeline yet</Text>
              <Pressable
                style={styles.emptySubBtn}
                onPress={() =>
                  router.push({
                    pathname: '/admin/add-candidate',
                    params: { jobId: job.id },
                  })
                }
              >
                <Text style={styles.emptySubBtnText}>Add First Candidate</Text>
              </Pressable>
            </View>
          ) : (
            candidates.map((cand) => (
              <Pressable
                key={cand.id}
                style={styles.candidateCard}
                onPress={() =>
                  router.push({
                    pathname: '/admin/candidate-detail',
                    params: { id: cand.id },
                  })
                }
              >
                <View style={styles.candidateAvatar}>
                  <Text style={styles.candidateAvatarText}>
                    {cand.full_name?.charAt(0) || 'C'}
                  </Text>
                </View>

                <View style={styles.candidateInfo}>
                  <Text style={styles.candName}>{cand.full_name}</Text>
                  <Text style={styles.candRole}>
                    {cand.current_role || 'Candidate'}
                    {cand.current_company ? ` • ${cand.current_company}` : ''}
                  </Text>
                  <View style={styles.candMeta}>
                    <View style={styles.candStageBadge}>
                      <Ionicons name="git-branch-outline" size={11} color={colors.primary} />
                      <Text style={styles.candStageText}>
                        {cand.stages?.name || 'Interview Stage'}
                      </Text>
                    </View>
                    {cand.interview_date ? (
                      <Text style={styles.candDateText}>
                        📅 {cand.interview_date} {cand.interview_time || ''}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* TAB CONTENT: STAGES */}
      {activeTab === 'stages' && (
        <View style={styles.tabContent}>
          {sortedStages.map((stage, idx) => (
            <View key={stage.id || idx} style={styles.pipelineStageCard}>
              <View style={styles.stageOrderCircle}>
                <Text style={styles.stageOrderNum}>{idx + 1}</Text>
              </View>
              <View style={styles.stageCardInfo}>
                <Text style={styles.stageCardName}>{stage.name}</Text>
                <Text style={styles.stageCardPosition}>Position: Round {idx + 1}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* TAB CONTENT: CRITERIA */}
      {activeTab === 'criteria' && (
        <View style={styles.tabContent}>
          {sortedCriteria.map((item, idx) => (
            <View key={item.id || idx} style={styles.criterionCard}>
              <Ionicons name="star" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.criterionTitle}>{item.name}</Text>
                <Text style={styles.criterionSub}>0–5 Star Rating with notes</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* TAB CONTENT: PANEL */}
      {activeTab === 'panel' && (
        <View style={styles.tabContent}>
          {interviewers.length === 0 ? (
            <View style={styles.emptySubCard}>
              <Ionicons name="shield-outline" size={32} color={colors.mutedText} />
              <Text style={styles.emptySubTitle}>No interviewers assigned to this panel</Text>
              <Pressable
                style={styles.emptySubBtn}
                onPress={() =>
                  router.push({
                    pathname: '/admin/assign-interviewer',
                    params: { jobId: job.id },
                  })
                }
              >
                <Text style={styles.emptySubBtnText}>Assign Interviewers</Text>
              </Pressable>
            </View>
          ) : (
            interviewers.map((item) => {
              const profile = item.profiles;
              const displayName = profile?.name || item.invited_email;
              const displayEmail = profile?.email || item.invited_email;

              return (
                <View key={item.id} style={styles.interviewerCard}>
                  <View style={styles.interviewerAvatar}>
                    <Text style={styles.interviewerAvatarText}>
                      {displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.interviewerInfo}>
                    <Text style={styles.interviewerName}>{displayName}</Text>
                    <Text style={styles.interviewerEmail}>{displayEmail}</Text>
                    <View style={styles.interviewerBadgeRow}>
                      <View style={styles.interviewerStatusBadge}>
                        <Text style={styles.interviewerStatusText}>
                          {item.status?.toUpperCase() || 'INVITED'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    style={styles.removePanelBtn}
                    onPress={() => removePanelMember(item.id, displayName)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.secondaryText,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  navTitle: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  navEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  navEditText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  navDeleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
    marginRight: 10,
  },
  jobTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  department: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusOpen: {
    backgroundColor: colors.successLight,
  },
  statusClosed: {
    backgroundColor: colors.divider,
  },
  statusArchived: {
    backgroundColor: colors.dangerLight,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusOpenText: {
    color: colors.success,
  },
  statusClosedText: {
    color: colors.secondaryText,
  },
  statusArchivedText: {
    color: colors.danger,
  },
  description: {
    fontSize: 13,
    color: colors.secondaryText,
    marginTop: 12,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '500',
    marginTop: 2,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryActionBtn: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  statusManagementCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statusSectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  statusActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 8,
    borderRadius: 6,
  },
  statusActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBorder,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: colors.card,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  tabItemTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabContent: {
    gap: 10,
  },
  emptySubCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptySubTitle: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubBtn: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  emptySubBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  candidateCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  candidateAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  candidateAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  candidateInfo: {
    flex: 1,
  },
  candName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  candRole: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 1,
  },
  candMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  candStageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  candStageText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  candDateText: {
    fontSize: 11,
    color: colors.secondaryText,
  },
  pipelineStageCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stageOrderCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stageOrderNum: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  stageCardInfo: {
    flex: 1,
  },
  stageCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  stageCardPosition: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
  },
  criterionCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  criterionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  criterionSub: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
  },
  interviewerCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  interviewerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  interviewerAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6D28D9',
  },
  interviewerInfo: {
    flex: 1,
  },
  interviewerName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  interviewerEmail: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  interviewerBadgeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  interviewerStatusBadge: {
    backgroundColor: colors.divider,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  interviewerStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  removePanelBtn: {
    padding: 6,
  },
});
