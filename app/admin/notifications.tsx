import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase/client";

interface ActivityLogItem {
  id: string;
  action: string;
  metadata?: any;
  created_at: string;
  candidate_id?: string;
  candidates?: {
    id: string;
    full_name: string;
    jobs?: {
      title: string;
    };
  };
  profiles?: {
    name: string;
    email: string;
  };
}

export default function AdminNotificationsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "decisions" | "moves">("all");

  const loadLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select(`
          id,
          action,
          metadata,
          created_at,
          candidate_id,
          candidates (
            id,
            full_name,
            jobs (
              title
            )
          ),
          profiles (
            name,
            email
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (data && data.length > 0) {
        setLogs((data as any) || []);
      } else {
        // Fallback to SQLite mirror
        try {
          const { getDb } = require('../../lib/sqlite/schema');
          const db = getDb();
          const localLogs: any[] = db.getAllSync(
            `SELECT al.*, c.full_name as candidate_name, j.title as job_title, p.name as user_name, p.email as user_email
             FROM activity_logs al
             LEFT JOIN candidates c ON c.id = al.candidate_id
             LEFT JOIN jobs j ON j.id = c.job_id
             LEFT JOIN profiles p ON p.id = al.user_id
             ORDER BY al.created_at DESC LIMIT 100`
          );
          if (localLogs && localLogs.length > 0) {
            const mapped = localLogs.map((l: any) => {
              let meta = {};
              try {
                meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : (l.metadata || {});
              } catch (e) {}
              return {
                id: l.id,
                action: l.action,
                metadata: meta,
                created_at: l.created_at,
                candidate_id: l.candidate_id,
                candidates: {
                  id: l.candidate_id,
                  full_name: l.candidate_name || (meta as any)?.candidate_name || 'Candidate',
                  jobs: {
                    title: l.job_title || 'General Position',
                  },
                },
                profiles: {
                  name: l.user_name || 'Admin',
                  email: l.user_email || 'admin@interviewpulse.com',
                },
              };
            });
            setLogs(mapped);
          } else {
            setLogs([]);
          }
        } catch (localErr) {
          setLogs([]);
        }
      }
    } catch (err: any) {
      console.warn("Failed to load activity logs:", err);
      // Try local fallback on network error
      try {
        const { getDb } = require('../../lib/sqlite/schema');
        const db = getDb();
        const localLogs: any[] = db.getAllSync(
          `SELECT al.*, c.full_name as candidate_name, j.title as job_title, p.name as user_name
           FROM activity_logs al
           LEFT JOIN candidates c ON c.id = al.candidate_id
           LEFT JOIN jobs j ON j.id = c.job_id
           LEFT JOIN profiles p ON p.id = al.user_id
           ORDER BY al.created_at DESC LIMIT 100`
        );
        if (localLogs && localLogs.length > 0) {
          const mapped = localLogs.map((l: any) => {
            let meta = {};
            try {
              meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : (l.metadata || {});
            } catch (e) {}
            return {
              id: l.id,
              action: l.action,
              metadata: meta,
              created_at: l.created_at,
              candidate_id: l.candidate_id,
              candidates: {
                id: l.candidate_id,
                full_name: l.candidate_name || (meta as any)?.candidate_name || 'Candidate',
                jobs: { title: l.job_title || 'General' },
              },
              profiles: { name: l.user_name || 'Admin', email: '' },
            };
          });
          setLogs(mapped);
        }
      } catch (e) {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const filteredLogs = logs.filter((item) => {
    if (activeFilter === "decisions") {
      return item.action === "marked_hire" || item.action === "marked_reject";
    }
    if (activeFilter === "moves") {
      return item.action === "stage_moved" || item.action === "moved_stage";
    }
    return true;
  });

  const getActionConfig = (action: string) => {
    switch (action) {
      case "marked_hire":
        return {
          icon: "checkmark-circle",
          color: "#10B981",
          bgColor: colors.successLight,
          label: "Candidate Hired",
        };
      case "marked_reject":
        return {
          icon: "close-circle",
          color: "#EF4444",
          bgColor: colors.dangerLight,
          label: "Candidate Rejected",
        };
      case "stage_moved":
      case "moved_stage":
        return {
          icon: "arrow-forward-circle",
          color: colors.primary,
          bgColor: "#EFF6FF",
          label: "Moved Stage",
        };
      case "created_candidate":
        return {
          icon: "person-add",
          color: "#8B5CF6",
          bgColor: colors.primaryLight,
          label: "Candidate Added",
        };
      default:
        return {
          icon: "notifications",
          color: colors.secondaryText,
          bgColor: colors.divider,
          label: action.replace(/_/g, " "),
        };
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const handleItemPress = (item: ActivityLogItem) => {
    const candidateId = item.candidate_id || item.candidates?.id;
    if (candidateId) {
      router.push({
        pathname: "/admin/candidate-detail",
        params: { id: candidateId },
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.topNav}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.push("/admin/dashboard")}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Activity & Alerts</Text>
        <Pressable
          style={styles.refreshBtn}
          onPress={onRefresh}
          hitSlop={8}
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* FILTER TABS */}
      <View style={styles.filterBar}>
        <Pressable
          style={[styles.tab, activeFilter === "all" && styles.tabActive]}
          onPress={() => setActiveFilter("all")}
        >
          <Text style={[styles.tabText, activeFilter === "all" && styles.tabTextActive]}>
            All ({logs.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeFilter === "decisions" && styles.tabActive]}
          onPress={() => setActiveFilter("decisions")}
        >
          <Text style={[styles.tabText, activeFilter === "decisions" && styles.tabTextActive]}>
            Decisions
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeFilter === "moves" && styles.tabActive]}
          onPress={() => setActiveFilter("moves")}
        >
          <Text style={[styles.tabText, activeFilter === "moves" && styles.tabTextActive]}>
            Stage Moves
          </Text>
        </Pressable>
      </View>

      {/* LIST */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563EB"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={36} color={colors.mutedText} />
              </View>
              <Text style={styles.emptyTitle}>No Activity Found</Text>
              <Text style={styles.emptyDesc}>
                {activeFilter === "all"
                  ? "No system activity has been logged yet."
                  : `No ${activeFilter} events recorded in the system.`}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const config = getActionConfig(item.action);
            const candidateName = item.candidates?.full_name || "Candidate";
            const jobTitle = item.candidates?.jobs?.title;
            const actorName = item.profiles?.name || "System Admin";

            return (
              <Pressable
                style={styles.itemCard}
                onPress={() => handleItemPress(item)}
              >
                <View style={[styles.iconBox, { backgroundColor: config.bgColor }]}>
                  <Ionicons name={config.icon as any} size={22} color={config.color} />
                </View>

                <View style={styles.itemBody}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemActionTitle}>{config.label}</Text>
                    <Text style={styles.itemTime}>{formatTimestamp(item.created_at)}</Text>
                  </View>

                  <Text style={styles.candidateName}>
                    {candidateName}
                    {jobTitle ? ` • ${jobTitle}` : ""}
                  </Text>

                  {item.metadata?.to_stage && (
                    <Text style={styles.stageMoveNote}>
                      Advanced to:{" "}
                      <Text style={{ fontWeight: "700", color: colors.text }}>
                        {item.metadata.to_stage}
                      </Text>
                    </Text>
                  )}

                  <Text style={styles.actorNote}>
                    Action logged by <Text style={styles.actorName}>{actorName}</Text>
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={16} color={colors.inputBorder} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.divider,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.text,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  itemBody: {
    flex: 1,
    marginRight: 8,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  itemActionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  itemTime: {
    fontSize: 11,
    color: colors.mutedText,
    fontWeight: "500",
  },
  candidateName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.secondaryText,
    marginBottom: 2,
  },
  stageMoveNote: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  actorNote: {
    fontSize: 11,
    color: colors.mutedText,
    marginTop: 3,
  },
  actorName: {
    color: colors.secondaryText,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: "center",
    lineHeight: 19,
  },
});
