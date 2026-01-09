-- Webhook Optimization Migration
-- Adds distributed deduplication table and unique constraint for leads

-- 1. Create table for distributed webhook message deduplication
CREATE TABLE IF NOT EXISTS processed_webhook_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT processed_webhook_messages_message_id_key UNIQUE (message_id)
);

-- Index for faster lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_processed_webhook_messages_processed_at 
    ON processed_webhook_messages(processed_at);

-- 2. Add unique constraint on leads for sender_id + user_id
-- This prevents race conditions when creating leads for the same sender
-- First, clean up any existing duplicates (keep the oldest one)
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY sender_id, user_id 
        ORDER BY created_at ASC
    ) as rn
    FROM leads
    WHERE user_id IS NOT NULL
)
DELETE FROM leads WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Handle leads with NULL user_id separately (keep oldest per sender_id)
WITH null_user_duplicates AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY sender_id 
        ORDER BY created_at ASC
    ) as rn
    FROM leads
    WHERE user_id IS NULL
)
DELETE FROM leads WHERE id IN (
    SELECT id FROM null_user_duplicates WHERE rn > 1
);

-- Now add the unique constraint
-- Using COALESCE to handle NULL user_id values
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_sender_user_unique;

-- Create a unique index that handles NULL user_id
CREATE UNIQUE INDEX IF NOT EXISTS leads_sender_user_unique_idx 
    ON leads(sender_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'));

-- 3. Grant permissions for RLS bypass (service role already has access)
-- No additional grants needed as we use supabaseAdmin

-- 4. Add RLS policy for processed_webhook_messages (server-only table)
ALTER TABLE processed_webhook_messages ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table
CREATE POLICY "Service role only" ON processed_webhook_messages
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
