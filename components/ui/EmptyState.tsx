import React from 'react';
import { View, Text } from 'react-native';
import { Inbox, LucideIcon } from 'lucide-react-native';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function EmptyState({ title, description, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-16 px-8">
      <View className="w-16 h-16 rounded-full bg-primary-50 items-center justify-center mb-4">
        <Icon size={28} color="#4F46E5" />
      </View>
      <Text className="text-text-primary font-semibold text-base text-center">{title}</Text>
      {description ? (
        <Text className="text-text-muted text-sm text-center mt-1">{description}</Text>
      ) : null}
    </View>
  );
}
