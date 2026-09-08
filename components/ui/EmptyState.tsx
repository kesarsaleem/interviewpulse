import React from 'react';
import { View, Text } from 'react-native';
import { Inbox, LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function EmptyState({ title, description, icon: Icon = Inbox }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View className="items-center justify-center py-16 px-8">
      <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: colors.primaryLight }}>
        <Icon size={28} color={colors.primary} />
      </View>
      <Text className="font-semibold text-base text-center" style={{ color: colors.text }}>{title}</Text>
      {description ? (
        <Text className="text-sm text-center mt-1" style={{ color: colors.mutedText }}>{description}</Text>
      ) : null}
    </View>
  );
}
