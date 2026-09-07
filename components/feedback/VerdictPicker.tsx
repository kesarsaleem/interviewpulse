import React from 'react';
import { View, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { OverallVerdict } from '../../types';

const OPTIONS: { value: OverallVerdict; emoji: string; label: string; activeClass: string }[] = [
  { value: 'strong_yes', emoji: '🙂', label: 'Strong Yes', activeClass: 'bg-green-50 border-success' },
  { value: 'maybe', emoji: '😐', label: 'Maybe', activeClass: 'bg-amber-50 border-warning' },
  { value: 'no', emoji: '😟', label: 'No', activeClass: 'bg-red-50 border-error' },
];

interface VerdictPickerProps {
  value: OverallVerdict | undefined;
  onChange: (v: OverallVerdict) => void;
}

export function VerdictPicker({ value, onChange }: VerdictPickerProps) {
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
            className={[
              'flex-1 items-center py-4 rounded-card border-2',
              selected ? opt.activeClass : 'bg-surface border-border',
            ].join(' ')}
          >
            <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
            <Text className={`mt-1 text-sm font-semibold ${selected ? 'text-text-primary' : 'text-text-secondary'}`}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
