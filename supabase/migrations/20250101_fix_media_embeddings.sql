-- ============================================================================
-- FIX MEDIA EMBEDDINGS - Convert string embeddings to proper vectors
-- ============================================================================

-- The embeddings were stored as JSON strings instead of proper vectors.
-- This script converts them to the correct format.

-- Simple approach: Update using direct casting through jsonb
-- The embedding column stores "[0.1, 0.2, ...]" as text, we need to convert to vector

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

-- Verify results
SELECT id, title, 
       pg_typeof(embedding) as embedding_type,
       CASE WHEN embedding IS NOT NULL THEN 'has embedding' ELSE 'no embedding' END as status
FROM ai_media;
