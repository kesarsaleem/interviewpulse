import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';

import { feedbackFormSchema, FeedbackFormValues } from '../../schemas/feedbackSchema';
import {
  submitFeedback,
  updateFeedback,
  isFeedbackEditable,
  getLocalFeedbackDetails,
} from '../../services/feedbackService';
import { useAuth } from '../../hooks/useAuth';
import { useCandidate } from '../../hooks/useCandidate';
import { useCriteria } from '../../hooks/useCriteria';
import { getDb } from '../../lib/sqlite/schema';
import { supabase } from '../../lib/supabase/client';
import { runSync } from '../../lib/sync/syncEngine';
import { StarRating } from '../../components/feedback/StarRating';

export default function FeedbackFormScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const params = useLocalSearchParams<{
    candidateId: string;
    stageId?: string;
    feedbackId?: string;
  }>();

  const candidateId = params.candidateId;
  const { user } = useAuth();

  const { data: onlineCandidate, isLoading: candidateLoading } = useCandidate(candidateId);

  // Local fallback for candidate if offline
  const candidate = useMemo(() => {
    if (onlineCandidate) return onlineCandidate;
    if (!candidateId) return null;
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
  }, [onlineCandidate, candidateId]);

  const effectiveStageId = params.stageId || candidate?.current_stage_id || '';

  const { data: onlineCriteria = [] } = useCriteria(candidate?.job_id);

  // Local fallback for criteria
  const criteria = useMemo(() => {
    if (onlineCriteria && onlineCriteria.length > 0) return onlineCriteria;
    if (!candidate?.job_id) return [];
    const db = getDb();
    return db.getAllSync<any>(
      `SELECT * FROM criteria WHERE job_id = ? ORDER BY position ASC`,
      [candidate.job_id]
    );
  }, [onlineCriteria, candidate?.job_id]);

  const [submitting, setSubmitting] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [scoresInitialized, setScoresInitialized] = useState(false);

  // Check for existing feedback (for editing / lock enforcement)
  useEffect(() => {
    if (!candidateId || !user?.id) return;
    const db = getDb();
    const fb = db.getFirstSync<any>(
      `SELECT * FROM feedback WHERE (id = ? OR (candidate_id = ? AND stage_id = ? AND interviewer_id = ?))`,
      [params.feedbackId || '', candidateId, effectiveStageId, user.id]
    );
    if (fb) {
      setExistingFeedback(fb);
      const editable = isFeedbackEditable(fb);
      setIsLocked(!editable);
    }
  }, [candidateId, effectiveStageId, user?.id, params.feedbackId]);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      overall_verdict: undefined,
      scores: [],
      positives: '',
      concerns: '',
      questions: '',
      duration_minutes: 45,
      interview_mode: 'video',
      would_hire_solo: undefined,
    },
  });

  // Populate form when criteria load or when existing feedback is found
  useEffect(() => {
    if (criteria.length > 0 && !scoresInitialized) {
      if (existingFeedback) {
        // Load existing scores
        const db = getDb();
        const existingScores = db.getAllSync<any>(
          `SELECT * FROM feedback_scores WHERE feedback_id = ?`,
          [existingFeedback.id]
        );
        const mappedScores = criteria.map((c) => {
          const found = existingScores.find((s) => s.criterion_id === c.id);
          return {
            criterion_id: c.id,
            score: found ? found.score : 0,
            note: found?.note || '',
          };
        });

        reset({
          overall_verdict: existingFeedback.overall_verdict,
          scores: mappedScores,
          positives: existingFeedback.positives || '',
          concerns: existingFeedback.concerns || '',
          questions: existingFeedback.questions || '',
          duration_minutes: existingFeedback.duration_minutes || 45,
          interview_mode: existingFeedback.interview_mode || 'video',
          would_hire_solo: Boolean(existingFeedback.would_hire_solo),
        });
      } else {
        const initialScores = criteria.map((c) => ({
          criterion_id: c.id,
          score: 0,
          note: '',
        }));
        setValue('scores', initialScores);
      }
      setScoresInitialized(true);
    }
  }, [criteria, existingFeedback, scoresInitialized, reset, setValue]);

  const verdict = watch('overall_verdict');
  const mode = watch('interview_mode');
  const hireSolo = watch('would_hire_solo');
  const scores = watch('scores') || [];

  const onSubmit = handleSubmit(
    async (values) => {
      if (!user?.id || !candidateId || !effectiveStageId) {
        Alert.alert('Error', 'Missing interview session information');
        return;
      }

      if (isLocked) {
        Alert.alert('Locked', 'This feedback was submitted over 1 hour ago and is read only.');
        return;
      }

      // 1. Validation before submit:
      // If any criteria has score 0 or missing: show error: "Please rate all criteria"
      if (criteria && criteria.length > 0) {
        const unratedCriterion = criteria.some((c: any) => {
          const matching = (values.scores || []).find((s) => s.criterion_id === c.id);
          return !matching || !matching.score || matching.score <= 0;
        });

        if (unratedCriterion) {
          Alert.alert('Incomplete Rating', 'Please rate all criteria');
          return;
        }
      }

      try {
        setSubmitting(true);

        const ONE_HOUR_MS = 60 * 60 * 1000;
        const now = new Date();
        const submittedAt = now.toISOString();
        const editableUntil = new Date(now.getTime() + ONE_HOUR_MS).toISOString();

        let insertedFeedbackId = existingFeedback?.id;
        let onlineSuccess = false;

        const feedbackPayload = {
          candidate_id: candidateId,
          stage_id: effectiveStageId,
          interviewer_id: user.id,
          overall_verdict: values.overall_verdict,
          positives: values.positives,
          concerns: values.concerns,
          questions: values.questions,
          duration_minutes: values.duration_minutes,
          interview_mode: values.interview_mode ?? 'video',
          would_hire_solo: values.would_hire_solo,
          submitted_at: submittedAt,
          editable_until: editableUntil,
          updated_at: submittedAt,
        };

        try {
          if (existingFeedback?.id) {
            const { error: updErr } = await supabase
              .from('feedback')
              .update(feedbackPayload)
              .eq('id', existingFeedback.id);
            if (updErr) console.warn('Supabase feedback update warning:', updErr);
            insertedFeedbackId = existingFeedback.id;
          } else {
            const { data: fbData, error: fbErr } = await supabase
              .from('feedback')
              .insert(feedbackPayload)
              .select('id')
              .single();

            if (fbErr) {
              console.error('Supabase feedback insert error:', fbErr);
            } else if (fbData) {
              insertedFeedbackId = fbData.id;
              console.log('FEEDBACK CREATED', fbData.id);
            }
          }

          if (insertedFeedbackId) {
            const scoreRows = values.scores.map((score) => ({
              feedback_id: insertedFeedbackId,
              criterion_id: score.criterion_id,
              score: score.score,
              note: score.note || null,
            }));

            console.log('SCORE ROWS', scoreRows);

            if (existingFeedback?.id) {
              await supabase.from('feedback_scores').delete().eq('feedback_id', insertedFeedbackId);
            }

            const { error: scoresErr } = await supabase
              .from('feedback_scores')
              .insert(scoreRows);

            console.log('SCORES INSERT RESULT', scoresErr);

            // Verify after submit:
            const { data: testScores } = await supabase
              .from('feedback_scores')
              .select('*')
              .eq('feedback_id', insertedFeedbackId);

            console.log('VERIFIED SCORES IN SUPABASE:', testScores);

            if (!scoresErr) {
              onlineSuccess = true;
            }
          }
        } catch (netErr) {
          console.warn('Network exception during Supabase submit:', netErr);
        }

        // Also save locally in SQLite table
        if (existingFeedback) {
          updateFeedback({
            feedbackId: existingFeedback.id,
            candidateId,
            stageId: effectiveStageId,
            interviewerId: user.id,
            values,
          });
        } else {
          submitFeedback({
            candidateId,
            stageId: effectiveStageId,
            interviewerId: user.id,
            values,
            customId: insertedFeedbackId,
            isSynced: onlineSuccess,
          });
        }

        if (!onlineSuccess) {
          runSync(user.id).catch(() => {});
        }

        Alert.alert(
          'Feedback Submitted',
          onlineSuccess
            ? 'Your feedback and criteria ratings have been saved successfully.'
            : 'Your feedback and criteria ratings have been saved offline and will sync automatically.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/interviewer'),
            },
          ]
        );
      } catch (error: any) {
        Alert.alert('Submission Error', error?.message || 'Failed to save feedback');
      } finally {
        setSubmitting(false);
      }
    },
    (formErrors) => {
      console.log('Form validation errors:', formErrors);
      Alert.alert(
        'Incomplete Feedback',
        'Please review the highlighted fields before submitting.'
      );
    }
  );

  if (candidateLoading && !candidate) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading interview details...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* TOP BAR */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {existingFeedback ? 'Edit Feedback' : 'Interview Feedback'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {candidate?.full_name || 'Candidate evaluation'}
          </Text>
        </View>

        {isLocked && (
          <View style={styles.lockedHeaderBadge}>
            <Ionicons name="lock-closed" size={13} color="#fff" />
            <Text style={styles.lockedHeaderText}>Locked</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* LOCK NOTICE IF > 1 HOUR */}
        {isLocked && (
          <View style={styles.lockNoticeBanner}>
            <Ionicons name="lock-closed" size={20} color="#DC2626" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.lockNoticeTitle}>Feedback Locked (Read Only)</Text>
              <Text style={styles.lockNoticeText}>
                Interviewer feedback can only be edited within 1 hour after submission. This evaluation is now final.
              </Text>
            </View>
          </View>
        )}

        {/* 1-HOUR EDIT NOTICE IF STILL EDITABLE */}
        {!isLocked && existingFeedback && (
          <View style={styles.editWindowBanner}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.editWindowTitle}>Editing Mode</Text>
              <Text style={styles.editWindowText}>
                You can make changes to this feedback within 1 hour of initial submission.
              </Text>
            </View>
          </View>
        )}

        {/* CANDIDATE SUMMARY CARD */}
        <View style={styles.candidateCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {candidate?.full_name?.charAt(0)?.toUpperCase() || 'C'}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.candidateName}>{candidate?.full_name || 'Candidate'}</Text>
            <Text style={styles.subText}>
              {candidate?.current_role || 'Applicant'}
              {candidate?.current_company ? ` at ${candidate.current_company}` : ''}
            </Text>
            <Text style={styles.jobBadgeText}>
              💼 {candidate?.jobs?.title || 'Job Opening'} • {candidate?.stages?.name || 'Interview Round'}
            </Text>
          </View>
        </View>

        {/* SECTION A: OVERALL VERDICT */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>A. Overall Impression</Text>
            <Text style={styles.requiredStar}>* Required</Text>
          </View>

          <View style={styles.verdictRow}>
            {[
              { label: 'Strong Yes', value: 'strong_yes', emoji: '😊', color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Maybe', value: 'maybe', emoji: '😐', color: '#D97706', bg: '#FFFBEB' },
              { label: 'No', value: 'no', emoji: '☹️', color: '#DC2626', bg: '#FEF2F2' },
            ].map((item) => {
              const selected = verdict === item.value;
              return (
                <Pressable
                  key={item.value}
                  disabled={isLocked}
                  onPress={() => setValue('overall_verdict', item.value as any, { shouldValidate: true })}
                  style={[
                    styles.verdictCard,
                    selected && {
                      borderColor: item.color,
                      backgroundColor: item.bg,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <Text style={styles.verdictEmoji}>{item.emoji}</Text>
                  <Text style={[styles.verdictLabel, { color: selected ? item.color : colors.secondaryText }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.overall_verdict && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{errors.overall_verdict.message}</Text>
            </View>
          )}
        </View>

        {/* SECTION B: DYNAMIC CRITERIA RATING */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>B. Criteria Rating (0-5 Stars)</Text>
            <Text style={styles.requiredStar}>* Required</Text>
          </View>
          <Text style={styles.sectionHelp}>
            Rate the candidate on each job-specific criterion. Add optional notes to provide context.
          </Text>

          {criteria.length === 0 ? (
            <Text style={styles.noCriteriaText}>No criteria defined for this job opening.</Text>
          ) : (
            criteria.map((item, index) => {
              const currentScore = scores[index]?.score ?? 0;

              return (
                <View key={item.id} style={styles.criteriaBlock}>
                  <View style={styles.criteriaHeader}>
                    <Text style={styles.criteriaName}>{item.name}</Text>
                    <Text style={styles.scoreNumberText}>{currentScore} / 5</Text>
                  </View>

                  {/* 0-5 Star Rating */}
                  <View style={styles.starRow}>
                    <StarRating
                      value={currentScore}
                      onChange={(newScore) => {
                        if (!isLocked) {
                          setValue(`scores.${index}.score`, newScore, { shouldValidate: true });
                          setValue(`scores.${index}.criterion_id`, item.id);
                        }
                      }}
                      label={item.name}
                    />
                  </View>

                  {/* Optional Note for Criterion */}
                  <Controller
                    control={control}
                    name={`scores.${index}.note`}
                    render={({ field: { value, onChange } }) => (
                      <TextInput
                        value={value || ''}
                        onChangeText={onChange}
                        placeholder={`Optional notes for ${item.name}...`}
                        placeholderTextColor={colors.mutedText}
                        editable={!isLocked}
                        style={styles.criterionNoteInput}
                      />
                    )}
                  />
                </View>
              );
            })
          )}
          {errors.scores && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>Please rate the criteria above.</Text>
            </View>
          )}
        </View>

        {/* SECTION C: STRUCTURED FEEDBACK */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>C. Structured Feedback</Text>
            <Text style={styles.requiredStar}>* Min 10 chars each</Text>
          </View>

          {/* Positives */}
          <FormField
            control={control}
            name="positives"
            label="✓ Positives & Strengths *"
            placeholder="What stood out positively about the candidate? (Min 10 characters)"
            error={errors.positives?.message}
            editable={!isLocked}
          />

          {/* Concerns */}
          <FormField
            control={control}
            name="concerns"
            label="⚠ Concerns & Gaps *"
            placeholder="What concerns, gaps, or areas of development did you observe? (Min 10 characters)"
            error={errors.concerns?.message}
            editable={!isLocked}
          />

          {/* Questions for Next Round */}
          <FormField
            control={control}
            name="questions"
            label="? Questions for Next Round *"
            placeholder="What specific questions or topics should the next interviewer probe? (Min 10 characters)"
            error={errors.questions?.message}
            editable={!isLocked}
          />
        </View>

        {/* SECTION D: QUICK DETAILS */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>D. Quick Details</Text>

          {/* Duration */}
          <Text style={styles.inputLabel}>Duration (minutes) *</Text>
          <Controller
            control={control}
            name="duration_minutes"
            render={({ field: { value, onChange } }) => (
              <TextInput
                keyboardType="numeric"
                value={value ? String(value) : ''}
                onChangeText={(v) => onChange(v ? parseInt(v, 10) || 0 : 0)}
                placeholder="45"
                placeholderTextColor={colors.mutedText}
                editable={!isLocked}
                style={styles.numericInput}
              />
            )}
          />
          {errors.duration_minutes && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{errors.duration_minutes.message}</Text>
            </View>
          )}

          {/* Interview Mode */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>Interview Mode *</Text>
          <View style={styles.modeRow}>
            {[
              { id: 'video', label: '🎥 Video' },
              { id: 'phone', label: '📞 Phone' },
              { id: 'onsite', label: '🏢 Onsite' },
            ].map((m) => {
              const active = mode === m.id;
              return (
                <Pressable
                  key={m.id}
                  disabled={isLocked}
                  onPress={() => setValue('interview_mode', m.id as any, { shouldValidate: true })}
                  style={[styles.modeBtn, active && styles.activeModeBtn]}
                >
                  <Text style={[styles.modeBtnText, active && styles.activeModeBtnText]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.interview_mode && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{errors.interview_mode.message}</Text>
            </View>
          )}

          {/* Would hire solo */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>
            Would you hire them if you were the solo decision maker? *
          </Text>
          <View style={styles.modeRow}>
            <Pressable
              disabled={isLocked}
              onPress={() => setValue('would_hire_solo', true, { shouldValidate: true })}
              style={[styles.modeBtn, hireSolo === true && styles.activeYesBtn]}
            >
              <Text style={[styles.modeBtnText, hireSolo === true && styles.activeYesBtnText]}>
                👍 Yes
              </Text>
            </Pressable>

            <Pressable
              disabled={isLocked}
              onPress={() => setValue('would_hire_solo', false, { shouldValidate: true })}
              style={[styles.modeBtn, hireSolo === false && styles.activeNoBtn]}
            >
              <Text style={[styles.modeBtnText, hireSolo === false && styles.activeNoBtnText]}>
                👎 No
              </Text>
            </Pressable>
          </View>
          {errors.would_hire_solo && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{errors.would_hire_solo.message}</Text>
            </View>
          )}
        </View>

        {/* SUBMIT BUTTON */}
        {!isLocked ? (
          <Pressable
            style={[styles.submitBtn, submitting && styles.disabledBtn]}
            onPress={onSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark-done" size={20} color="#fff" />
            )}
            <Text style={styles.submitText}>
              {submitting
                ? 'Saving Feedback...'
                : existingFeedback
                ? 'Update Feedback'
                : 'Submit Feedback'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.lockedFooter}>
            <Ionicons name="lock-closed" size={18} color={colors.secondaryText} />
            <Text style={styles.lockedFooterText}>
              Feedback is locked. The 1-hour editing window has expired.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FormField({
  control,
  name,
  label,
  placeholder,
  error,
  editable,
}: {
  control: any;
  name: string;
  label: string;
  placeholder: string;
  error?: string;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.formGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { value, onChange } }) => (
          <TextInput
            value={value || ''}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedText}
            multiline
            numberOfLines={4}
            editable={editable}
            style={[styles.textArea, error ? styles.inputErrorBorder : null]}
          />
        )}
      />
      {error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
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
  backBtn: {
    marginRight: 12,
    padding: 4,
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
  lockedHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  lockedHeaderText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  lockNoticeBanner: {
    flexDirection: 'row',
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  lockNoticeTitle: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 13,
  },
  lockNoticeText: {
    color: '#991B1B',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  editWindowBanner: {
    flexDirection: 'row',
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  editWindowTitle: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  editWindowText: {
    color: '#1E40AF',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  candidateCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 20,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  subText: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  jobBadgeText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  sectionHelp: {
    fontSize: 12,
    color: colors.secondaryText,
    marginBottom: 12,
    lineHeight: 16,
  },
  requiredStar: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '700',
  },
  verdictRow: {
    flexDirection: 'row',
    gap: 10,
  },
  verdictCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictEmoji: {
    fontSize: 28,
  },
  verdictLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  criteriaBlock: {
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 12,
  },
  criteriaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  criteriaName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  scoreNumberText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  starRow: {
    marginBottom: 8,
  },
  criterionNoteInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.text,
  },
  noCriteriaText: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  formGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondaryText,
    marginBottom: 6,
  },
  textArea: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputErrorBorder: {
    borderColor: colors.danger,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '600',
  },
  numericInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    width: 100,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeModeBtn: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  activeModeBtnText: {
    color: colors.primary,
    fontWeight: '800',
  },
  activeYesBtn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#16A34A',
    borderWidth: 2,
  },
  activeYesBtnText: {
    color: '#16A34A',
    fontWeight: '800',
  },
  activeNoBtn: {
    backgroundColor: colors.dangerLight,
    borderColor: '#DC2626',
    borderWidth: 2,
  },
  activeNoBtnText: {
    color: '#DC2626',
    fontWeight: '800',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  lockedFooter: {
    backgroundColor: colors.divider,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  lockedFooterText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: '600',
  },
});