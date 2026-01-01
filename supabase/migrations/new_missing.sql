-- ============================================================================
-- NEW MISSING MIGRATIONS - Consolidated file for migrating to other databases
-- Generated: 2025-12-31
-- ============================================================================

-- ============================================================================
-- API KEYS TABLE (Key rotation and cooldown management)
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

COMMENT ON TABLE api_keys IS 'Stores API keys for AI providers with rotation and cooldown support';
COMMENT ON COLUMN api_keys.cooldown_until IS 'Key is unavailable until this timestamp (after hitting rate limit)';
COMMENT ON COLUMN api_keys.priority IS 'Higher priority keys are preferred. Use for load balancing.';


-- ============================================================================
-- AI MEDIA LIBRARY (Enable AI to send relevant media to customers)
-- ============================================================================

-- Media Categories for organization
CREATE TABLE IF NOT EXISTS media_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Media table with semantic embeddings
CREATE TABLE IF NOT EXISTS ai_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,  -- Used for semantic matching
    keywords TEXT[],            -- Additional search terms
    category_id UUID REFERENCES media_categories(id) ON DELETE SET NULL,
    media_url TEXT NOT NULL,    -- Cloudinary URL
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'file')),
    thumbnail_url TEXT,         -- Preview thumbnail
    embedding VECTOR(1024),     -- NVIDIA embeddings for semantic search
    trigger_phrases TEXT[],     -- Optional: explicit phrases that trigger this media
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_media_category ON ai_media(category_id);
CREATE INDEX IF NOT EXISTS idx_ai_media_active ON ai_media(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_media_type ON ai_media(media_type);

-- Enable vector similarity search (using existing pgvector extension)
CREATE INDEX IF NOT EXISTS idx_ai_media_embedding ON ai_media 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_media_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_ai_media_updated ON ai_media;
CREATE TRIGGER trigger_ai_media_updated
    BEFORE UPDATE ON ai_media
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_media_timestamp();

-- Semantic search function for AI media
CREATE OR REPLACE FUNCTION search_ai_media(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.45,
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    keywords TEXT[],
    media_url TEXT,
    media_type TEXT,
    thumbnail_url TEXT,
    trigger_phrases TEXT[],
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.title,
        m.description,
        m.keywords,
        m.media_url,
        m.media_type,
        m.thumbnail_url,
        m.trigger_phrases,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM ai_media m
    WHERE m.is_active = true
        AND m.embedding IS NOT NULL
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default categories
INSERT INTO media_categories (name, description, color) VALUES
    ('Property Tours', 'Virtual tours and walkthroughs of properties', '#10b981'),
    ('Product Demos', 'Product demonstration videos and images', '#8b5cf6'),
    ('Educational', 'Educational content and tutorials', '#f59e0b'),
    ('Payment & Process', 'Payment instructions and process guides', '#3b82f6')
ON CONFLICT DO NOTHING;

-- RLS Policies
ALTER TABLE media_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_media ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (admin panel)
DROP POLICY IF EXISTS "Allow all for media_categories" ON media_categories;
CREATE POLICY "Allow all for media_categories" ON media_categories
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for ai_media" ON ai_media;
CREATE POLICY "Allow all for ai_media" ON ai_media
    FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- UNIFIED SEARCH RPC FUNCTION
-- Searches both documents AND media in a single query
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


-- ============================================================================
-- DIGITAL PRODUCTS - PAYMENT TYPE COLUMNS
-- ============================================================================

-- Add payment_type column (one_time or monthly recurring)
ALTER TABLE digital_products 
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' 
    CHECK (payment_type IN ('one_time', 'monthly'));

-- Add billing_interval_months for recurring payments
ALTER TABLE digital_products 
  ADD COLUMN IF NOT EXISTS billing_interval_months INTEGER DEFAULT 1;

-- Add thumbnail_url for product card display
ALTER TABLE digital_products 
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN digital_products.payment_type IS 'one_time = single payment, monthly = recurring subscription';
COMMENT ON COLUMN digital_products.billing_interval_months IS 'For monthly payments, how many months between charges (1 = monthly, 3 = quarterly, etc)';
COMMENT ON COLUMN digital_products.thumbnail_url IS 'Thumbnail image for product cards in Messenger';

-- Update existing records to have default values
UPDATE digital_products 
SET payment_type = 'one_time', billing_interval_months = 1 
WHERE payment_type IS NULL;


-- ============================================================================
-- DIGITAL PRODUCTS - CREATOR NAME
-- ============================================================================

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS creator_name TEXT;

COMMENT ON COLUMN digital_products.creator_name IS 'Name of the creator/author of the digital product';


-- ============================================================================
-- DIGITAL PRODUCTS - STORE TYPE
-- Updates store_settings to support digital_product as a store type
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE store_settings 
DROP CONSTRAINT IF EXISTS store_settings_store_type_check;

-- Add the new constraint with digital_product option
ALTER TABLE store_settings 
ADD CONSTRAINT store_settings_store_type_check 
CHECK (store_type IN ('ecommerce', 'real_estate', 'digital_product'));


-- ============================================================================
-- DIGITAL PRODUCT WORKFLOW TRIGGER
-- ============================================================================

-- Drop the existing constraint and add new one with digital_product_purchased
ALTER TABLE workflows 
  DROP CONSTRAINT IF EXISTS workflows_trigger_type_check;

ALTER TABLE workflows 
  ADD CONSTRAINT workflows_trigger_type_check 
  CHECK (trigger_type IN ('stage_change', 'appointment_booked', 'digital_product_purchased'));

-- Add column for linking to specific digital product (optional)
ALTER TABLE workflows 
  ADD COLUMN IF NOT EXISTS trigger_digital_product_id UUID REFERENCES digital_products(id) ON DELETE SET NULL;

-- Create index for digital product triggered workflows
CREATE INDEX IF NOT EXISTS idx_workflows_digital_product_trigger 
  ON workflows(trigger_digital_product_id) 
  WHERE trigger_type = 'digital_product_purchased';

-- Update comment
COMMENT ON COLUMN workflows.trigger_type IS 'Type of trigger: stage_change (pipeline stage), appointment_booked, or digital_product_purchased';
COMMENT ON COLUMN workflows.trigger_digital_product_id IS 'Optional: specific digital product to trigger on. NULL means any digital product purchase.';


-- ============================================================================
-- DIGITAL PRODUCT PURCHASES - FACEBOOK PSID TRACKING
-- ============================================================================

-- Add facebook_psid column to track which Facebook user made the purchase
ALTER TABLE digital_product_purchases 
  ADD COLUMN IF NOT EXISTS facebook_psid TEXT;

-- Add index for efficient lookups by PSID
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_psid 
  ON digital_product_purchases(facebook_psid);

-- Comment for documentation
COMMENT ON COLUMN digital_product_purchases.facebook_psid IS 'Facebook sender PSID of the user who made the purchase';


-- ============================================================================
-- MULTI-STEP FORMS
-- Adds step support, file uploads, and enhanced form settings
-- ============================================================================

-- 1. Add step_number to form_fields (default 1 for backward compatibility)
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS step_number INT DEFAULT 1;

-- 2. Add page_id to forms for Messenger redirect
ALTER TABLE forms ADD COLUMN IF NOT EXISTS page_id TEXT;
CREATE INDEX IF NOT EXISTS idx_forms_page_id ON forms(page_id);

-- 3. Create table for form file uploads
CREATE TABLE IF NOT EXISTS form_file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_submission_id UUID REFERENCES form_submissions(id) ON DELETE CASCADE,
  field_id UUID, -- Reference to the form_fields.id
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT, -- MIME type
  file_size INT, -- Size in bytes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE form_file_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on form_file_uploads" ON form_file_uploads;
CREATE POLICY "Allow all operations on form_file_uploads" ON form_file_uploads FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_submission ON form_file_uploads(form_submission_id);
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_field ON form_file_uploads(field_id);

-- Comment for documentation
COMMENT ON COLUMN form_fields.step_number IS 'Step number for multi-step forms (1-based)';
COMMENT ON COLUMN forms.page_id IS 'Optional Facebook page ID for Messenger redirect after submission';
COMMENT ON TABLE form_file_uploads IS 'Stores uploaded files from form submissions (e.g., payment screenshots)';


-- ============================================================================
-- FIX MEDIA EMBEDDINGS - Convert string embeddings to proper vectors
-- (Only run if you have existing data with malformed embeddings)
-- ============================================================================

DO $$
DECLARE
    media_record RECORD;
    float_array FLOAT[];
    vec VECTOR(1024);
BEGIN
    FOR media_record IN 
        SELECT id, embedding::TEXT as emb_text
        FROM ai_media 
        WHERE embedding IS NOT NULL
    LOOP
        BEGIN
            -- Check if it looks like a JSON array string
            IF media_record.emb_text LIKE '[%]' THEN
                -- Parse the JSON array to float array
                SELECT array_agg(elem::FLOAT)
                INTO float_array
                FROM jsonb_array_elements_text(media_record.emb_text::JSONB) AS elem;
                
                -- Convert to vector and update
                IF array_length(float_array, 1) = 1024 THEN
                    vec := float_array::VECTOR(1024);
                    UPDATE ai_media SET embedding = vec WHERE id = media_record.id;
                    RAISE NOTICE 'Fixed embedding for media ID: %', media_record.id;
                ELSE
                    RAISE NOTICE 'Skipped media ID % - wrong dimension: %', media_record.id, array_length(float_array, 1);
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error processing media ID %: %', media_record.id, SQLERRM;
        END;
    END LOOP;
END $$;


-- ============================================================================
-- DIGITAL PRODUCTS - NOTIFICATION SETTINGS
-- ============================================================================

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_title TEXT;

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_greeting TEXT;

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_button_text TEXT;

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_button_url TEXT;

COMMENT ON COLUMN digital_products.notification_title IS 'Title for the purchase confirmation notification in Messenger';
COMMENT ON COLUMN digital_products.notification_greeting IS 'Greeting message sent after purchase completion';
COMMENT ON COLUMN digital_products.notification_button_text IS 'Optional CTA button text for the notification';
COMMENT ON COLUMN digital_products.notification_button_url IS 'Optional CTA button URL for the notification';


-- ============================================================================
-- BOT SETTINGS - MISSING COLUMNS
-- ============================================================================

-- Add primary_goal column to bot_settings table
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS primary_goal TEXT DEFAULT 'lead_generation';

-- Add CHECK constraint for primary_goal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'bot_settings' 
    AND constraint_name = 'bot_settings_primary_goal_check'
  ) THEN
    ALTER TABLE bot_settings 
    ADD CONSTRAINT bot_settings_primary_goal_check 
    CHECK (primary_goal IN ('lead_generation', 'appointment_booking', 'tripping', 'purchase'));
  END IF;
END $$;

COMMENT ON COLUMN bot_settings.primary_goal IS 'Primary bot objective: lead_generation, appointment_booking, tripping (real estate), or purchase (e-commerce)';

-- Add auto_follow_up_enabled column to bot_settings table
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS auto_follow_up_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN bot_settings.auto_follow_up_enabled IS 'When true, the bot will automatically send follow-up messages to inactive leads';

-- Add ai_model column to bot_settings table
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'qwen/qwen3-235b-a22b';

COMMENT ON COLUMN bot_settings.ai_model IS 'AI model to use for chat completions (e.g., qwen/qwen3-235b-a22b, deepseek-ai/deepseek-v3.1)';

-- Update existing rows to have default values
UPDATE bot_settings 
SET primary_goal = 'lead_generation' 
WHERE primary_goal IS NULL;

UPDATE bot_settings 
SET auto_follow_up_enabled = false 
WHERE auto_follow_up_enabled IS NULL;

UPDATE bot_settings 
SET ai_model = 'qwen/qwen3-235b-a22b' 
WHERE ai_model IS NULL;


-- ============================================================================
-- END OF NEW MISSING MIGRATIONS
-- ============================================================================

SELECT 'All new migrations applied successfully!' as result;
