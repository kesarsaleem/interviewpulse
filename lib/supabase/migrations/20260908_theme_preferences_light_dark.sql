-- Normalize persisted preferences to the supported per-user choices.
ALTER TABLE public.profiles
  ALTER COLUMN theme_mode SET DEFAULT 'light';

UPDATE public.profiles
SET theme_mode = 'light'
WHERE theme_mode IS NULL OR theme_mode NOT IN ('light', 'dark');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_theme_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_mode_check
  CHECK (theme_mode IN ('light', 'dark'));
