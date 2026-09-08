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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';

export default function AssignInterviewerScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const params = useLocalSearchParams();
  const jobId = params.jobId as string | undefined;
  const userId = params.userId as string | undefined;

  // If jobId is provided -> assigning interviewers to a job
  // If userId is provided -> assigning a specific interviewer to jobs
  const mode = jobId ? 'assign_interviewers_to_job' : 'assign_jobs_to_interviewer';

  const [targetName, setTargetName] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      if (mode === 'assign_interviewers_to_job' && jobId) {
        // 1. Get Job Name
        const { data: job } = await supabase
          .from('jobs')
          .select('title, department')
          .eq('id', jobId)
          .single();
        setTargetName(job ? `${job.title} (${job.department || 'General'})` : 'Job Requisition');

        // 2. Get All Interviewers
        const { data: interviewers } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('role', 'interviewer')
          .order('name', { ascending: true });
        setItems(interviewers || []);

        // 3. Get Already Assigned Interviewers for this Job
        const { data: existing } = await supabase
          .from('job_interviewers')
          .select('user_id')
          .eq('job_id', jobId);

        const alreadyAssigned = (existing || []).map((e) => e.user_id).filter(Boolean);
        setExistingIds(alreadyAssigned);
        setSelectedIds(alreadyAssigned);
      } else if (userId) {
        // 1. Get Interviewer Name
        const { data: prof } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', userId)
          .single();
        setTargetName(prof?.name || prof?.email || 'Interviewer');

        // 2. Get All Open Jobs
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, title, department')
          .order('title', { ascending: true });
        setItems(jobs || []);

        // 3. Get Already Assigned Jobs for this Interviewer
        const { data: existing } = await supabase
          .from('job_interviewers')
          .select('job_id')
          .eq('user_id', userId);

        const alreadyAssigned = (existing || []).map((e) => e.job_id).filter(Boolean);
        setExistingIds(alreadyAssigned);
        setSelectedIds(alreadyAssigned);
      } else {
        Alert.alert('Error', 'Missing Job ID or Interviewer ID parameters');
      }
    } catch (err: any) {
      console.warn('Error loading assignment data:', err);
      Alert.alert('Error', err.message || 'Failed to load panel data');
    } finally {
      setLoading(false);
    }
  }, [jobId, userId, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleItem = (idToToggle: string) => {
    setSelectedIds((prev) =>
      prev.includes(idToToggle)
        ? prev.filter((id) => id !== idToToggle)
        : [...prev, idToToggle]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (mode === 'assign_interviewers_to_job' && jobId) {
        // IDs to add: selectedIds - existingIds
        const toAdd = selectedIds.filter((id) => !existingIds.includes(id));
        // IDs to remove: existingIds - selectedIds
        const toRemove = existingIds.filter((id) => !selectedIds.includes(id));

        // Delete removed
        if (toRemove.length > 0) {
          await supabase
            .from('job_interviewers')
            .delete()
            .eq('job_id', jobId)
            .in('user_id', toRemove);
        }

        // Insert added
        if (toAdd.length > 0) {
          const insertPayload = toAdd.map((uId) => {
            const interviewerObj = items.find((i) => i.id === uId);
            return {
              job_id: jobId,
              user_id: uId,
              invited_email: interviewerObj?.email || '',
              status: 'active',
            };
          });
          const { error } = await supabase.from('job_interviewers').insert(insertPayload);
          if (error) throw error;
        }

        Alert.alert('Success', 'Interview panel updated successfully!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else if (userId) {
        // IDs to add: selectedIds - existingIds
        const toAdd = selectedIds.filter((id) => !existingIds.includes(id));
        // IDs to remove: existingIds - selectedIds
        const toRemove = existingIds.filter((id) => !selectedIds.includes(id));

        // Get interviewer email
        const { data: prof } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single();

        if (toRemove.length > 0) {
          await supabase
            .from('job_interviewers')
            .delete()
            .eq('user_id', userId)
            .in('job_id', toRemove);
        }

        if (toAdd.length > 0) {
          const insertPayload = toAdd.map((jId) => ({
            job_id: jId,
            user_id: userId,
            invited_email: prof?.email || '',
            status: 'active',
          }));
          const { error } = await supabase.from('job_interviewers').insert(insertPayload);
          if (error) throw error;
        }

        Alert.alert('Success', 'Interviewer job assignments updated!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      console.warn('Save assignment error:', err);
      Alert.alert('Error', err.message || 'Failed to update assignments');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading panel information...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>
            {mode === 'assign_interviewers_to_job'
              ? 'Assign Panel Members'
              : 'Assign to Jobs'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {targetName}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.instruction}>
          {mode === 'assign_interviewers_to_job'
            ? 'Select interviewers to evaluate candidates for this job requisition:'
            : 'Select job requisitions to assign this interviewer to:'}
        </Text>

        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={36} color={colors.mutedText} />
            <Text style={styles.emptyText}>
              {mode === 'assign_interviewers_to_job'
                ? 'No interviewers found. Please create interviewer accounts first.'
                : 'No job openings found. Please create a job opening first.'}
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const isChecked = selectedIds.includes(item.id);
            const title = item.name || item.title || 'Untitled';
            const subtitle = item.email || item.department || '';

            return (
              <Pressable
                key={item.id}
                style={[styles.itemCard, isChecked && styles.itemCardSelected]}
                onPress={() => toggleItem(item.id)}
              >
                <View style={[styles.checkbox, isChecked && styles.checkboxSelected]}>
                  {isChecked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle}>{title}</Text>
                  {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* FOOTER SAVE BUTTON */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>
                Save Assignments ({selectedIds.length})
              </Text>
            </>
          )}
        </Pressable>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  instruction: {
    fontSize: 13,
    color: colors.secondaryText,
    marginBottom: 14,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 8,
  },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  itemCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  footer: {
    backgroundColor: colors.card,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
