import React from 'react';
import { Pressable, Text, ActivityIndicator, PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary active:bg-primary-700',
  secondary: 'bg-accent active:bg-accent-600',
  outline: 'bg-transparent border border-border active:bg-background',
  danger: 'bg-error active:opacity-90',
  ghost: 'bg-transparent active:bg-background',
};

const textVariantClasses: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  outline: 'text-white',
  danger: 'text-white',
  ghost: 'text-purple-400',
};
const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-2 min-h-[40px]',
  md: 'px-4 py-3 min-h-[48px]',
  lg: 'px-5 py-4 min-h-[56px]',
};

/**
 * Base button. Enforces a minimum 40px touch target and gives light
 * haptic feedback on press for a "premium" feel — never used for
 * decoration, only for confirmed taps.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  icon,
  onPress,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const activityColor = variant === 'outline' || variant === 'ghost' ? colors.primary : '#FFFFFF';
  const variantStyle = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.accent },
    outline: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
    danger: { backgroundColor: colors.danger },
    ghost: { backgroundColor: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      className={[
        'flex-row items-center justify-center rounded-control',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        disabled || loading ? 'opacity-50' : '',
      ].join(' ')}
      style={variantStyle}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={activityColor} />
      ) : (
        <>
          {icon}
          <Text className={['font-semibold text-base', textVariantClasses[variant], icon ? 'ml-2' : ''].join(' ')}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
