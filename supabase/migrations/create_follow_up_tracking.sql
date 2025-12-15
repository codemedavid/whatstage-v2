-- ============================================================================
-- FOLLOW-UP TRACKING MIGRATION
-- Adds columns and tables for intelligent auto follow-up system with ML timing
-- ============================================================================

-- Add follow-up tracking columns to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS last_bot_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

-- Create index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_leads_follow_up 
  ON leads(next_follow_up_at) 
  WHERE follow_up_enabled = true AND next_follow_up_at IS NOT NULL;

-- ============================================================================
-- FOLLOW-UP RESPONSE PATTERNS TABLE
-- Tracks when customers typically respond for ML-based timing optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_response_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  
  -- Time tracking
  follow_up_sent_at TIMESTAMPTZ NOT NULL,
  response_received_at TIMESTAMPTZ,
  response_delay_minutes INT,  -- Calculated when response received
  
  -- Context for ML learning
  hour_of_day INT,             -- 0-23, when follow-up was sent
  day_of_week INT,             -- 0-6, Sunday=0
  follow_up_attempt INT,       -- Which attempt number (1, 2, 3...)
  message_type TEXT,           -- 'value_question', 'curiosity', 'offer', etc.
  
  -- Outcome
  did_respond BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pattern analysis
CREATE INDEX IF NOT EXISTS idx_response_patterns_sender ON follow_up_response_patterns(sender_id);
CREATE INDEX IF NOT EXISTS idx_response_patterns_lead ON follow_up_response_patterns(lead_id);
CREATE INDEX IF NOT EXISTS idx_response_patterns_hour ON follow_up_response_patterns(hour_of_day);
CREATE INDEX IF NOT EXISTS idx_response_patterns_responded ON follow_up_response_patterns(did_respond) 
  WHERE did_respond = true;

-- Enable RLS
ALTER TABLE follow_up_response_patterns ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on follow_up_response_patterns" ON follow_up_response_patterns
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- GLOBAL FOLLOW-UP SETTINGS TABLE
-- Customizable timing configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Base timing intervals (in minutes) - these are starting points
  base_intervals INT[] DEFAULT ARRAY[5, 15, 30, 60, 120, 240, 480],
  
  -- Minimum time between follow-ups (respects customer preference)
  min_interval_minutes INT DEFAULT 5,
  
  -- Maximum time to wait (prevents infinite delays)
  max_interval_minutes INT DEFAULT 1440,  -- 24 hours max
  
  -- Active hours (don't message at night)
  active_hours_start TIME DEFAULT '08:00:00',
  active_hours_end TIME DEFAULT '21:00:00',
  
  -- ML learning settings
  ml_learning_enabled BOOLEAN DEFAULT true,
  ml_weight_recent FLOAT DEFAULT 0.7,     -- Weight for recent patterns vs global
  
  -- Enable/disable globally
  is_enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO follow_up_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_follow_up_settings_updated_at ON follow_up_settings;
CREATE TRIGGER update_follow_up_settings_updated_at
  BEFORE UPDATE ON follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE follow_up_response_patterns IS 'Tracks customer response patterns for ML-based timing optimization';
COMMENT ON TABLE follow_up_settings IS 'Global configuration for auto follow-up timing and behavior';
COMMENT ON COLUMN leads.next_follow_up_at IS 'Calculated optimal time for next follow-up based on ML patterns';
