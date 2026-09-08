import React from 'react';
import { View, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { OverallVerdict } from '../../types';
import { useTheme } from '../../context/ThemeContext';

const OPTIONS: { value: OverallVerdict; emoji: string; label: string }[] = [
  { value: 'strong_yes', emoji: '🙂', label: 'Strong Yes' },
  { value: 'maybe', emoji: '😐', label: 'Maybe' },
  { value: 'no', emoji: '😟', label: 'No' },
];

interface VerdictPickerProps {
  value: OverallVerdict | undefined;
  onChange: (v: OverallVerdict) => void;
}

export function VerdictPicker({ value, onChange }: VerdictPickerProps) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-3">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onChange(opt.value);
            }}
            accessibilityRole="radio"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected }}
            className="flex-1 items-center py-4 rounded-card border-2"
            style={{ backgroundColor: selected
                ? opt.value === 'strong_yes' ? colors.successLight : opt.value === 'maybe' ? colors.warningLight : colors.dangerLight
                : colors.card,
                borderColor: selected
                  ? opt.value === 'strong_yes' ? colors.success : opt.value === 'maybe' ? colors.warning : colors.danger
                  : colors.border }}
          >
            <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
            <Text className="mt-1 text-sm font-semibold" style={{ color: selected ? colors.text : colors.secondaryText }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
