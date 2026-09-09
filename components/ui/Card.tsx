import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export function Card({ children, className = '', ...rest }: ViewProps & { className?: string }) {
  const { colors } = useTheme();
  return (
    <View
      className={`rounded-card p-4 ${className}`}
      style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
      {...rest}
    >
      {children}
    </View>
  );
}
