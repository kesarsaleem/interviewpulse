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
          bgColor: "#ECFDF5",
          label: "Candidate Hired",
        };
      case "marked_reject":
        return {
          icon: "close-circle",
          color: "#EF4444",
          bgColor: "#FEF2F2",
          label: "Candidate Rejected",
        };
      case "stage_moved":
      case "moved_stage":
        return {
          icon: "arrow-forward-circle",
          color: "#2563EB",
          bgColor: "#EFF6FF",
          label: "Moved Stage",
        };
      case "created_candidate":
        return {
          icon: "person-add",
          color: "#8B5CF6",
          bgColor: "#F5F3FF",
          label: "Candidate Added",
        };
      default:
        return {
          icon: "notifications",
          color: "#64748B",
          bgColor: "#F1F5F9",
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
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.navTitle}>Activity & Alerts</Text>
        <Pressable
          style={styles.refreshBtn}
          onPress={onRefresh}
          hitSlop={8}
        >
          <Ionicons name="refresh" size={20} color="#2563EB" />
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
          <ActivityIndicator size="large" color="#2563EB" />
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
                <Ionicons name="notifications-off-outline" size={36} color="#94A3B8" />
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
                      <Text style={{ fontWeight: "700", color: "#1E293B" }}>
                        {item.metadata.to_stage}
                      </Text>
                    </Text>
                  )}

                  <Text style={styles.actorNote}>
                    Action logged by <Text style={styles.actorName}>{actorName}</Text>
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  tabActive: {
    backgroundColor: "#2563EB",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
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
    color: "#0F172A",
  },
  itemTime: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
  candidateName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 2,
  },
  stageMoveNote: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  actorNote: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 3,
  },
  actorName: {
    color: "#475569",
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
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 19,
  },
});
