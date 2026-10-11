-- PREPARED ONLY: outside the runnable migration chain; do not execute until separately approved.
-- Keep enum addition isolated; later migrations may safely use `draft` after commit.
SET lock_timeout = '5s';
SET statement_timeout = '120s';
ALTER TYPE risk_template_state ADD VALUE IF NOT EXISTS 'draft';
