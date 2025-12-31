-- API Keys table for key rotation
-- Allows multiple API keys per provider with automatic cooldown management

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'nvidia',
    api_key TEXT NOT NULL,
    name TEXT,                              -- Friendly name, e.g., "nvidia-key-1"
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,             -- Higher = preferred when multiple available
    rate_limit_hits INTEGER DEFAULT 0,      -- Track how many times this key hit rate limits
    last_rate_limited_at TIMESTAMPTZ,       -- When it last hit a rate limit
    cooldown_until TIMESTAMPTZ,             -- Key unavailable until this time
    requests_today INTEGER DEFAULT 0,       -- Daily request counter
    last_request_date DATE,                 -- For resetting daily counter
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient key selection
CREATE INDEX IF NOT EXISTS idx_api_keys_active_provider 
ON api_keys(provider, is_active, cooldown_until);

-- Index for finding available keys
CREATE INDEX IF NOT EXISTS idx_api_keys_available 
ON api_keys(provider, is_active, priority DESC) 
WHERE is_active = true;

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (API keys are sensitive)
CREATE POLICY "Service role access only" ON api_keys
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS api_keys_updated_at ON api_keys;
CREATE TRIGGER api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();

-- Insert initial key from environment (will be populated by app if not exists)
-- This is a placeholder - actual key should be added via admin or migration

COMMENT ON TABLE api_keys IS 'Stores API keys for AI providers with rotation and cooldown support';
COMMENT ON COLUMN api_keys.cooldown_until IS 'Key is unavailable until this timestamp (after hitting rate limit)';
COMMENT ON COLUMN api_keys.priority IS 'Higher priority keys are preferred. Use for load balancing.';
