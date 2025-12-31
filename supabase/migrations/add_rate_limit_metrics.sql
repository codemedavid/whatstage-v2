-- Rate Limit Metrics table for tracking API usage
-- Used for proactive throttling and monitoring

CREATE TABLE IF NOT EXISTS rate_limit_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'nvidia',
    window_start TIMESTAMPTZ NOT NULL,      -- Start of the time window (minute granularity)
    request_count INTEGER DEFAULT 0,        -- Total requests in this window
    success_count INTEGER DEFAULT 0,        -- Successful requests
    error_count INTEGER DEFAULT 0,          -- Failed requests (non-rate-limit)
    rate_limit_count INTEGER DEFAULT 0,     -- Rate limit errors (429)
    total_latency_ms BIGINT DEFAULT 0,      -- Sum of latencies for avg calculation
    min_latency_ms INTEGER,                 -- Minimum latency in window
    max_latency_ms INTEGER,                 -- Maximum latency in window
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient time-based queries
CREATE INDEX IF NOT EXISTS idx_rate_metrics_window 
ON rate_limit_metrics(provider, window_start DESC);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_rate_metrics_provider_recent 
ON rate_limit_metrics(provider, created_at DESC);

-- Enable RLS
ALTER TABLE rate_limit_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can read/write, authenticated users can read
CREATE POLICY "Service role full access" ON rate_limit_metrics
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read access" ON rate_limit_metrics
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Function to upsert metrics for a time window
CREATE OR REPLACE FUNCTION upsert_rate_metric(
    p_provider TEXT,
    p_window_start TIMESTAMPTZ,
    p_latency_ms INTEGER,
    p_is_error BOOLEAN DEFAULT false,
    p_is_rate_limit BOOLEAN DEFAULT false
)
RETURNS void AS $$
BEGIN
    INSERT INTO rate_limit_metrics (
        provider, 
        window_start, 
        request_count, 
        success_count,
        error_count, 
        rate_limit_count, 
        total_latency_ms,
        min_latency_ms,
        max_latency_ms
    )
    VALUES (
        p_provider,
        p_window_start,
        1,
        CASE WHEN NOT p_is_error AND NOT p_is_rate_limit THEN 1 ELSE 0 END,
        CASE WHEN p_is_error AND NOT p_is_rate_limit THEN 1 ELSE 0 END,
        CASE WHEN p_is_rate_limit THEN 1 ELSE 0 END,
        p_latency_ms,
        p_latency_ms,
        p_latency_ms
    )
    ON CONFLICT (provider, window_start) 
    DO UPDATE SET
        request_count = rate_limit_metrics.request_count + 1,
        success_count = rate_limit_metrics.success_count + 
            CASE WHEN NOT p_is_error AND NOT p_is_rate_limit THEN 1 ELSE 0 END,
        error_count = rate_limit_metrics.error_count + 
            CASE WHEN p_is_error AND NOT p_is_rate_limit THEN 1 ELSE 0 END,
        rate_limit_count = rate_limit_metrics.rate_limit_count + 
            CASE WHEN p_is_rate_limit THEN 1 ELSE 0 END,
        total_latency_ms = rate_limit_metrics.total_latency_ms + p_latency_ms,
        min_latency_ms = LEAST(rate_limit_metrics.min_latency_ms, p_latency_ms),
        max_latency_ms = GREATEST(rate_limit_metrics.max_latency_ms, p_latency_ms);
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for upsert
ALTER TABLE rate_limit_metrics 
ADD CONSTRAINT rate_limit_metrics_provider_window_unique 
UNIQUE (provider, window_start);

-- Cleanup function to remove old metrics (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_rate_metrics()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_metrics
    WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE rate_limit_metrics IS 'Tracks API request metrics per minute for rate limit monitoring';
COMMENT ON COLUMN rate_limit_metrics.window_start IS 'Start of the 1-minute window';
COMMENT ON COLUMN rate_limit_metrics.total_latency_ms IS 'Sum of all latencies - divide by request_count for average';
