import React, { useEffect, useRef, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import Logo from "../../components/ui/Logo";
import GradientBackground from "../../components/ui/GradientBackground";
import { supabase } from "../../lib/supabase/client";

/**
 * Landing screen for the "forgot password" email link.
 *
 * Supabase sends the user back to `redirectTo` (see hooks/useAuth.tsx,
 * resetPassword) with either:
 *  - `access_token` + `refresh_token` in the URL (implicit flow), or
 *  - a `code` param (PKCE flow) that must be exchanged for a session.
 *
 * The Supabase client is configured with `detectSessionInUrl: false`
 * (required on native), so we parse the incoming URL ourselves and
 * establish the session before letting the user set a new password.
 */
export default function ResetPasswordScreen() {
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handledUrl = useRef(false);

  const establishSessionFromUrl = async (url: string | null) => {
    if (!url || handledUrl.current) return;

    try {
      const parsed = Linking.parse(url);
      // Supabase puts implicit-flow tokens after a `#`, which Linking.parse
      // exposes via queryParams once the fragment is normalized to a query
      // string; PKCE flow uses a plain `?code=...` query param instead.
      const params: Record<string, any> = parsed.queryParams || {};

      const accessToken = params.access_token as string | undefined;
      const refreshToken = params.refresh_token as string | undefined;
      const code = params.code as string | undefined;

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        handledUrl.current = true;
        setLinkValid(true);
      } else if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        handledUrl.current = true;
        setLinkValid(true);
      } else {
        // No recognizable auth params — maybe the user opened this screen
        // directly, or is already mid-session from a prior successful link.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          handledUrl.current = true;
          setLinkValid(true);
        } else {
          setLinkError(
            "This reset link is invalid or has already been used."
          );
        }
      }
    } catch (err: any) {
      setLinkError(
        err?.message ||
          "This reset link is invalid or has expired. Please request a new one."
      );
    } finally {
      setCheckingLink(false);
    }
  };

  useEffect(() => {
    Linking.getInitialURL().then(establishSessionFromUrl);

    const sub = Linking.addEventListener("url", (event) => {
      establishSessionFromUrl(event.url);
    });

    // Safety net: if no URL event fires (e.g. simulator quirks) stop the
    // spinner after a few seconds instead of hanging forever.
    const timeout = setTimeout(() => setCheckingLink(false), 4000);

    return () => {
      sub.remove();
      clearTimeout(timeout);
    };
  }, []);

  const handleSetPassword = async () => {
    setError("");

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setSaving(true);
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message || "Unable to update password");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace("/(auth)/login");
      }, 1800);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Logo />

            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              Choose a new password for your InterviewPulse account
            </Text>

            <View style={styles.line} />

            {checkingLink ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color="#2563EB" />
                <Text style={styles.checkingText}>
                  Verifying your reset link...
                </Text>
              </View>
            ) : !linkValid ? (
              <View>
                <View style={styles.errorBox}>
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color="#DC2626"
                  />
                  <Text style={styles.error}>{linkError}</Text>
                </View>

                <Pressable
                  style={styles.button}
                  onPress={() => router.replace("/(auth)/forgot-password")}
                >
                  <Text style={styles.buttonText}>Request a new link</Text>
                </Pressable>
              </View>
            ) : success ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                <Text style={styles.success}>
                  Password updated! Redirecting to login...
                </Text>
              </View>
            ) : (
              <>
                {error ? (
                  <View style={styles.errorBox}>
                    <Ionicons
                      name="alert-circle"
                      size={20}
                      color="#DC2626"
                    />
                    <Text style={styles.error}>{error}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>New Password</Text>
                <View style={styles.passwordBox}>
                  <TextInput
                    style={styles.inputPassword}
                    placeholder="Enter new password"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color="#64748B"
                    />
                  </Pressable>
                </View>

                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.passwordBox}>
                  <TextInput
                    style={styles.inputPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#94A3B8"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                  />
                </View>

                <Pressable
                  style={[styles.button, saving && styles.disabled]}
                  disabled={saving}
                  onPress={handleSetPassword}
                >
                  <Text style={styles.buttonText}>
                    {saving ? "Saving..." : "Set New Password"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 25 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 28,
    borderWidth: 1,
    borderColor: "#475569",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#1E3A8A",
    marginTop: 20,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    marginTop: 8,
    lineHeight: 22,
  },
  line: {
    width: 50,
    height: 4,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    marginVertical: 25,
  },
  centerBox: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12,
  },
  checkingText: {
    color: "#64748B",
    fontSize: 14,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  passwordBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 18,
    height: 55,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginBottom: 18,
  },
  inputPassword: { flex: 1, fontSize: 16 },
  button: {
    height: 58,
    backgroundColor: "#2563EB",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
  },
  error: { color: "#DC2626", flex: 1 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 12,
  },
  success: { color: "#16A34A", flex: 1 },
});
