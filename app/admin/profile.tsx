import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase/client";
import { useAuth } from "../../hooks/useAuth";

export default function AdminProfileScreen() {
  const { user, signOut } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [stats, setStats] = useState({
    jobs: 0,
    candidates: 0,
    interviews: 0,
    hires: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  useEffect(() => {
    loadAdminStats();
  }, []);

  const loadAdminStats = async () => {
    try {
      setLoadingStats(true);
      const [
        { count: jobsCount },
        { count: candidatesCount },
        { count: feedbackCount },
        { count: hiresCount },
      ] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("feedback").select("id", { count: "exact", head: true }),
        supabase
          .from("activity_logs")
          .select("id", { count: "exact", head: true })
          .eq("action", "marked_hire"),
      ]);

      setStats({
        jobs: jobsCount || 0,
        candidates: candidatesCount || 0,
        interviews: feedbackCount || 0,
        hires: hiresCount || 0,
      });
    } catch (err) {
      console.warn("Error loading admin stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleUpdateName = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Name cannot be empty.");
      return;
    }
    if (!user?.id) return;

    try {
      setSavingName(true);
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;
      Alert.alert("Success", "Profile name updated successfully.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update profile name.");
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword) {
      Alert.alert("Error", "Please enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      setUpdatingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      Alert.alert("Success", "Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update password.");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* TOP HEADER */}
      <View style={styles.topNav}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.push("/admin/dashboard")}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.navTitle}>Admin Profile</Text>
        <Pressable
          style={styles.settingsBtn}
          onPress={() => router.push("/admin/settings")}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color="#0F172A" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO CARD */}
        <View style={styles.heroCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
            </Text>
          </View>
          <Text style={styles.heroName}>{user?.name || "Administrator"}</Text>
          <Text style={styles.heroEmail}>{user?.email || "admin@interviewpulse.com"}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#2563EB" style={{ marginRight: 5 }} />
              <Text style={styles.roleBadgeText}>Administrator</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Active</Text>
            </View>
          </View>
        </View>

        {/* SYSTEM IMPACT STATS */}
        <Text style={styles.sectionHeading}>SYSTEM PIPELINE STATS</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="briefcase-outline" size={22} color="#2563EB" />
            <Text style={styles.statValue}>
              {loadingStats ? "..." : stats.jobs}
            </Text>
            <Text style={styles.statLabel}>Job Openings</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={22} color="#8B5CF6" />
            <Text style={styles.statValue}>
              {loadingStats ? "..." : stats.candidates}
            </Text>
            <Text style={styles.statLabel}>Candidates</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="document-text-outline" size={22} color="#0EA5E9" />
            <Text style={styles.statValue}>
              {loadingStats ? "..." : stats.interviews}
            </Text>
            <Text style={styles.statLabel}>Evaluations</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle-outline" size={22} color="#10B981" />
            <Text style={styles.statValue}>
              {loadingStats ? "..." : stats.hires}
            </Text>
            <Text style={styles.statLabel}>Hires Made</Text>
          </View>
        </View>

        {/* EDIT PROFILE DETAILS */}
        <Text style={styles.sectionHeading}>PROFILE INFORMATION</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.fieldLabel}>Email Address</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={user?.email || ""}
            editable={false}
          />
          <Text style={styles.fieldHint}>Email address is managed by Supabase Authentication.</Text>

          <Pressable
            style={[styles.primaryBtn, savingName && styles.btnDisabled]}
            onPress={handleUpdateName}
            disabled={savingName}
          >
            {savingName ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnText}>Save Profile Name</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* CHANGE PASSWORD */}
        <Text style={styles.sectionHeading}>SECURITY</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Minimum 6 characters"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.fieldLabel}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Re-enter new password"
            placeholderTextColor="#94A3B8"
          />

          <Pressable
            style={[styles.outlineBtn, updatingPassword && styles.btnDisabled]}
            onPress={handleUpdatePassword}
            disabled={updatingPassword}
          >
            {updatingPassword ? (
              <ActivityIndicator color="#2563EB" size="small" />
            ) : (
              <>
                <Ionicons name="key-outline" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                <Text style={styles.outlineBtnText}>Update Password</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* QUICK SHORTCUTS */}
        <Text style={styles.sectionHeading}>APP PREFERENCES</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.navRow}
            onPress={() => router.push("/admin/settings")}
          >
            <View style={styles.navRowLeft}>
              <View style={[styles.navIconBox, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="settings-sharp" size={18} color="#2563EB" />
              </View>
              <Text style={styles.navRowText}>System Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </Pressable>

          <View style={styles.separator} />

          <Pressable
            style={styles.navRow}
            onPress={() => router.push("/admin/notifications")}
          >
            <View style={styles.navRowLeft}>
              <View style={[styles.navIconBox, { backgroundColor: "#F5F3FF" }]}>
                <Ionicons name="notifications" size={18} color="#8B5CF6" />
              </View>
              <Text style={styles.navRowText}>Activity & Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </Pressable>
        </View>

        {/* LOGOUT */}
        <Pressable style={styles.logoutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Sign Out of InterviewPulse</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 20,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#2563EB",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarLargeText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  heroEmail: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 10,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  statusBadge: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 8,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: -6,
    marginBottom: 14,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    marginBottom: 14,
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    height: 46,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
    height: 46,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  outlineBtnText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  navRowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  navIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  navRowText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  separator: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 4,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    height: 50,
    borderRadius: 12,
    marginTop: 4,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
  },
});
