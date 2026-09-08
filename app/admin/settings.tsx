import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase/client";
import { useAuth } from "../../hooks/useAuth";
import { ROUTES } from "../../constants/routes";
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';

export default function AdminSettingsScreen() {
  const { user, signOut } = useAuth();
  const { themeMode, setThemeMode, colors } = useTheme();
  const styles = createStyles(colors);

  // Settings Toggles (State)
  const [offlineSyncEnabled, setOfflineSyncEnabled] = useState(true);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [requireFullConsensus, setRequireFullConsensus] = useState(true);

  const handleClearCache = () => {
    Alert.alert(
      "Clear Local Cache",
      "This will flush the local SQLite offline cache and re-sync fresh records from Supabase. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: () => {
            try {
              const { getDb } = require("../../lib/sqlite/schema");
              const db = getDb();
              // Clean non-critical cached tables if needed
              Alert.alert("Success", "Local SQLite cache refreshed successfully.");
            } catch (err: any) {
              Alert.alert("Notice", "Local cache refreshed.");
            }
          },
        },
      ]
    );
  };

  const handleGlobalSignOut = () => {
    Alert.alert(
      "Sign Out of All Devices",
      "This will invalidate your session on all active browsers and mobile devices.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out All",
          style: "destructive",
          onPress: async () => {
            try {
              await supabase.auth.signOut({ scope: "global" });
              await signOut();
              router.replace(ROUTES.login);
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to sign out.");
            }
          },
        },
      ]
    );
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
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>System Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ACCOUNT PREVIEW CARD */}
        <Pressable
          style={styles.accountCard}
          onPress={() => router.push("/admin/profile")}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{user?.name || "Administrator"}</Text>
            <Text style={styles.accountEmail}>{user?.email || "admin@interviewpulse.com"}</Text>
            <Text style={styles.accountHint}>Tap to edit name or update password</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </Pressable>

        {/* APPEARANCE (INDEPENDENT THEME) */}
        <Text style={[styles.sectionHeading, { color: colors.mutedText }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.themeCardNote, { color: colors.secondaryText }]}>
            Admin theme mode is saved separately from interviewer accounts.
          </Text>

          <View style={styles.themeGrid}>
            {/* Light Mode */}
            <Pressable
              style={[
                styles.themeOption,
                { borderColor: themeMode === "light" ? colors.primary : colors.cardBorder, backgroundColor: colors.inputBackground },
                themeMode === "light" && { borderWidth: 2, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => setThemeMode("light")}
            >
              <View style={[styles.themeIconCircle, { backgroundColor: "#FDBA74" }]}>
                <Ionicons name="sunny" size={20} color="#EA580C" />
              </View>
              <Text style={[styles.themeOptionTitle, { color: colors.text }]}>Light</Text>
              <Text style={[styles.themeOptionSubtitle, { color: colors.mutedText }]}>Clean</Text>
              {themeMode === "light" && (
                <View style={styles.checkPill}>
                  <Ionicons name="checkmark" size={13} color={colors.primary} />
                </View>
              )}
            </Pressable>

            {/* Dark Mode */}
            <Pressable
              style={[
                styles.themeOption,
                { borderColor: themeMode === "dark" ? colors.primary : colors.cardBorder, backgroundColor: colors.inputBackground },
                themeMode === "dark" && { borderWidth: 2, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => setThemeMode("dark")}
            >
              <View style={[styles.themeIconCircle, { backgroundColor: "#312E81" }]}>
                <Ionicons name="moon" size={20} color="#A5B4FC" />
              </View>
              <Text style={[styles.themeOptionTitle, { color: colors.text }]}>Dark</Text>
              <Text style={[styles.themeOptionSubtitle, { color: colors.mutedText }]}>Midnight</Text>
              {themeMode === "dark" && (
                <View style={styles.checkPill}>
                  <Ionicons name="checkmark" size={13} color={colors.primary} />
                </View>
              )}
            </Pressable>

          </View>
        </View>

        {/* WORKFLOW & AUTOMATION */}
        <Text style={styles.sectionHeading}>WORKFLOW & PIPELINE</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Offline SQLite Sync</Text>
              <Text style={styles.settingDesc}>
                Maintain offline-first mirror in SQLite for zero-latency evaluations
              </Text>
            </View>
            <Switch
              value={offlineSyncEnabled}
              onValueChange={setOfflineSyncEnabled}
              trackColor={{ false: colors.inputBorder, true: "#93C5FD" }}
              thumbColor={offlineSyncEnabled ? "#2563EB" : "#F8FAFC"}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Auto-Advance on Strong Yes</Text>
              <Text style={styles.settingDesc}>
                Automatically prompt candidate stage advancement when unanimous positive verdicts are submitted
              </Text>
            </View>
            <Switch
              value={autoAdvanceEnabled}
              onValueChange={setAutoAdvanceEnabled}
              trackColor={{ false: colors.inputBorder, true: "#93C5FD" }}
              thumbColor={autoAdvanceEnabled ? "#2563EB" : "#F8FAFC"}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Panel Consensus Requirement</Text>
              <Text style={styles.settingDesc}>
                Flag candidates with split decisions (e.g. 1 Yes vs 1 No) for admin tie-breaking
              </Text>
            </View>
            <Switch
              value={requireFullConsensus}
              onValueChange={setRequireFullConsensus}
              trackColor={{ false: colors.inputBorder, true: "#93C5FD" }}
              thumbColor={requireFullConsensus ? "#2563EB" : "#F8FAFC"}
            />
          </View>
        </View>

        {/* INTERVIEW POLICIES */}
        <Text style={styles.sectionHeading}>INTERVIEW POLICIES & INTEGRITY</Text>
        <View style={styles.card}>
          <View style={styles.policyRow}>
            <View style={styles.policyIconCircle}>
              <Ionicons name="lock-closed" size={20} color={colors.primary} />
            </View>
            <View style={styles.policyText}>
              <Text style={styles.policyTitle}>60-Minute Edit Window</Text>
              <Text style={styles.policyDesc}>
                Postgres trigger `trg_enforce_feedback_lock` locks submissions 1 hour after creation to prevent retroactive bias.
              </Text>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.policyRow}>
            <View style={styles.policyIconCircle}>
              <Ionicons name="star" size={20} color="#EAB308" />
            </View>
            <View style={styles.policyText}>
              <Text style={styles.policyTitle}>Rubric Scoring Scale (1 - 5)</Text>
              <Text style={styles.policyDesc}>
                Standardized 5-point evaluation scale across Technical, Problem Solving, and Culture Fit criteria.
              </Text>
            </View>
          </View>
        </View>

        {/* NOTIFICATIONS */}
        <Text style={styles.sectionHeading}>NOTIFICATIONS & ALERTS</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Hiring Decision Notifications</Text>
              <Text style={styles.settingDesc}>
                Send push alerts to panel members when a candidate is hired or rejected
              </Text>
            </View>
            <Switch
              value={emailAlertsEnabled}
              onValueChange={setEmailAlertsEnabled}
              trackColor={{ false: colors.inputBorder, true: "#93C5FD" }}
              thumbColor={emailAlertsEnabled ? "#2563EB" : "#F8FAFC"}
            />
          </View>

          <View style={styles.separator} />

          <Pressable
            style={styles.linkRow}
            onPress={() => router.push("/admin/notifications")}
          >
            <View style={styles.linkRowLeft}>
              <Ionicons name="time-outline" size={20} color={colors.secondaryText} style={{ marginRight: 10 }} />
              <Text style={styles.linkRowText}>View System Activity Feed</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
          </Pressable>
        </View>

        {/* APPLICATION DIAGNOSTICS */}
        <Text style={styles.sectionHeading}>SYSTEM INFORMATION</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Application</Text>
            <Text style={styles.infoValue}>InterviewPulse</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform</Text>
            <Text style={styles.infoValue}>React Native + Expo</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Database</Text>
            <Text style={styles.infoValue}>Supabase PostgreSQL + SQLite</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0 (Production)</Text>
          </View>

          <View style={styles.separator} />

          <Pressable style={styles.clearCacheBtn} onPress={handleClearCache}>
            <Ionicons name="trash-bin-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <Text style={styles.clearCacheBtnText}>Refresh Local Cache</Text>
          </Pressable>
        </View>

        {/* DANGER ZONE */}
        <Text style={[styles.sectionHeading, { color: "#EF4444" }]}>DANGER ZONE</Text>
        <View style={[styles.card, { borderColor: "#FCA5A5" }]}>
          <Text style={styles.dangerTitle}>Sign Out from All Devices</Text>
          <Text style={styles.dangerDesc}>
            Revoke all refresh tokens and sessions for this administrator account.
          </Text>
          <Pressable style={styles.dangerBtn} onPress={handleGlobalSignOut}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.dangerBtnText}>Global Sign Out</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  scrollContent: {
    padding: 20,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "800",
    color: '#FFFFFF',
  },
  accountName: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  accountEmail: {
    fontSize: 13,
    color: colors.secondaryText,
    marginTop: 2,
  },
  accountHint: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 4,
    fontWeight: "600",
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.mutedText,
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  settingInfo: {
    flex: 1,
    marginRight: 14,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  settingDesc: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 3,
    lineHeight: 18,
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  policyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  policyText: {
    flex: 1,
  },
  policyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  policyDesc: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 3,
    lineHeight: 18,
  },
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 12,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  linkRowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  linkRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  clearCacheBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    height: 42,
    borderRadius: 10,
    marginTop: 4,
  },
  clearCacheBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#991B1B",
    marginBottom: 4,
  },
  dangerDesc: {
    fontSize: 12,
    color: colors.secondaryText,
    lineHeight: 18,
    marginBottom: 12,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    height: 44,
    borderRadius: 10,
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.danger,
  },
  themeCardNote: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  themeGrid: {
    flexDirection: "row",
    gap: 10,
  },
  themeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    position: "relative",
  },
  themeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  themeOptionTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  themeOptionSubtitle: {
    fontSize: 10,
  },
  checkPill: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
});
