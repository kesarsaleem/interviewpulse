import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'primary';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const tones = {
    neutral: { bg: colors.inputBackground, text: colors.secondaryText },
    success: { bg: colors.successLight, text: colors.success },
    warning: { bg: colors.warningLight, text: colors.warning },
    error: { bg: colors.dangerLight, text: colors.danger },
    primary: { bg: colors.primaryLight, text: colors.primary },
  };
  const c = tones[tone];
  return (
    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg }} accessibilityLabel={label}>
      <Text className="text-xs font-medium" style={{ color: c.text }}>{label}</Text>
    </View>
  );
}
