import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Logo from "../../components/ui/Logo";
import GradientBackground from "../../components/ui/GradientBackground";
import { useAuth } from "../../hooks/useAuth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const validate = () => {
    let valid = true;

    if (!email.trim()) {
      setEmailError("Email is required");
      valid = false;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Enter a valid email address");
      valid = false;
    }

    if (!password) {
      setPasswordError("Password is required");
      valid = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      valid = false;
    }

    return valid;
  };

  const handleLogin = async () => {
    setError("");
    setEmailError("");
    setPasswordError("");

    if (!validate()) return;

    try {
      setLoading(true);

      const { error } = await signIn(
        email.trim().toLowerCase(),
        password
      );

      if (error) {
        setError(
          typeof error === "string"
            ? error
            : "Invalid email or password"
        );
      }
    } catch {
      setError("Unable to login. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Logo />

            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>
              Login to continue to InterviewPulse
            </Text>

            <View style={styles.line} />

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Email</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setEmailError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {emailError ? (
              <Text style={styles.fieldError}>{emailError}</Text>
            ) : null}

            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordBox}>
              <TextInput
                style={styles.inputPassword}
                placeholder="Enter your password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setPasswordError("");
                }}
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

            {passwordError ? (
              <Text style={styles.fieldError}>{passwordError}</Text>
            ) : null}

            <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>

            <Pressable
              style={[styles.button, loading && styles.disabled]}
              disabled={loading}
              onPress={handleLogin}
            >
              <Text style={styles.buttonText}>
                {loading ? "Logging in..." : "Login"}
              </Text>
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  scroll:{flexGrow:1,justifyContent:"center",padding:15},
  card:{
    backgroundColor:"rgba(255,255,255,0.95)",
    borderRadius:30,
    padding:28,
    elevation:8,
  },
  title:{fontSize:32,fontWeight:"900",color:"#1E3A8A",marginTop:20},
  subtitle:{color:"#64748B",marginTop:6},
  line:{width:50,height:4,backgroundColor:"#2563EB",marginVertical:25},
  label:{fontWeight:"700",marginBottom:8,color:"#1E293B"},
  input:{
    height:55,
    backgroundColor:"#fff",
    borderRadius:16,
    paddingHorizontal:18,
    marginBottom:12,
     borderWidth:1,
  borderColor:"#CBD5E1",

  },
  passwordBox:{
    flexDirection:"row",
    alignItems:"center",
    backgroundColor:"#fff",
    borderRadius:16,
    paddingHorizontal:18,
    borderWidth:1,
  borderColor:"#CBD5E1",
  },
  inputPassword:{flex:1,height:55},
  errorBox:{
    flexDirection:"row",
    gap:8,
    backgroundColor:"#FEF2F2",
    padding:12,
    borderRadius:12,
  },
  error:{color:"#DC2626",flex:1},
  fieldError:{color:"#DC2626",fontSize:12},
  forgot:{textAlign:"right",color:"#2563EB",marginVertical:18},
  button:{
    height:58,
    backgroundColor:"#2563EB",
    borderRadius:18,
    alignItems:"center",
    justifyContent:"center",
  },
  disabled:{opacity:.6},
  buttonText:{color:"#fff",fontWeight:"800",fontSize:18},
  signupRow:{flexDirection:"row",justifyContent:"center",marginTop:25},
  bottomText:{color:"#64748B"},
  signup:{color:"#2563EB",fontWeight:"800",marginLeft:5},
});
