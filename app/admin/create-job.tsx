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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import Input from '../../components/ui/Input';
export default function CreateOrEditJob() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const jobId = (params.jobId || params.id) as string | undefined;
  const isEditing = !!jobId;

  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'open' | 'closed' | 'archived'>('open');

  const [stages, setStages] = useState<string[]>([
    'Phone Screen',
    'Technical Round',
    'Culture Fit / Final Round',
  ]);

  const [criteria, setCriteria] = useState<string[]>([
    'Communication',
    'Problem Solving',
    'System Design',
    'Team Fit',
  ]);

  const [existingStagesList, setExistingStagesList] = useState<any[]>([]);
  const [existingCriteriaList, setExistingCriteriaList] = useState<any[]>([]);
  const [newStage, setNewStage] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);

  const [jdUrl, setJdUrl] = useState<string | null>(null);
  const [jdFileName, setJdFileName] = useState('');
  const [pendingJdFile, setPendingJdFile] =
    useState<{ uri: string; name: string } | null>(null);
  const [uploadingJd, setUploadingJd] = useState(false);

  // Load existing job if in edit mode
  const loadJobForEdit = useCallback(async () => {
    if (!jobId) return;
    try {
      setInitialLoading(true);
      const { data: job, error: jobErr } = await supabase
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
        .eq('id', jobId)
        .single();

      if (jobErr) throw jobErr;

      if (job) {
        setTitle(job.title || '');
        setDepartment(job.department || '');
        setDescription(job.description || '');
        setStatus(job.status || 'open');
        setJdUrl(job.jd_url || null);

        if (job.stages && job.stages.length > 0) {
          const sortedStages = [...job.stages].sort((a, b) => a.position - b.position);
          setExistingStagesList(sortedStages);
          setStages(sortedStages.map((s) => s.name));
        }

        if (job.criteria && job.criteria.length > 0) {
          const sortedCriteria = [...job.criteria].sort((a, b) => a.position - b.position);
          setExistingCriteriaList(sortedCriteria);
          setCriteria(sortedCriteria.map((c) => c.name));
        }
      }
    } catch (err: any) {
      console.warn('Error loading job for editing:', err);
      Alert.alert('Load Error', err.message || 'Failed to load job details');
    } finally {
      setInitialLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (isEditing) {
      loadJobForEdit();
    }
  }, [isEditing, loadJobForEdit]);

  const addStage = () => {
    if (!newStage.trim()) return;
    if (stages.includes(newStage.trim())) {
      Alert.alert('Duplicate', 'This stage name already exists');
      return;
    }
    setStages([...stages, newStage.trim()]);
    setNewStage('');
  };

  const removeStage = (index: number) => {
    if (stages.length <= 1) {
      Alert.alert('Error', 'At least one hiring stage is required');
      return;
    }
    setStages(stages.filter((_, i) => i !== index));
  };

  const addCriteria = () => {
    if (!newCriteria.trim()) return;
    if (criteria.includes(newCriteria.trim())) {
      Alert.alert('Duplicate', 'This evaluation criterion already exists');
      return;
    }
    setCriteria([...criteria, newCriteria.trim()]);
    setNewCriteria('');
  };

  const removeCriteria = (index: number) => {
    if (criteria.length <= 1) {
      Alert.alert('Error', 'At least one evaluation criterion is required');
      return;
    }
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  /**
   * Picks a JD PDF from the device. The file isn't uploaded yet if we're
   * still in "create" mode, since the storage path needs the job's id
   * (which doesn't exist until the job row is inserted) — the actual
   * upload happens inside handleSubmit via uploadJdIfNeeded().
   */
  const pickJdDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setPendingJdFile({ uri: file.uri, name: file.name || 'job-description.pdf' });
      setJdFileName(file.name || 'job-description.pdf');
    } catch (err: any) {
      Alert.alert('Selection Failed', err.message || 'Could not open the file picker.');
    }
  };

  /**
   * Uploads a previously-picked JD PDF to the private `job-descriptions`
   * bucket, scoped to `{job_id}/...` per the storage RLS policies, then
   * writes a long-lived signed URL back onto the job row so job-detail
   * screens can open it directly.
   */
  const uploadJdIfNeeded = async (targetJobId: string) => {
    if (!pendingJdFile) return;

    try {
      setUploadingJd(true);

      const fileResponse = await fetch(pendingJdFile.uri);
      const fileBlob = await fileResponse.blob();

      const safeName = pendingJdFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${targetJobId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('job-descriptions')
        .upload(storagePath, fileBlob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;
      const { data: signedData, error: signError } = await supabase.storage
        .from('job-descriptions')
        .createSignedUrl(storagePath, TEN_YEARS_SECONDS);

      if (signError) throw signError;

      await supabase
        .from('jobs')
        .update({ jd_url: signedData.signedUrl })
        .eq('id', targetJobId);

      setJdUrl(signedData.signedUrl);
      setPendingJdFile(null);
    } catch (err: any) {
      // Non-fatal: the job itself was already saved successfully by the
      // time this runs, so we surface this as its own warning rather
      // than blocking the whole "job saved" success flow.
      Alert.alert(
        'Job Saved, but JD Upload Failed',
        err.message || 'The job was saved, but the JD PDF could not be uploaded. You can try attaching it again from the job details screen.'
      );
    } finally {
      setUploadingJd(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !department.trim()) {
      Alert.alert('Required', 'Job title and department are required');
      return;
    }

    if (stages.length === 0) {
      Alert.alert('Required', 'Please add at least one interview stage');
      return;
    }

    if (criteria.length === 0) {
      Alert.alert('Required', 'Please add at least one evaluation criterion');
      return;
    }

    try {
      setLoading(true);
      const currentUserId = user?.id;
      if (!currentUserId) {
        Alert.alert('Session Error', 'You must be logged in to create or edit a job');
        return;
      }

      if (isEditing && jobId) {
        // --- EDIT MODE ---
        // 1. Update Job record
        const { error: updateErr } = await supabase
          .from('jobs')
          .update({
            title: title.trim(),
            department: department.trim(),
            description: description.trim() || null,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        if (updateErr) throw updateErr;

        // 2. Refresh stages safely (update existing in-place, insert new, delete removed)
        for (let idx = 0; idx < stages.length; idx++) {
          const stageName = stages[idx];
          if (idx < existingStagesList.length) {
            await supabase
              .from('stages')
              .update({
                name: stageName,
                position: idx + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingStagesList[idx].id);
          } else {
            await supabase.from('stages').insert({
              job_id: jobId,
              name: stageName,
              position: idx + 1,
            });
          }
        }

        if (existingStagesList.length > stages.length) {
          const removedStageIds = existingStagesList.slice(stages.length).map((s) => s.id);
          // If any candidates were on removed stages, point them to the first stage
          if (existingStagesList.length > 0) {
            await supabase
              .from('candidates')
              .update({ current_stage_id: existingStagesList[0].id })
              .in('current_stage_id', removedStageIds);
          }
          await supabase.from('stages').delete().in('id', removedStageIds);
        }

        // 3. Refresh criteria safely (update existing in-place, insert new, delete removed)
        for (let idx = 0; idx < criteria.length; idx++) {
          const critName = criteria[idx];
          if (idx < existingCriteriaList.length) {
            await supabase
              .from('criteria')
              .update({
                name: critName,
                position: idx + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingCriteriaList[idx].id);
          } else {
            await supabase.from('criteria').insert({
              job_id: jobId,
              name: critName,
              position: idx + 1,
            });
          }
        }

        if (existingCriteriaList.length > criteria.length) {
          const removedCritIds = existingCriteriaList.slice(criteria.length).map((c) => c.id);
          await supabase.from('criteria').delete().in('id', removedCritIds);
        }

        await uploadJdIfNeeded(jobId);

        Alert.alert('Success', 'Job opening updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // --- CREATE MODE ---
        // 1. Insert Job
        const { data: createdJob, error: jobErr } = await supabase
          .from('jobs')
          .insert({
            title: title.trim(),
            department: department.trim(),
            description: description.trim() || null,
            status: 'open',
            created_by: currentUserId,
          })
          .select()
          .single();

        if (jobErr) throw jobErr;

        // 2. Insert Stages
        const stagePayload = stages.map((name, idx) => ({
          job_id: createdJob.id,
          name,
          position: idx + 1,
        }));
        const { error: stageErr } = await supabase.from('stages').insert(stagePayload);
        if (stageErr) throw stageErr;

        // 3. Insert Criteria
        const criteriaPayload = criteria.map((name, idx) => ({
          job_id: createdJob.id,
          name,
          position: idx + 1,
        }));
        const { error: critErr } = await supabase.from('criteria').insert(criteriaPayload);
        if (critErr) throw critErr;

        await uploadJdIfNeeded(createdJob.id);

        Alert.alert('Success', 'Job opening created successfully', [
          {
            text: 'View Job Details',
            onPress: () =>
              router.replace({
                pathname: '/admin/job-detail',
                params: { id: createdJob.id },
              }),
          },
        ]);
      }
    } catch (err: any) {
      console.warn('Save job error:', err);
      Alert.alert('Error', err.message || 'Failed to save job opening');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Job Details...</Text>
      </View>
    );
  }

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
          <Text style={styles.title}>{isEditing ? 'Edit Job Opening' : 'Create Job Opening'}</Text>
          <Text style={styles.subtitle}>
            {isEditing
              ? 'Update job details, stages, and criteria'
              : 'Define requisition, hiring pipeline, and evaluation criteria'}
          </Text>
        </View>
      </View>

      {/* JOB INFORMATION CARD */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>Job Details</Text>

        <Text style={styles.label}>
          Job Title <Text style={styles.required}>*</Text>
        </Text>
        <Input
          placeholder="e.g. Senior Frontend Engineer"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>
          Department <Text style={styles.required}>*</Text>
        </Text>
        <Input
          placeholder="e.g. Engineering, Product, Design"
          value={department}
          onChangeText={setDepartment}
        />

        <Text style={styles.label}>Job Description (Optional)</Text>
        <Input
          style={styles.textArea}
          placeholder="Brief description of the position, key responsibilities, and qualifications..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Job Description PDF (Optional)</Text>
        <Pressable
          style={styles.uploadBtn}
          onPress={pickJdDocument}
          disabled={uploadingJd}
        >
          {uploadingJd ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
          )}
          <Text style={styles.uploadBtnText}>
            {uploadingJd
              ? 'Uploading...'
              : jdFileName
              ? `Selected: ${jdFileName}`
              : jdUrl
              ? 'JD attached — tap to replace'
              : 'Upload JD as PDF'}
          </Text>
        </Pressable>

        {isEditing && (
          <View style={styles.statusRow}>
            <Text style={styles.label}>Job Status</Text>
            <View style={styles.statusPills}>
              {(['open', 'closed', 'archived'] as const).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.statusPill, status === s && styles.statusPillActive]}
                  onPress={() => setStatus(s)}
                >
                  <Text
                    style={[styles.statusPillText, status === s && styles.statusPillTextActive]}
                  >
                    {s.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* HIRING STAGES CARD */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionHeading}>Hiring Pipeline Stages</Text>
            <Text style={styles.sectionSub}>Sequential stages candidates will progress through</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{stages.length}</Text>
          </View>
        </View>

        <View style={styles.itemsList}>
          {stages.map((stage, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.itemOrderBadge}>
                <Text style={styles.itemOrderText}>{index + 1}</Text>
              </View>
              <Text style={styles.itemTitle}>{stage}</Text>
              <Pressable
                style={styles.removeIconBtn}
                onPress={() => removeStage(index)}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </Pressable>
            </View>
          ))}
        </View>

        {/* ADD STAGE INPUT */}
        <View style={styles.addItemRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Add new stage (e.g. System Architecture)..."
            placeholderTextColor={colors.mutedText}
            value={newStage}
            onChangeText={setNewStage}
            onSubmitEditing={addStage}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={addStage}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {/* EVALUATION CRITERIA CARD */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionHeading}>Evaluation Criteria</Text>
            <Text style={styles.sectionSub}>Skills & competencies interviewers rate 0–5 stars</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{criteria.length}</Text>
          </View>
        </View>

        <View style={styles.itemsList}>
          {criteria.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={[styles.itemOrderBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="star" size={12} color={colors.primary} />
              </View>
              <Text style={styles.itemTitle}>{item}</Text>
              <Pressable
                style={styles.removeIconBtn}
                onPress={() => removeCriteria(index)}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </Pressable>
            </View>
          ))}
        </View>

        {/* ADD CRITERIA INPUT */}
        <View style={styles.addItemRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Add custom criterion (e.g. Leadership)..."
            placeholderTextColor={colors.mutedText}
            value={newCriteria}
            onChangeText={setNewCriteria}
            onSubmitEditing={addCriteria}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={addCriteria}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

           {/* SUBMIT BUTTON */}
      <Button
        label={isEditing ? 'Save Changes' : 'Create Job Opening'}
        onPress={handleSubmit}
        loading={loading}
        disabled={loading}
        icon={
          <Ionicons
            name={isEditing ? 'checkmark-circle-outline' : 'save-outline'}
            size={18}
            color="#FFFFFF"
          />
        }
        fullWidth
      />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
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
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
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
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statusRow: {
    marginTop: 14,
  },
  statusPills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.divider,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statusPillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  statusPillTextActive: {
    color: colors.primary,
  },
  itemsList: {
    gap: 8,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  itemOrderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemOrderText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondaryText,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  removeIconBtn: {
    padding: 4,
  },
  addItemRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  submitButton: {
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
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
