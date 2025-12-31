-- AI Media Library
-- Enable AI to send relevant media (videos, images) to customers

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

-- RLS Policies (adjust based on your auth setup)
ALTER TABLE media_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_media ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (admin panel)
CREATE POLICY "Allow all for media_categories" ON media_categories
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for ai_media" ON ai_media
    FOR ALL USING (true) WITH CHECK (true);
