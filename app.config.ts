import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'InterviewPulse',
  slug: 'interviewpulse',
  scheme: 'interviewpulse',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  plugins: ['expo-router', 'expo-secure-store'],
  ios: { supportsTablet: false, bundleIdentifier: 'com.interviewpulse.app' },
  android: { package: 'com.interviewpulse.app' },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default config;
