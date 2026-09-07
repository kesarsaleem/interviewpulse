import React from 'react';
import { View, ViewProps } from 'react-native';

export function Card({ children, className = '', ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`bg-surface rounded-card border border-border p-4 ${className}`}
      style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
      {...rest}
    >
      {children}
    </View>
  );
}
