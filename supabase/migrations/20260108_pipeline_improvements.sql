-- Pipeline Improvements Migration
-- Adds confidence scoring, lead scoring, and stage priority fields

-- Add confidence scoring and lead scoring fields to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_alternative_stage TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS intent_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qualification_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Add priority order to pipeline_stages for regression prevention
ALTER TABLE pipeline_stages
ADD COLUMN IF NOT EXISTS priority_order INTEGER DEFAULT 0;

-- Update default stages with priority order (higher = more progressed)
-- Using ILIKE for case-insensitive matching
UPDATE pipeline_stages SET priority_order = 1 WHERE name ILIKE '%new%' AND priority_order = 0;
UPDATE pipeline_stages SET priority_order = 2 WHERE name ILIKE '%interested%' AND priority_order = 0;
UPDATE pipeline_stages SET priority_order = 3 WHERE name ILIKE '%qualified%' AND priority_order = 0;
UPDATE pipeline_stages SET priority_order = 4 WHERE name ILIKE '%appointment%' AND priority_order = 0;
UPDATE pipeline_stages SET priority_order = 5 WHERE name ILIKE '%payment%' AND priority_order = 0;
UPDATE pipeline_stages SET priority_order = 6 WHERE (name ILIKE '%convert%' OR name ILIKE '%closed%' OR name ILIKE '%won%') AND priority_order = 0;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ai_confidence ON leads(ai_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_priority ON pipeline_stages(priority_order ASC);

-- Add comment for documentation
COMMENT ON COLUMN leads.ai_confidence IS 'LLM confidence score (0-1) for the current stage classification';
COMMENT ON COLUMN leads.lead_score IS 'Combined lead score (0-100) based on engagement, intent, and qualification';
COMMENT ON COLUMN pipeline_stages.priority_order IS 'Order for stage progression (higher = further in funnel, used for regression prevention)';
