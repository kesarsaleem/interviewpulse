import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase/client';
import { EmptyState } from '../../components/ui/EmptyState';
import { ROUTES } from '../../constants/routes';

export default function InterviewersScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [interviewers, setInterviewers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadInterviewers = useCallback(async () => {
    try {
      const [
        { data: profilesData, error: profErr },
        { data: assignments, error: assignErr },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, email, role, avatar_url, created_at')
          .eq('role', 'interviewer')
          .order('created_at', { ascending: false }),
        supabase
          .from('job_interviewers')
          .select(
            `
            id,
            user_id,
            job_id,
            status,
            jobs (
              id,
              title,
              department
            )
          `
          ),
      ]);

      if (profErr) throw profErr;

      if (assignErr) console.warn('Assignments fetch error:', assignErr);

      // Group assigned jobs by user_id
      const assignmentMap = new Map<string, any[]>();
      (assignments || []).forEach((a) => {
        if (a.user_id) {
          const list = assignmentMap.get(a.user_id) || [];
          list.push(a);
          assignmentMap.set(a.user_id, list);
        }
      });

      const combined = (profilesData || []).map((p) => ({
        ...p,
        assignments: assignmentMap.get(p.id) || [],
      }));

      setInterviewers(combined);
    } catch (err: any) {
      console.warn('Error loading interviewers:', err);
      Alert.alert('Error', err.message || 'Failed to load interviewers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInterviewers();
    }, [loadInterviewers])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInterviewers();
  };

  const removeAssignment = (assignmentId: string, jobTitle: string, interviewerName: string) => {
    Alert.alert(
      'Remove Assignment',
      `Remove ${interviewerName} from "${jobTitle}"?`,
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
                .eq('id', assignmentId);

              if (error) throw error;
              Alert.alert('Success', 'Interviewer removed from job panel');
              await loadInterviewers();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove assignment');
            }
          },
        },
      ]
    );
  };

  const filteredInterviewers = interviewers.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (item.name || '').toLowerCase();
    const email = (item.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Interviewers</Text>
          <Text style={styles.subtitle}>
            {interviewers.length} active interviewer{interviewers.length === 1 ? '' : 's'} on team
          </Text>
        </View>

        <Pressable
          style={styles.addBtn}
          onPress={() => router.push(ROUTES.adminAddInterviewer)}
        >
          <Ionicons name="person-add" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Interviewer</Text>
        </Pressable>
      </View>

      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
      {/* SEARCH BAR */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={styles.searchIcon} />
          <TextInput
            placeholder="Search by name or email..."
            placeholderTextColor={colors.mutedText}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </Pressable>
          )}
        </View>
      </View>

      {/* INTERVIEWERS LIST */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredInterviewers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              title={search.trim() ? 'No matching interviewers' : 'No interviewers found'}
              description={
                search.trim()
                  ? 'Try a different search term.'
                  : 'Create interviewer accounts so team members can evaluate candidates and submit scores.'
              }
            />
            {search.trim() ? (
              <Pressable style={styles.clearBtn} onPress={() => setSearch('')}>
                <Text style={styles.clearBtnText}>Clear Search</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.emptyAddBtn}
                onPress={() => router.push(ROUTES.adminAddInterviewer)}
              >
                <Text style={styles.emptyAddBtnText}>Add First Interviewer</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredInterviewers.map((item) => {
            const initial = item.name?.charAt(0).toUpperCase() || 'I';
            const assignedJobs = item.assignments || [];

            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                  </View>

                  <View style={styles.roleBadge}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                    <Text style={styles.roleBadgeText}>Interviewer</Text>
                  </View>
                </View>

                {/* ASSIGNED JOBS SECTION */}
                <View style={styles.assignedSection}>
                  <View style={styles.assignedHeader}>
                    <Text style={styles.assignedTitle}>
                      Assigned Jobs ({assignedJobs.length})
                    </Text>
                    <Pressable
                      style={styles.assignLink}
                      onPress={() =>
                        router.push({
                          pathname: ROUTES.adminAssignInterviewer,
                          params: { userId: item.id },
                        })
                      }
                    >
                      <Ionicons name="add" size={14} color={colors.primary} />
                      <Text style={styles.assignLinkText}>Assign Job</Text>
                    </Pressable>
                  </View>

                  {assignedJobs.length === 0 ? (
                    <Text style={styles.noJobsText}>
                      Not currently assigned to any active job panels.
                    </Text>
                  ) : (
                    <View style={styles.jobChipsRow}>
                      {assignedJobs.map((a: any) => {
                        const jobTitle = a.jobs?.title || 'Job Opening';
                        return (
                          <View key={a.id} style={styles.jobChip}>
                            <Ionicons name="briefcase-outline" size={12} color={colors.primary} />
                            <Text style={styles.jobChipText} numberOfLines={1}>
                              {jobTitle}
                            </Text>
                            <Pressable
                              onPress={() => removeAssignment(a.id, jobTitle, item.name)}
                              hitSlop={6}
                              style={styles.chipRemoveBtn}
                            >
                              <Ionicons name="close" size={13} color={colors.secondaryText} />
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
        </>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerLeft: {
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchSection: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.divider,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 38,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    height: '100%',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#6D28D9',
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: 13,
    color: colors.secondaryText,
    marginTop: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  assignedSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  assignedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  assignedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  assignLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  assignLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  noJobsText: {
    fontSize: 12,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  jobChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  jobChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryLight,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    maxWidth: 200,
  },
  jobChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
    flexShrink: 1,
  },
  chipRemoveBtn: {
    padding: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  clearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyAddBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
