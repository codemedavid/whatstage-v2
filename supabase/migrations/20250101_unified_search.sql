-- ============================================================================
-- UNIFIED SEARCH RPC FUNCTION
-- Searches both documents AND media in a single query
-- ============================================================================

-- Create a unified search function that queries both sources
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

-- Note: Index creation removed - existing indexes from base migrations are sufficient
-- The documents and ai_media tables already have ivfflat indexes from their original migrations

-- Add comment for documentation
COMMENT ON FUNCTION search_all_sources IS 'Unified semantic search across documents and media. Returns combined results sorted by similarity.';
