import React from 'react';
import { View, Pressable } from 'react-native';
import { Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface StarRatingProps {
  value: number; // 0-5
  onChange: (value: number) => void;
  label: string;
}

/**
 * 0-5 star rating. Each star is its own accessible button (not a single
 * slider) so screen readers announce "Rate Communication 3 of 5 stars"
 * rather than relying on visual fill alone.
 */
export function StarRating({ value, onChange, label }: StarRatingProps) {
  return (
    <View className="flex-row" accessibilityRole="adjustable" accessibilityLabel={`${label} rating`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Pressable
            key={star}
            onPress={() => {
              Haptics.selectionAsync();
              // Tapping the currently-set star clears back to 0.
              onChange(value === star ? 0 : star);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
            accessibilityState={{ selected: filled }}
            hitSlop={8}
            className="p-1"
          >
            <Star size={28} color={filled ? '#D97706' : '#D1D5DB'} fill={filled ? '#D97706' : 'transparent'} />
          </Pressable>
        );
      })}
    </View>
  );
}
