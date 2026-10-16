-- Migration 001: Add token_version to users for JWT invalidation and remove payments tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Drop payments and webhooks tables
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS processed_webhooks CASCADE;
