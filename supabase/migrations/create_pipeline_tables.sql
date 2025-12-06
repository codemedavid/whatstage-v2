-- Migration: Create pipeline tables for auto-pipeline feature
-- Run this in Supabase SQL Editor

-- 1. Pipeline Stages Table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#64748b',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pipeline stages
INSERT INTO pipeline_stages (name, display_order, color, is_default) VALUES
  ('New Lead', 0, '#3b82f6', true),
  ('Interested', 1, '#8b5cf6', false),
  ('Qualified', 2, '#f59e0b', false),
  ('Negotiating', 3, '#10b981', false),
  ('Won', 4, '#22c55e', false),
  ('Lost', 5, '#ef4444', false)
ON CONFLICT DO NOTHING;

-- 2. Leads Table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL UNIQUE,
  name TEXT,
  profile_pic TEXT,
  current_stage_id UUID REFERENCES pipeline_stages(id),
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ,
  ai_classification_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_sender_id ON leads(sender_id);
CREATE INDEX IF NOT EXISTS idx_leads_current_stage ON leads(current_stage_id);

-- 3. Lead Stage History (Audit Trail)
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id),
  to_stage_id UUID REFERENCES pipeline_stages(id),
  reason TEXT,
  changed_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id);

-- 4. Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (allow all for now - customize based on your auth)
CREATE POLICY "Allow all operations on pipeline_stages" ON pipeline_stages
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on lead_stage_history" ON lead_stage_history
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Triggers for updated_at
DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
