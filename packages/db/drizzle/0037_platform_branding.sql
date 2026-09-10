-- Platform-wide product branding.
-- Stored separately from tenant branding so the SaaS product identity
-- can be managed independently of individual customer workspaces.

ALTER TABLE "platform_settings"
ADD COLUMN IF NOT EXISTS "branding" jsonb NOT NULL DEFAULT '{}'::jsonb;
