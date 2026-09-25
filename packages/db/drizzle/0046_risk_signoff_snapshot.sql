-- Preserve the exact assessment content used by each immutable Risk sign-off.
-- Nullable only for compatibility with any sign-offs created before this forward migration;
-- all application-created sign-offs after this migration include the snapshot.
ALTER TABLE "risk_assessment_signoffs"
  ADD COLUMN "snapshot" jsonb;
