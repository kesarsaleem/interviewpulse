import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, lightColors, darkColors } from '../theme/colors';
import { ThemeMode } from '../types';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase/client';
import { getDb } from '../lib/sqlite/schema';

interface ThemeContextValue {
  themeMode: ThemeMode;
  theme: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_PREFIX = 'interviewpulse_theme_mode_';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [deviceScheme, setDeviceScheme] = useState<'light' | 'dark'>(
    systemColorScheme === 'dark' ? 'dark' : 'light'
  );

  // Listen to system appearance changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  // When user changes (e.g. login/logout or switch between Admin & Interviewer),
  // load that specific user's theme preference!
  useEffect(() => {
    let isMounted = true;

    async function loadUserTheme() {
      if (!user?.id) {
        // Fallback for unauthenticated screens
        try {
          const guestTheme = (await AsyncStorage.getItem('interviewpulse_guest_theme')) as ThemeMode | null;
          if (isMounted && guestTheme) {
            setThemeModeState(guestTheme);
          }
        } catch {
          // ignore
        }
        return;
      }

      // 1. Check profile.theme_mode from user state
      if (user.theme_mode) {
        if (isMounted) setThemeModeState(user.theme_mode);
        return;
      }

      // 2. Check local SQLite mirror
      try {
        const db = getDb();
        const row = db.getFirstSync<{ theme_mode: string | null }>(
          'SELECT theme_mode FROM profiles WHERE id = ?',
          [user.id]
        );
        if (row?.theme_mode && isMounted) {
          setThemeModeState(row.theme_mode as ThemeMode);
          return;
        }
      } catch {
        // column may not exist yet or db locked
      }

      // 3. Check AsyncStorage scoped by user ID
      try {
        const stored = (await AsyncStorage.getItem(THEME_STORAGE_PREFIX + user.id)) as ThemeMode | null;
        if (stored && isMounted) {
          setThemeModeState(stored);
        }
      } catch {
        // ignore
      }
    }

    loadUserTheme();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.theme_mode]);

  // Handler to switch theme mode
  const setThemeMode = async (newMode: ThemeMode) => {
    setThemeModeState(newMode);

    if (!user?.id) {
      try {
        await AsyncStorage.setItem('interviewpulse_guest_theme', newMode);
      } catch {
        // ignore
      }
      return;
    }

    // 1. Save to AsyncStorage per user
    try {
      await AsyncStorage.setItem(THEME_STORAGE_PREFIX + user.id, newMode);
    } catch {
      // ignore
    }

    // 2. Save to local SQLite mirror
    try {
      const db = getDb();
      db.runSync('UPDATE profiles SET theme_mode = ?, updated_at = ? WHERE id = ?', [
        newMode,
        new Date().toISOString(),
        user.id,
      ]);
    } catch {
      // non-blocking
    }

    // 3. Save to Supabase profiles
    try {
      await supabase
        .from('profiles')
        .update({
          theme_mode: newMode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    } catch (err) {
      console.log('Error updating theme_mode on Supabase:', err);
    }
  };

  // Determine active theme ('light' or 'dark')
  const activeTheme: 'light' | 'dark' = useMemo(() => {
    if (themeMode === 'system') {
      return deviceScheme;
    }
    return themeMode;
  }, [themeMode, deviceScheme]);

  const colors = activeTheme === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        theme: activeTheme,
        isDark: activeTheme === 'dark',
        colors,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      themeMode: 'system' as ThemeMode,
      theme: 'light' as const,
      isDark: false,
      colors: lightColors,
      setThemeMode: async () => {},
    };
  }
  return ctx;
}
