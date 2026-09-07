export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  cardBorder: string;
  text: string;
  secondaryText: string;
  mutedText: string;
  border: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  success: string;
  successLight: string;
  danger: string;
  dangerLight: string;
  warning: string;
  warningLight: string;
  info: string;
  infoLight: string;
  inputBackground: string;
  inputBorder: string;
  divider: string;
  headerBackground: string;
  headerBorder: string;
  tabBarBackground: string;
  tabBarBorder: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  text: '#0F172A',
  secondaryText: '#475569',
  mutedText: '#94A3B8',
  border: '#E2E8F0',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  primaryDark: '#1D4ED8',
  accent: '#3B82F6',
  success: '#10B981',
  successLight: '#ECFDF5',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  info: '#0EA5E9',
  infoLight: '#F0F9FF',
  inputBackground: '#F8FAFC',
  inputBorder: '#CBD5E1',
  divider: '#F1F5F9',
  headerBackground: '#FFFFFF',
  headerBorder: '#E2E8F0',
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors: ThemeColors = {
  background: '#0A1224',
  surface: '#15203B',
  card: '#15203B',
  cardBorder: '#23335A',
  text: '#F8FAFC',
  secondaryText: '#94A3B8',
  mutedText: '#64748B',
  border: '#23335A',
  primary: '#3B82F6',
  primaryLight: 'rgba(59, 130, 246, 0.18)',
  primaryDark: '#2563EB',
  accent: '#60A5FA',
  success: '#10B981',
  successLight: 'rgba(16, 185, 129, 0.18)',
  danger: '#F87171',
  dangerLight: 'rgba(239, 68, 68, 0.18)',
  warning: '#FBBF24',
  warningLight: 'rgba(245, 158, 11, 0.18)',
  info: '#38BDF8',
  infoLight: 'rgba(14, 165, 233, 0.18)',
  inputBackground: '#0F1830',
  inputBorder: '#2A3C66',
  divider: '#1E2D4F',
  headerBackground: '#101932',
  headerBorder: '#1E2D4F',
  tabBarBackground: '#101932',
  tabBarBorder: '#1E2D4F',
  overlay: 'rgba(0, 0, 0, 0.7)',
};
