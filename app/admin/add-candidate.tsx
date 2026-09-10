import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { getDb } from '../../lib/sqlite/schema';
import { enqueueMutation } from '../../lib/sync/syncEngine';
import uuid from 'react-native-uuid';
import { ROUTES } from '../../constants/routes';

const REFERRAL_SOURCES = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'referral', label: 'Employee Referral' },
  { id: 'website', label: 'Company Website' },
  { id: 'other', label: 'Other / Job Board' },
];

export default function AddOrEditCandidate() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const segments = useSegments();
  const isInterviewerRoute = segments[0] === 'interviewer';
  // The shared form is create-only on the interviewer route. Candidate
  // editing remains available only through the admin route.
  const candidateId = isInterviewerRoute
    ? undefined
    : (params.candidateId || params.id) as string | undefined;
  const initialJobId = (params.jobId as string) || '';
  const isEditing = !!candidateId;
  const isInterviewer = user?.role === 'interviewer';

  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(initialJobId);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const [referralSource, setReferralSource] = useState<string>('other');

  const [interviewDate, setInterviewDate] = useState<Date | null>(null);
  const [interviewTime, setInterviewTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  // 1. Fetch available jobs
  const fetchJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, department')
        .eq('status', 'open')
        .order('title', { ascending: true });

      if (error) throw error;
      setJobs(data || []);

      // Default select first job if none specified
      if (!selectedJobId && data && data.length > 0) {
        setSelectedJobId(data[0].id);
      }
    } catch (err: any) {
      console.warn('Fetch jobs error:', err);
    }
  }, [selectedJobId]);

  // 2. Fetch stages for selected job
  const fetchStagesForJob = useCallback(async (jobIdToFetch: string) => {
    if (!jobIdToFetch) {
      setStages([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, position')
        .eq('job_id', jobIdToFetch)
        .order('position', { ascending: true });

      if (error) throw error;
      setStages(data || []);

      if (data && data.length > 0 && !selectedStageId) {
        setSelectedStageId(data[0].id);
      }
    } catch (err: any) {
      console.warn('Fetch stages error:', err);
    }
  }, [selectedStageId]);

  // 3. Load Candidate Data for Editing
  const loadCandidateForEdit = useCallback(async () => {
    if (!candidateId) return;
    try {
      const { data: cand, error: candErr } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single();

      if (candErr) throw candErr;

      if (cand) {
        setFullName(cand.full_name || '');
        setEmail(cand.email || '');
        setPhone(cand.phone || '');
        setCurrentRole(cand.current_role || '');
        setCurrentCompany(cand.current_company || '');
        setResumeUrl(cand.resume_url || '');
        setReferralSource(cand.referral_source || 'other');
        setSelectedJobId(cand.job_id);
        setSelectedStageId(cand.current_stage_id || '');

        if (cand.interview_date) {
          const parts = cand.interview_date.split('-');
          if (parts.length === 3) {
            setInterviewDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
          }
        }

        if (cand.interview_time) {
          const d = new Date();
          const timeParts = cand.interview_time.split(':');
          if (timeParts.length >= 2) {
            d.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]));
            setInterviewTime(d);
          }
        }
      }
    } catch (err: any) {
      console.warn('Load candidate for edit error:', err);
      Alert.alert('Error', err.message || 'Failed to load candidate details');
    }
  }, [candidateId]);

  useEffect(() => {
    const init = async () => {
      setFetchingData(true);
      await Promise.all([
        fetchJobs(),
        isEditing ? loadCandidateForEdit() : Promise.resolve(),
      ]);
      setFetchingData(false);
    };
    init();
  }, [isEditing, fetchJobs, loadCandidateForEdit]);

  useEffect(() => {
    if (selectedJobId) {
      fetchStagesForJob(selectedJobId);
    }
  }, [selectedJobId, fetchStagesForJob]);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };
  /**
   * Picks a PDF and uploads it to the private `resumes` storage bucket.
   * Object paths are `{job_id}/...` because the storage RLS policies
   * (see lib/supabase/schema.sql) scope access by the job folder, so a
   * job must be selected before a resume can be attached.
   *
   * The bucket is private, so `resume_url` stores only the storage PATH
   * (not a URL). A fresh short-lived (10-minute) signed URL is generated
   * on-demand each time the resume is viewed — see openResume() in
   * candidate-detail.tsx.
   */
  const pickAndUploadResume = async () => {
    if (!selectedJobId) {
      Alert.alert(
        'Select a Job First',
        'Please choose the job opening before attaching a resume.'
      );
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];

      const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
      if (file.size && file.size > MAX_SIZE_BYTES) {
        Alert.alert('File Too Large', 'Resume PDF must be under 5MB. Please choose a smaller file.');
        return;
      }

      setUploadingResume(true);

      // Read local device files as base64 because fetch()+blob() is unreliable
      // for file:// and content:// URIs in React Native.
      const base64Data = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64Data);

      const safeName = (file.name || 'resume.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${selectedJobId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(storagePath, arrayBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Signed URL ab generate NAHI hota upload ke waqt.
      // Sirf storage PATH save hoga — signed URL view karte waqt on-demand banega.
      setResumeUrl(storagePath);
      setResumeFileName(file.name || 'resume.pdf');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload the resume PDF.');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter candidate full name');
      return;
    }

    if (email.trim() && !validateEmail(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (!selectedJobId) {
      Alert.alert('Required', 'Please select a job opening');
      return;
    }

    if (!selectedStageId) {
      Alert.alert('Required', 'Please select an interview stage');
      return;
    }

    try {
      setLoading(true);
      const currentUserId = user?.id;
      if (!currentUserId) {
        Alert.alert('Session Error', 'Please log in again to continue');
        return;
      }

      const formattedDate = interviewDate
        ? interviewDate.toISOString().split('T')[0]
        : null;

      const formattedTime = interviewTime
        ? interviewTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        : null;

      const payload = {
        job_id: selectedJobId,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        current_role: currentRole.trim() || null,
        current_company: currentCompany.trim() || null,
        resume_url: resumeUrl.trim() || null,
        referral_source: referralSource as any,
        current_stage_id: selectedStageId,
        interview_date: formattedDate,
        interview_time: formattedTime,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && candidateId) {
        // --- EDIT CANDIDATE ---
        const { error: updateErr } = await supabase
          .from('candidates')
          .update(payload)
          .eq('id', candidateId);

        if (updateErr) {
          const db = getDb();
          db.runSync(
            `UPDATE candidates SET job_id = ?, full_name = ?, email = ?, phone = ?, current_role = ?,
             current_company = ?, resume_url = ?, referral_source = ?, current_stage_id = ?,
             interview_date = ?, interview_time = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
            [
              payload.job_id, payload.full_name, payload.email, payload.phone, payload.current_role,
              payload.current_company, payload.resume_url, payload.referral_source,
              payload.current_stage_id, payload.interview_date, payload.interview_time,
              payload.updated_at, candidateId,
            ]
          );
          enqueueMutation('candidate', candidateId, 'update', payload);
        }

        Alert.alert('Success', 'Candidate details updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // --- ADD CANDIDATE ---
        const { data: newCandidate, error: insertErr } = await supabase
          .from('candidates')
          .insert({
            ...payload,
            created_by: currentUserId,
          })
          .select()
          .single();

        if (insertErr) {
          const offlineId = uuid.v4() as string;
          const now = new Date().toISOString();
          const db = getDb();
          db.runSync(
            `INSERT INTO candidates
             (id, job_id, full_name, email, phone, current_role, current_company, resume_url,
              referral_source, current_stage_id, interview_date, interview_time, created_by,
              created_at, updated_at, sync_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
              offlineId, payload.job_id, payload.full_name, payload.email, payload.phone,
              payload.current_role, payload.current_company, payload.resume_url,
              payload.referral_source, payload.current_stage_id, payload.interview_date,
              payload.interview_time, currentUserId, now, now,
            ]
          );
          enqueueMutation('candidate', offlineId, 'create', {
            id: offlineId,
            ...payload,
            created_by: currentUserId,
            created_at: now,
          });
          Alert.alert('Saved Offline', 'Candidate saved locally and will sync when you are online.', [
            {
              text: 'OK',
              onPress: () =>
                router.replace(isInterviewer ? ROUTES.interviewerCandidates : ROUTES.adminCandidates),
            },
          ]);
          return;
        }

        // Log candidate_added event to activity_logs
        try {
          await supabase.from('activity_logs').insert({
            candidate_id: newCandidate.id,
            user_id: currentUserId,
            action: 'candidate_added',
            metadata: {
              candidate_name: newCandidate.full_name,
              job_id: selectedJobId,
              stage_id: selectedStageId,
            },
          });
        } catch (logErr) {
          console.warn('Non-fatal activity log error:', logErr);
        }

        Alert.alert('Success', 'Candidate added to hiring pipeline!', [
          {
            text: 'View Profile',
            onPress: () => {
              if (isInterviewer) {
                router.replace(ROUTES.interviewerCandidates);
              } else {
                router.replace({
                  pathname: ROUTES.adminCandidateDetail,
                  params: { id: newCandidate.id },
                });
              }
            },
          },
          {
            text: 'Add Another',
            onPress: () => {
              setFullName('');
              setEmail('');
              setPhone('');
              setCurrentRole('');
              setCurrentCompany('');
              setResumeUrl('');
              setInterviewDate(null);
              setInterviewTime(null);
            },
          },
        ]);
      }
    } catch (err: any) {
      console.warn('Save candidate error:', err);
      Alert.alert('Error', err.message || 'Failed to save candidate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>
            {isEditing ? 'Edit Candidate' : isInterviewer ? 'Add Candidate' : 'Add New Candidate'}
          </Text>
          <Text style={styles.subtitle}>
            {isEditing
              ? 'Update applicant profile and interview schedule'
              : 'Add applicant to pipeline and schedule interview rounds'}
          </Text>
        </View>
      </View>

      {fetchingData ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
      {/* JOB & STAGE ASSIGNMENT CARD */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>Job & Interview Stage</Text>

        <Text style={styles.label}>
          Assign to Job Opening <Text style={styles.required}>*</Text>
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {jobs.map((j) => {
            const isSelected = selectedJobId === j.id;
            return (
              <Pressable
                key={j.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => {
                  setSelectedJobId(j.id);
                  setSelectedStageId('');
                }}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {j.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>
          Initial Interview Stage <Text style={styles.required}>*</Text>
        </Text>
        {stages.length === 0 ? (
          <Text style={styles.noStagesNote}>No stages found for this job.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {stages.map((st, idx) => {
              const isSelected = selectedStageId === st.id;
              return (
                <Pressable
                  key={st.id}
                  style={[styles.stageChip, isSelected && styles.stageChipActive]}
                  onPress={() => setSelectedStageId(st.id)}
                >
                  <Text style={[styles.stageChipText, isSelected && styles.stageChipTextActive]}>
                    {idx + 1}. {st.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* BASIC INFORMATION CARD */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>Candidate Information</Text>

        <Text style={styles.label}>
          Full Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Alex Johnson"
          placeholderTextColor={colors.mutedText}
          value={fullName}
          onChangeText={setFullName}
        />

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. alex.johnson@example.com"
          placeholderTextColor={colors.mutedText}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. +1 (555) 234-5678"
          placeholderTextColor={colors.mutedText}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>Current Role</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Frontend Engineer"
              placeholderTextColor={colors.mutedText}
              value={currentRole}
              onChangeText={setCurrentRole}
            />
          </View>

          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Current Company</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Stripe, Acme Corp"
              placeholderTextColor={colors.mutedText}
              value={currentCompany}
              onChangeText={setCurrentCompany}
            />
          </View>
        </View>

        <Text style={styles.label}>Resume Link / Portfolio URL</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. https://linkedin.com/in/alex or Drive link"
          placeholderTextColor={colors.mutedText}
          value={resumeUrl}
          onChangeText={(text) => {
            setResumeUrl(text);
            setResumeFileName('');
          }}
          autoCapitalize="none"
        />

        <Pressable
          style={styles.uploadBtn}
          onPress={pickAndUploadResume}
          disabled={uploadingResume}
        >
          {uploadingResume ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
          )}
          <Text style={styles.uploadBtnText}>
            {uploadingResume
              ? 'Uploading...'
              : resumeFileName
              ? `Attached: ${resumeFileName}`
              : 'Or upload a PDF resume'}
          </Text>
        </Pressable>

        <Text style={styles.label}>Referral Source</Text>
        <View style={styles.referralGrid}>
          {REFERRAL_SOURCES.map((src) => {
            const isSelected = referralSource === src.id;
            return (
              <Pressable
                key={src.id}
                style={[styles.referralPill, isSelected && styles.referralPillActive]}
                onPress={() => setReferralSource(src.id)}
              >
                <Text
                  style={[styles.referralPillText, isSelected && styles.referralPillTextActive]}
                >
                  {src.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* SCHEDULE INTERVIEW CARD */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>Interview Schedule (Optional)</Text>
        <Text style={styles.sectionSub}>Set upcoming interview date and time</Text>

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>Date</Text>
            <Pressable
              style={styles.pickerBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.pickerBtnText}>
                {interviewDate ? interviewDate.toLocaleDateString() : 'Select Date'}
              </Text>
            </Pressable>
          </View>

          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Time</Text>
            <Pressable
              style={styles.pickerBtn}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={styles.pickerBtnText}>
                {interviewTime
                  ? interviewTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Select Time'}
              </Text>
            </Pressable>
          </View>
        </View>

        {(interviewDate || interviewTime) && (
          <Pressable
            style={styles.clearScheduleBtn}
            onPress={() => {
              setInterviewDate(null);
              setInterviewTime(null);
            }}
          >
            <Text style={styles.clearScheduleText}>Clear schedule</Text>
          </Pressable>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={interviewDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event, date) => {
              setShowDatePicker(false);
              if (date) setInterviewDate(date);
            }}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={interviewTime || new Date()}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event, date) => {
              setShowTimePicker(false);
              if (date) setInterviewTime(date);
            }}
          />
        )}
      </View>

      {/* SUBMIT BUTTON */}
      <Button
        label={isEditing ? 'Update Candidate' : 'Add Candidate'}
        onPress={handleSave}
        loading={loading}
        disabled={loading}
        icon={
          <Ionicons
            name={isEditing ? 'checkmark-circle-outline' : 'person-add'}
            size={18}
            color="#FFFFFF"
          />
        }
        fullWidth
      />
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  uploadBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    flexShrink: 1,
  },
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.secondaryText,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
    marginTop: 12,
    marginBottom: 6,
  },
  required: {
    color: colors.danger,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.divider,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
  },
  stageChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.background,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stageChipActive: {
    backgroundColor: colors.successLight,
    borderColor: '#16A34A',
  },
  stageChipText: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '600',
  },
  stageChipTextActive: {
    color: colors.success,
  },
  noStagesNote: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  referralGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  referralPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  referralPillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  referralPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  referralPillTextActive: {
    color: colors.primary,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  pickerBtnText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  clearScheduleBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  clearScheduleText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
