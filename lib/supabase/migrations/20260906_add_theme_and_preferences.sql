-- =========================================================================
-- Migration: Add theme_mode and interview preferences to profiles table
-- Date: 2026-09-06
-- =========================================================================

-- 1. Add theme_mode column ('light' | 'dark' | 'system')
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_mode text DEFAULT 'system';

-- 2. Add default_interview_mode column ('video' | 'phone' | 'onsite')
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_interview_mode text DEFAULT 'video';

-- 3. Add default_duration column (e.g. 30, 45, 60 minutes)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_duration integer DEFAULT 45;

-- 4. Create index for fast profile queries
CREATE INDEX IF NOT EXISTS idx_profiles_theme_mode ON public.profiles (theme_mode);
