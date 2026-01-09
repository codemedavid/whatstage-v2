-- Migration: Add nvidia_api_key column to bot_settings
-- This allows each user to have their own dedicated NVIDIA API key for messaging
-- Fallback hierarchy: user key -> rotation pool -> .env

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS nvidia_api_key TEXT;

-- Add index for faster lookups 
CREATE INDEX IF NOT EXISTS idx_bot_settings_nvidia_api_key 
ON bot_settings(user_id) WHERE nvidia_api_key IS NOT NULL;

COMMENT ON COLUMN bot_settings.nvidia_api_key IS 'User dedicated NVIDIA API key for messaging. Falls back to rotation pool then .env if null/failed.';
