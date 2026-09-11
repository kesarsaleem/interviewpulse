import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'InterviewPulse',
  slug: 'interviewpulse',
  scheme: 'interviewpulse',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/app_icon.png',
  plugins: ['expo-router', 'expo-secure-store'],
  ios: { supportsTablet: false, bundleIdentifier: 'com.interviewpulse.app' },
  android: {
    package: 'com.interviewpulse.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/app_icon.png',
      backgroundColor: '#FFFFFF',
    },
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,

    eas: {
    projectId: '66a4ce11-f2e2-46ad-82db-0e602a4d245b',
  },
  },
  
};

export default config;
