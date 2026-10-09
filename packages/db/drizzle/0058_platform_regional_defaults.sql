-- Additive platform configuration only. Existing tenant values and RLS are unchanged.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS regional_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;
