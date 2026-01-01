-- ============================================================================
-- FIX MISSING DATABASE OBJECTS
-- Created: 2026-01-01
-- This migration creates all missing tables, columns, and functions needed
-- ============================================================================

-- ============================================================================
-- 1. API KEYS TABLE
-- ============================================================================

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
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Service role access only') THEN
        CREATE POLICY "Service role access only" ON api_keys
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

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

COMMENT ON TABLE api_keys IS 'Stores API keys for AI providers with rotation and cooldown support';
COMMENT ON COLUMN api_keys.cooldown_until IS 'Key is unavailable until this timestamp (after hitting rate limit)';
COMMENT ON COLUMN api_keys.priority IS 'Higher priority keys are preferred. Use for load balancing.';

-- ============================================================================
-- 2. INSERT NVIDIA API KEYS (for rotation fallback)
-- ============================================================================

INSERT INTO api_keys (provider, api_key, name, is_active, priority)
VALUES 
    ('nvidia', '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', 'nvidia-key-1', true, 1),
    ('nvidia', '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', 'nvidia-key-2', true, 2)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. CONVERSATIONS IMPORTANCE SCORE COLUMN
-- ============================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS importance_score INT DEFAULT 1;

-- Add check constraint for valid scores
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'conversations' AND constraint_name = 'conversations_importance_score_check'
    ) THEN
        ALTER TABLE conversations ADD CONSTRAINT conversations_importance_score_check 
            CHECK (importance_score >= 1 AND importance_score <= 3);
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL; -- Constraint already exists
END $$;

-- Create index for efficient querying of high-importance messages
CREATE INDEX IF NOT EXISTS idx_conversations_importance 
    ON conversations(sender_id, importance_score DESC, created_at DESC);

COMMENT ON COLUMN conversations.importance_score IS 'Message importance: 1=normal, 2=key info (budget, preferences), 3=milestone (booking, order, payment)';

-- ============================================================================
-- 4. LEAD ENTITIES TABLE
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
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_entities' AND policyname = 'Allow all operations on lead_entities') THEN
        CREATE POLICY "Allow all operations on lead_entities" ON lead_entities
          FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Trigger for updated_at (uses existing function if available)
DROP TRIGGER IF EXISTS update_lead_entities_updated_at ON lead_entities;
CREATE TRIGGER update_lead_entities_updated_at
  BEFORE UPDATE ON lead_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE lead_entities IS 'Stores structured customer facts (name, preferences, budget, etc.) extracted from conversations for personalization.';
COMMENT ON COLUMN lead_entities.entity_type IS 'Category of the entity: name, preference, budget, interest, contact, custom';
COMMENT ON COLUMN lead_entities.entity_key IS 'Specific key within the type, e.g., full_name, preferred_bedrooms, max_budget';
COMMENT ON COLUMN lead_entities.confidence IS 'AI confidence score for extracted entities (0-1)';
COMMENT ON COLUMN lead_entities.source IS 'How the entity was captured: ai_extraction, user_provided, form_submission, manual';

-- ============================================================================
-- 5. UNIFIED SEARCH FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION search_all_sources(
    query_embedding VECTOR(1024),
    doc_threshold FLOAT DEFAULT 0.35,
    media_threshold FLOAT DEFAULT 0.45,
    doc_count INT DEFAULT 5,
    media_count INT DEFAULT 3
)
RETURNS TABLE (
    source_type TEXT,
    content TEXT,
    similarity FLOAT,
    metadata JSONB,
    media_id UUID,
    media_url TEXT,
    media_type TEXT,
    media_title TEXT,
    media_thumbnail TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Documents
    SELECT 
        'document'::TEXT as source_type,
        d.content,
        1 - (d.embedding <=> query_embedding) AS similarity,
        d.metadata,
        NULL::UUID as media_id,
        NULL::TEXT as media_url,
        NULL::TEXT as media_type,
        NULL::TEXT as media_title,
        NULL::TEXT as media_thumbnail
    FROM documents d
    WHERE d.embedding IS NOT NULL
      AND 1 - (d.embedding <=> query_embedding) > doc_threshold
    
    UNION ALL
    
    -- Media
    SELECT 
        'media'::TEXT as source_type,
        m.description as content,
        1 - (m.embedding <=> query_embedding) AS similarity,
        jsonb_build_object(
            'title', m.title,
            'keywords', m.keywords,
            'trigger_phrases', m.trigger_phrases,
            'category_id', m.category_id
        ) as metadata,
        m.id as media_id,
        m.media_url,
        m.media_type,
        m.title as media_title,
        m.thumbnail_url as media_thumbnail
    FROM ai_media m
    WHERE m.is_active = true
      AND m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> query_embedding) > media_threshold
    
    ORDER BY similarity DESC
    LIMIT (doc_count + media_count);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_all_sources IS 'Unified semantic search across documents and media. Returns combined results sorted by similarity.';
