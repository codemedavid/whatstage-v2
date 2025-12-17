-- Create response_feedback table for agent ratings and corrections
-- This tracks feedback on bot responses for continuous improvement

CREATE TABLE IF NOT EXISTS response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID,
  sender_id TEXT NOT NULL,
  bot_message TEXT NOT NULL,
  user_message TEXT, -- The message that triggered the bot response
  rating INT CHECK (rating >= 1 AND rating <= 5), -- 1-5 star rating
  is_helpful BOOLEAN, -- Quick thumbs up/down
  correction TEXT, -- Agent's corrected response
  feedback_notes TEXT, -- Additional notes from agent
  feedback_type TEXT DEFAULT 'rating' CHECK (feedback_type IN ('rating', 'correction', 'both')),
  agent_id TEXT, -- Who provided the feedback
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_response_feedback_sender ON response_feedback(sender_id);
CREATE INDEX IF NOT EXISTS idx_response_feedback_created ON response_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_feedback_rating ON response_feedback(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_response_feedback_helpful ON response_feedback(is_helpful);

-- Enable RLS
ALTER TABLE response_feedback ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations
CREATE POLICY "Allow all operations on response_feedback" ON response_feedback
  FOR ALL USING (true) WITH CHECK (true);

-- View for feedback statistics
CREATE OR REPLACE VIEW feedback_stats AS
SELECT 
  COUNT(*) as total_feedback,
  COUNT(CASE WHEN is_helpful = true THEN 1 END) as helpful_count,
  COUNT(CASE WHEN is_helpful = false THEN 1 END) as not_helpful_count,
  AVG(rating) as avg_rating,
  COUNT(CASE WHEN correction IS NOT NULL THEN 1 END) as corrections_count,
  DATE_TRUNC('day', created_at) as feedback_date
FROM response_feedback
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY feedback_date DESC;
