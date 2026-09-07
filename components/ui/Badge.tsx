import React from 'react';
import { View, Text } from 'react-native';

type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'primary';

const toneClasses: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: 'bg-gray-100', text: 'text-text-secondary' },
  success: { bg: 'bg-green-50', text: 'text-success' },
  warning: { bg: 'bg-amber-50', text: 'text-warning' },
  error: { bg: 'bg-red-50', text: 'text-error' },
  primary: { bg: 'bg-primary-50', text: 'text-primary' },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneClasses[tone];
  return (
    <View className={`px-2.5 py-1 rounded-full ${c.bg}`} accessibilityLabel={label}>
      <Text className={`text-xs font-medium ${c.text}`}>{label}</Text>
    </View>
  );
}
