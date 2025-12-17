-- ============================================================================
-- ADD IMPORTANCE SCORE TO CONVERSATIONS
-- Enables importance-based memory by scoring messages for context retention
-- ============================================================================

-- Add importance_score column to conversations table
-- 1 = normal message, 2 = contains key info, 3 = milestone/decision
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
END $$;

-- Create index for efficient querying of high-importance messages
CREATE INDEX IF NOT EXISTS idx_conversations_importance 
    ON conversations(sender_id, importance_score DESC, created_at DESC);

-- Add comment
COMMENT ON COLUMN conversations.importance_score IS 'Message importance: 1=normal, 2=key info (budget, preferences), 3=milestone (booking, order, payment)';
