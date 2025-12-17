-- ============================================================================
-- LEAD ENTITIES TABLE
-- Stores structured facts extracted from conversations for consistent personalization
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('name', 'preference', 'budget', 'interest', 'contact', 'custom')),
  entity_key TEXT NOT NULL,  -- e.g., 'preferred_property_type', 'budget_range', 'full_name'
  entity_value TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT DEFAULT 'ai_extraction' CHECK (source IN ('ai_extraction', 'user_provided', 'form_submission', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, entity_type, entity_key)
);

-- Index for fast retrieval by sender
CREATE INDEX IF NOT EXISTS idx_lead_entities_sender_id ON lead_entities(sender_id);
CREATE INDEX IF NOT EXISTS idx_lead_entities_type ON lead_entities(entity_type);

-- Enable RLS
ALTER TABLE lead_entities ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations
CREATE POLICY "Allow all operations on lead_entities" ON lead_entities
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_lead_entities_updated_at ON lead_entities;
CREATE TRIGGER update_lead_entities_updated_at
  BEFORE UPDATE ON lead_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE lead_entities IS 'Stores structured customer facts (name, preferences, budget, etc.) extracted from conversations for personalization.';
COMMENT ON COLUMN lead_entities.entity_type IS 'Category of the entity: name, preference, budget, interest, contact, custom';
COMMENT ON COLUMN lead_entities.entity_key IS 'Specific key within the type, e.g., full_name, preferred_bedrooms, max_budget';
COMMENT ON COLUMN lead_entities.confidence IS 'AI confidence score for extracted entities (0-1)';
COMMENT ON COLUMN lead_entities.source IS 'How the entity was captured: ai_extraction, user_provided, form_submission, manual';
