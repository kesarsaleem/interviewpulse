import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import type { Profile } from '../types';

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;

  signOut: () => Promise<void>;

  refreshUser: () => Promise<void>;

  resetPassword: (
    email: string
  ) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    console.log("PROFILE DATA:", data);
    console.log("PROFILE ERROR:", error);

    if (data) {
      try {
        const { getDb } = require('../lib/sqlite/schema');
        const db = getDb();

        db.runSync(
          `INSERT OR REPLACE INTO profiles 
          (id, name, email, role, avatar_url, theme_mode, default_interview_mode, default_duration, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.id,
            data.name,
            data.email,
            data.role,
            data.avatar_url ?? null,
            data.theme_mode === 'dark' ? 'dark' : 'light',
            data.default_interview_mode ?? 'video',
            data.default_duration ?? 45,
            data.created_at ?? '',
            data.updated_at ?? ''
          ]
        );
      } catch {
        // non-blocking
      }
    }

    setUser(data as Profile | null);
  };

  const refreshUser = async () => {
    if (user?.id) {
      await loadProfile(user.id);
    } else {
      const { data } = await supabase.auth.getSession();

      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        loadProfile(data.session.user.id)
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          loadProfile(session.user.id);
        } else {
          setUser(null);
        }
      }
    );

    return () => sub.subscription.unsubscribe();

  }, []);

  const signIn = async (
    email: string,
    password: string
  ) => {

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    return {
      error: error
        ? humanizeAuthError(error.message)
        : null
    };
  };


  const resetPassword = async (
    email: string
  ) => {

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email
        );

      return {
        error: error
          ? humanizeAuthError(error.message)
          : null
      };
    } catch (err) {
      // Catches thrown exceptions (e.g. network-level failures) that
      // don't come back as a normal {error} result.
      const message = err instanceof Error ? err.message : String(err);
      return { error: humanizeAuthError(message) };
    }
  };


  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };


  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        refreshUser,
        resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


function humanizeAuthError(message: string | undefined | null): string {

  const safeMessage = message ?? '';
  const lower = safeMessage.toLowerCase();

  console.error('Auth error (raw):', safeMessage);

  if (lower.includes('invalid login')) {
    return 'Incorrect email or password.';
  }

  if (lower.includes('network')) {
    return 'No internet connection. Try again once online.';
  }

  if (lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a bit before trying again.';
  }

  if (lower.includes('user not found') || lower.includes('unable to validate')) {
    return 'No account found with that email address.';
  }

  if (lower.includes('email') && lower.includes('invalid')) {
    return `Supabase couldn't accept that email address (${safeMessage}). Try a different email.`;
  }

  // Fall back to the real server message instead of a generic string,
  // so the actual reason is visible instead of being hidden.
  return safeMessage || 'Something went wrong. Please try again.';
}


export function useAuth() {

  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return ctx;
}
