-- Pipeline Events Table for debugging and analytics
-- Created: 2026-01-04
-- Purpose: Track pipeline activity for debugging and operational insights

CREATE TABLE IF NOT EXISTS pipeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'stage_change', 'analysis_triggered', 'workflow_triggered', 'profile_fetched'
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pipeline_events_lead ON pipeline_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_user ON pipeline_events(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_type ON pipeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_created ON pipeline_events(created_at DESC);

-- Enable RLS
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy - users see only their events
CREATE POLICY "Users can view their own pipeline events" ON pipeline_events
    FOR SELECT USING (user_id = auth.uid());

-- Allow service role full access for logging
CREATE POLICY "Service role full access on pipeline_events" ON pipeline_events
    FOR ALL USING (true) WITH CHECK (true);
