-- ============================================================================
-- APHELION-PHOTON COMPLETE DATABASE SETUP
-- Generated: 2024-12-20
-- 
-- Run this SINGLE FILE in Supabase SQL Editor to set up the entire database.
-- All commands use IF NOT EXISTS for safe re-runs on existing databases.
-- ============================================================================

-- ============================================================================
-- PART 0: EXTENSIONS & UTILITY FUNCTIONS
-- ============================================================================

-- Enable pgvector extension for AI embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 1: DOCUMENTS TABLE (RAG Knowledge Base)
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(1024),  -- nvidia/nv-embedqa-e5-v5 outputs 1024 dimensions
  folder_id UUID,
  category_id UUID,
  source_file_id UUID,
  source_type TEXT DEFAULT 'user_upload',
  confidence_score DECIMAL(3,2) DEFAULT 1.0,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS documents_verified_at_idx ON documents (verified_at DESC);
CREATE INDEX IF NOT EXISTS documents_source_type_idx ON documents (source_type);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy for documents
DROP POLICY IF EXISTS "Allow all operations on documents" ON documents;
CREATE POLICY "Allow all operations on documents" ON documents
  FOR ALL USING (true) WITH CHECK (true);

-- Match documents function for semantic search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON COLUMN documents.source_type IS 'Source of the document: user_upload, setup_wizard, faq, api_import, etc.';
COMMENT ON COLUMN documents.confidence_score IS 'Reliability score 0.0-1.0, higher is more reliable';
COMMENT ON COLUMN documents.verified_at IS 'Last time this document was verified/updated';
COMMENT ON COLUMN documents.expires_at IS 'Optional expiration date for time-sensitive content';

-- ============================================================================
-- PART 2: DOCUMENT FOLDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID,  -- FK added later after knowledge_categories exists
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for category_id lookup
CREATE INDEX IF NOT EXISTS idx_document_folders_category ON document_folders(category_id);

-- Enable RLS
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on document_folders" ON document_folders;
CREATE POLICY "Allow all operations on document_folders" ON document_folders
  FOR ALL USING (true) WITH CHECK (true);

-- Add foreign key to documents table (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_folder_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_folder_id_fkey 
      FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 3: KNOWLEDGE CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  color TEXT DEFAULT 'gray',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop and recreate constraint to ensure it includes payment_method
ALTER TABLE knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_type_check;
ALTER TABLE knowledge_categories ADD CONSTRAINT knowledge_categories_type_check 
  CHECK (type IN ('general', 'qa', 'payment_method'));

-- Enable RLS
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on knowledge_categories" ON knowledge_categories;
CREATE POLICY "Allow all operations on knowledge_categories" ON knowledge_categories
  FOR ALL USING (true) WITH CHECK (true);

-- Add foreign key to documents table (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_category_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key from document_folders to knowledge_categories (deferred because of table creation order)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'document_folders_category_id_fkey'
  ) THEN
    ALTER TABLE document_folders 
      ADD CONSTRAINT document_folders_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Insert default categories
INSERT INTO knowledge_categories (name, type, color) VALUES
  ('General', 'general', 'gray'),
  ('Pricing', 'general', 'green'),
  ('FAQs', 'qa', 'blue'),
  ('Product Info', 'general', 'purple')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 4: DOCUMENT SOURCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INT,
  page_count INT,
  chunk_count INT,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  category_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_sources_status ON document_sources(status);
CREATE INDEX IF NOT EXISTS idx_document_sources_created ON document_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_sources_category ON document_sources(category_id);

ALTER TABLE document_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on document_sources" ON document_sources;
CREATE POLICY "Allow all operations on document_sources" ON document_sources
  FOR ALL USING (true) WITH CHECK (true);

-- Add source_file_id FK to documents (after document_sources exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_source_file_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_source_file_id_fkey 
      FOREIGN KEY (source_file_id) REFERENCES document_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_source_file ON documents(source_file_id);

-- ============================================================================
-- PART 5: BOT SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name TEXT DEFAULT 'Assistant',
  bot_tone TEXT DEFAULT 'helpful and professional',
  facebook_verify_token TEXT DEFAULT 'TEST_TOKEN',
  facebook_page_access_token TEXT,
  human_takeover_timeout_minutes INT DEFAULT 5,
  ai_model TEXT DEFAULT 'qwen/qwen3-235b-a22b',
  business_name TEXT,
  business_description TEXT,
  setup_step INTEGER DEFAULT 0,
  is_setup_completed BOOLEAN DEFAULT FALSE,
  split_messages BOOLEAN DEFAULT false,
  auto_follow_up_enabled BOOLEAN DEFAULT false,
  primary_goal TEXT DEFAULT 'lead_generation' CHECK (primary_goal IN ('lead_generation', 'appointment_booking', 'tripping', 'purchase')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO bot_settings (bot_name, bot_tone, facebook_verify_token) 
VALUES ('Assistant', 'helpful and professional', 'TEST_TOKEN')
ON CONFLICT DO NOTHING;

ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on bot_settings" ON bot_settings;
CREATE POLICY "Allow all operations on bot_settings" ON bot_settings
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON COLUMN bot_settings.split_messages IS 'When true, AI responses will be split into separate messages by sentence';
COMMENT ON COLUMN bot_settings.auto_follow_up_enabled IS 'When true, the bot will automatically send follow-up messages to inactive leads';
COMMENT ON COLUMN bot_settings.primary_goal IS 'Primary bot objective: lead_generation, appointment_booking, tripping (real estate), or purchase (e-commerce)';

-- ============================================================================
-- PART 6: BOT RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  priority INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bot_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on bot_rules" ON bot_rules;
CREATE POLICY "Allow all operations on bot_rules" ON bot_rules
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_bot_rules_updated_at ON bot_rules;
CREATE TRIGGER update_bot_rules_updated_at
  BEFORE UPDATE ON bot_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: BOT INSTRUCTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bot_instructions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on bot_instructions" ON bot_instructions;
CREATE POLICY "Allow all operations on bot_instructions" ON bot_instructions
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_bot_instructions_updated_at ON bot_instructions;
CREATE TRIGGER update_bot_instructions_updated_at
  BEFORE UPDATE ON bot_instructions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: BOT GOALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_type TEXT NOT NULL DEFAULT 'email' CHECK (goal_type IN ('email', 'phone')),
  is_active BOOLEAN DEFAULT false,
  cooldown_hours INT DEFAULT 24,
  description TEXT DEFAULT 'Please ask for your email address so we can send you more information.',
  success_message TEXT DEFAULT 'Thank you! We will be in touch soon.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bot_goals (goal_type, is_active, cooldown_hours, description, success_message) 
VALUES ('email', false, 24, 'Please ask for your email address so we can send you more information.', 'Thank you! We will be in touch soon.')
ON CONFLICT DO NOTHING;

ALTER TABLE bot_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on bot_goals" ON bot_goals;
CREATE POLICY "Allow all operations on bot_goals" ON bot_goals
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_bot_goals_updated_at ON bot_goals;
CREATE TRIGGER update_bot_goals_updated_at
  BEFORE UPDATE ON bot_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 9: CONVERSATIONS TABLE (Chat History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  importance_score INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add constraint for importance score
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

CREATE INDEX IF NOT EXISTS idx_conversations_sender_id ON conversations(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_importance ON conversations(sender_id, importance_score DESC, created_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on conversations" ON conversations;
CREATE POLICY "Allow all operations on conversations" ON conversations
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON COLUMN conversations.importance_score IS 'Message importance: 1=normal, 2=key info (budget, preferences), 3=milestone (booking, order, payment)';

-- ============================================================================
-- PART 10: CONVERSATION SUMMARIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_sender ON conversation_summaries(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created_at ON conversation_summaries(created_at DESC);

ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on conversation_summaries" ON conversation_summaries;
CREATE POLICY "Allow all operations on conversation_summaries" ON conversation_summaries
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE conversation_summaries IS 'Stores periodic summaries of user conversations to maintain long-term context for the AI.';

-- ============================================================================
-- PART 11: PIPELINE STAGES TABLE
-- ============================================================================

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

INSERT INTO pipeline_stages (name, display_order, color, is_default) VALUES
  ('New Lead', 0, '#3b82f6', true),
  ('Interested', 1, '#8b5cf6', false),
  ('Qualified', 2, '#f59e0b', false),
  ('Negotiating', 3, '#10b981', false),
  ('Won', 4, '#22c55e', false),
  ('Lost', 5, '#ef4444', false)
ON CONFLICT DO NOTHING;

-- Add Appointment Scheduled stage if not exists
INSERT INTO pipeline_stages (name, display_order, color, description)
SELECT 'Appointment Scheduled', 2, '#8b5cf6', 'Customer has booked an appointment'
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages WHERE name = 'Appointment Scheduled'
);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on pipeline_stages" ON pipeline_stages;
CREATE POLICY "Allow all operations on pipeline_stages" ON pipeline_stages
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 12: LEADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL UNIQUE,
  name TEXT,
  profile_pic TEXT,
  phone TEXT,
  email TEXT,
  page_id TEXT,
  current_stage_id UUID REFERENCES pipeline_stages(id),
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ,
  ai_classification_reason TEXT,
  bot_disabled BOOLEAN DEFAULT false,
  bot_disabled_reason TEXT,
  receipt_image_url TEXT,
  receipt_detected_at TIMESTAMPTZ,
  goal_met_at TIMESTAMPTZ,
  custom_data JSONB DEFAULT '{}'::jsonb,
  -- Follow-up tracking
  last_bot_message_at TIMESTAMPTZ,
  last_customer_message_at TIMESTAMPTZ,
  follow_up_count INT DEFAULT 0,
  follow_up_enabled BOOLEAN DEFAULT true,
  next_follow_up_at TIMESTAMPTZ,
  -- Smart Passive mode
  needs_human_attention BOOLEAN DEFAULT false,
  smart_passive_activated_at TIMESTAMPTZ,
  unanswered_question_count INT DEFAULT 0,
  recent_questions JSONB DEFAULT '[]'::jsonb,
  smart_passive_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_sender_id ON leads(sender_id);
CREATE INDEX IF NOT EXISTS idx_leads_current_stage ON leads(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_receipt_detected ON leads(receipt_detected_at) WHERE receipt_detected_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_page_id ON leads(page_id);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up_at) WHERE follow_up_enabled = true AND next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_needs_human_attention ON leads(needs_human_attention) WHERE needs_human_attention = true;

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on leads" ON leads;
CREATE POLICY "Allow all operations on leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN leads.custom_data IS 'Key-value pairs for custom form fields not in standard schema';
COMMENT ON COLUMN leads.needs_human_attention IS 'True when AI has detected customer needs human agent assistance';
COMMENT ON COLUMN leads.smart_passive_activated_at IS 'Timestamp when Smart Passive mode was activated';
COMMENT ON COLUMN leads.unanswered_question_count IS 'Count of consecutive questions the AI could not answer satisfactorily';
COMMENT ON COLUMN leads.recent_questions IS 'JSON array of recent questions for repetition detection';
COMMENT ON COLUMN leads.smart_passive_reason IS 'Reason why Smart Passive was triggered (for agent visibility)';
COMMENT ON COLUMN leads.next_follow_up_at IS 'Calculated optimal time for next follow-up based on ML patterns';

-- ============================================================================
-- PART 13: LEAD ENTITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('name', 'preference', 'budget', 'interest', 'contact', 'custom')),
  entity_key TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT DEFAULT 'ai_extraction' CHECK (source IN ('ai_extraction', 'user_provided', 'form_submission', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_lead_entities_sender_id ON lead_entities(sender_id);
CREATE INDEX IF NOT EXISTS idx_lead_entities_type ON lead_entities(entity_type);

ALTER TABLE lead_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on lead_entities" ON lead_entities;
CREATE POLICY "Allow all operations on lead_entities" ON lead_entities
  FOR ALL USING (true) WITH CHECK (true);

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
-- PART 14: LEAD STAGE HISTORY TABLE (Audit Trail)
-- ============================================================================

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

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on lead_stage_history" ON lead_stage_history;
CREATE POLICY "Allow all operations on lead_stage_history" ON lead_stage_history
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 15: LEAD ACTIVITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'product_view',
    'property_view',
    'property_inquiry',
    'appointment_booked',
    'appointment_cancelled',
    'payment_sent'
  )),
  item_id TEXT,
  item_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_sender ON lead_activities(sender_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on lead_activities" ON lead_activities;
CREATE POLICY "Allow all operations on lead_activities" ON lead_activities
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 16: WORKFLOWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_stage_id UUID REFERENCES pipeline_stages(id),
  trigger_type TEXT DEFAULT 'stage_change' CHECK (trigger_type IN ('stage_change', 'appointment_booked')),
  workflow_data JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
  is_published BOOLEAN DEFAULT false,
  apply_to_existing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_trigger_stage ON workflows(trigger_stage_id);
CREATE INDEX IF NOT EXISTS idx_workflows_published ON workflows(is_published);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on workflows" ON workflows;
CREATE POLICY "Allow all operations on workflows" ON workflows
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN workflows.apply_to_existing IS 'When true, publishing this workflow will trigger it for all leads currently in the trigger stage';
COMMENT ON COLUMN workflows.trigger_type IS 'Type of trigger: stage_change (pipeline stage) or appointment_booked';

-- ============================================================================
-- PART 17: WORKFLOW EXECUTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  current_node_id TEXT,
  execution_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'stopped')),
  scheduled_for TIMESTAMPTZ,
  appointment_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lead ON workflow_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_scheduled ON workflow_executions(scheduled_for)
  WHERE status = 'pending' AND scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_executions_appointment ON workflow_executions(appointment_id);

ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on workflow_executions" ON workflow_executions;
CREATE POLICY "Allow all operations on workflow_executions" ON workflow_executions
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER update_workflow_executions_updated_at
  BEFORE UPDATE ON workflow_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN workflow_executions.appointment_id IS 'Reference to appointment for appointment-triggered workflows';

-- ============================================================================
-- PART 18: HUMAN TAKEOVER SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_takeover_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_sender_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_human_message_at TIMESTAMPTZ DEFAULT NOW(),
  timeout_minutes INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_human_takeover_sender ON human_takeover_sessions(lead_sender_id);

ALTER TABLE human_takeover_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on human_takeover_sessions" ON human_takeover_sessions;
CREATE POLICY "Allow all operations on human_takeover_sessions" ON human_takeover_sessions
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE human_takeover_sessions IS 'Tracks active human agent takeover sessions to pause bot responses';
COMMENT ON COLUMN human_takeover_sessions.lead_sender_id IS 'Facebook sender PSID of the lead';
COMMENT ON COLUMN human_takeover_sessions.last_human_message_at IS 'Timestamp of last message from human agent';
COMMENT ON COLUMN human_takeover_sessions.timeout_minutes IS 'How long to keep bot paused after human message';

-- ============================================================================
-- PART 19: CONNECTED PAGES TABLE (Facebook OAuth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS connected_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL UNIQUE,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT,
  is_active BOOLEAN DEFAULT true,
  webhook_subscribed BOOLEAN DEFAULT false,
  profile_pic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connected_pages_page_id ON connected_pages(page_id);
CREATE INDEX IF NOT EXISTS idx_connected_pages_is_active ON connected_pages(is_active);

ALTER TABLE connected_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on connected_pages" ON connected_pages;
CREATE POLICY "Allow all operations on connected_pages" ON connected_pages
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_connected_pages_updated_at ON connected_pages;
CREATE TRIGGER update_connected_pages_updated_at
  BEFORE UPDATE ON connected_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 20: PRODUCT CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_order ON product_categories(display_order);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on product_categories" ON product_categories;
CREATE POLICY "Allow all operations on product_categories" ON product_categories
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_product_categories_updated_at ON product_categories;
CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO product_categories (name, description, color) VALUES
  ('General', 'Default product category', '#6B7280')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 21: PRODUCTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'PHP',
  image_url TEXT,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_order ON products(display_order);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on products" ON products;
CREATE POLICY "Allow all operations on products" ON products
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 22: PRODUCT VARIATION TYPES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_variation_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on product_variation_types" ON product_variation_types;
CREATE POLICY "Allow all operations on product_variation_types" ON product_variation_types
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_product_variation_types_updated_at ON product_variation_types;
CREATE TRIGGER update_product_variation_types_updated_at
  BEFORE UPDATE ON product_variation_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO product_variation_types (name, display_order) VALUES
  ('Size', 1),
  ('Color', 2)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 23: PRODUCT VARIATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variation_type_id UUID NOT NULL REFERENCES product_variation_types(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, variation_type_id, value)
);

CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON product_variations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variations_type_id ON product_variations(variation_type_id);

ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on product_variations" ON product_variations;
CREATE POLICY "Allow all operations on product_variations" ON product_variations
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_product_variations_updated_at ON product_variations;
CREATE TRIGGER update_product_variations_updated_at
  BEFORE UPDATE ON product_variations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 24: STORE SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name TEXT NOT NULL,
    store_type TEXT NOT NULL CHECK (store_type IN ('ecommerce', 'real_estate')),
    setup_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on store_settings" ON store_settings;
CREATE POLICY "Allow all operations on store_settings" ON store_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_store_settings_updated_at ON store_settings;
CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 25: PROPERTIES TABLE (Real Estate)
-- ============================================================================

CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(12, 2),
    currency TEXT DEFAULT 'PHP',
    address TEXT,
    bedrooms INT,
    bathrooms INT,
    sqft DECIMAL(10, 2),
    status TEXT DEFAULT 'for_sale' CHECK (status IN ('for_sale', 'for_rent', 'sold', 'rented')),
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    property_type TEXT,
    year_built INT,
    lot_area DECIMAL(10, 2),
    garage_spaces INT,
    down_payment DECIMAL(12, 2),
    monthly_amortization DECIMAL(12, 2),
    payment_terms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on properties" ON properties;
CREATE POLICY "Allow all operations on properties" ON properties
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_active ON properties(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);

-- ============================================================================
-- PART 26: PROPERTY IMAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_images_property ON property_images(property_id);

ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on property_images" ON property_images;
CREATE POLICY "Allow all operations on property_images" ON property_images
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 27: APPOINTMENT SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_hours_start TIME NOT NULL DEFAULT '09:00:00',
  business_hours_end TIME NOT NULL DEFAULT '17:00:00',
  slot_duration_minutes INT NOT NULL DEFAULT 60,
  days_available INT[] DEFAULT ARRAY[1,2,3,4,5],
  booking_lead_time_hours INT DEFAULT 24,
  max_advance_booking_days INT DEFAULT 30,
  buffer_between_slots_minutes INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on appointment_settings" ON appointment_settings;
CREATE POLICY "Allow all operations on appointment_settings" ON appointment_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_appointment_settings_updated_at ON appointment_settings;
CREATE TRIGGER update_appointment_settings_updated_at
  BEFORE UPDATE ON appointment_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO appointment_settings (
  business_hours_start, 
  business_hours_end, 
  slot_duration_minutes,
  days_available
) VALUES (
  '09:00:00', 
  '17:00:00', 
  60,
  ARRAY[1,2,3,4,5]
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 28: APPOINTMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_psid TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  facebook_name TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  page_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_sender_psid ON appointments(sender_psid);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(appointment_date, start_time);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on appointments" ON appointments;
CREATE POLICY "Allow all operations on appointments" ON appointments
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add FK for workflow_executions.appointment_id now that appointments exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'workflow_executions_appointment_id_fkey'
  ) THEN
    ALTER TABLE workflow_executions 
      ADD CONSTRAINT workflow_executions_appointment_id_fkey 
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- PART 29: APPOINTMENT DISABLED DATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_disabled_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disabled_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointment_disabled_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on appointment_disabled_dates" ON appointment_disabled_dates;
CREATE POLICY "Allow all operations on appointment_disabled_dates" ON appointment_disabled_dates
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 30: ORDERS TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  status order_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'pending',
  is_cod BOOLEAN DEFAULT false,
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'PHP',
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  shipping_address TEXT,
  notes TEXT,
  payment_method TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_lead_status ON orders(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_lead_id ON orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_is_cod ON orders(is_cod) WHERE is_cod = true;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on orders" ON orders;
CREATE POLICY "Allow all operations on orders" ON orders
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN orders.payment_status IS 'Payment status: pending, paid, failed, refunded, cancelled';
COMMENT ON COLUMN orders.is_cod IS 'Whether this is a Cash on Delivery order';

-- ============================================================================
-- PART 31: ORDER ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  variations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on order_items" ON order_items;
CREATE POLICY "Allow all operations on order_items" ON order_items
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 32: PAYMENT METHODS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES knowledge_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_name TEXT,
  account_number TEXT,
  qr_code_url TEXT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_category ON payment_methods(category_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = true;

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on payment_methods" ON payment_methods;
CREATE POLICY "Allow all operations on payment_methods" ON payment_methods
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 33: FOLLOW-UP RESPONSE PATTERNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_response_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  follow_up_sent_at TIMESTAMPTZ NOT NULL,
  response_received_at TIMESTAMPTZ,
  response_delay_minutes INT,
  hour_of_day INT,
  day_of_week INT,
  follow_up_attempt INT,
  message_type TEXT,
  did_respond BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_patterns_sender ON follow_up_response_patterns(sender_id);
CREATE INDEX IF NOT EXISTS idx_response_patterns_lead ON follow_up_response_patterns(lead_id);
CREATE INDEX IF NOT EXISTS idx_response_patterns_hour ON follow_up_response_patterns(hour_of_day);
CREATE INDEX IF NOT EXISTS idx_response_patterns_responded ON follow_up_response_patterns(did_respond) WHERE did_respond = true;

ALTER TABLE follow_up_response_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on follow_up_response_patterns" ON follow_up_response_patterns;
CREATE POLICY "Allow all operations on follow_up_response_patterns" ON follow_up_response_patterns
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE follow_up_response_patterns IS 'Tracks customer response patterns for ML-based timing optimization';

-- ============================================================================
-- PART 34: FOLLOW-UP SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_intervals INT[] DEFAULT ARRAY[5, 15, 30, 60, 120, 240, 480],
  min_interval_minutes INT DEFAULT 5,
  max_interval_minutes INT DEFAULT 1440,
  active_hours_start TIME DEFAULT '08:00:00',
  active_hours_end TIME DEFAULT '21:00:00',
  ml_learning_enabled BOOLEAN DEFAULT true,
  ml_weight_recent FLOAT DEFAULT 0.7,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO follow_up_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS update_follow_up_settings_updated_at ON follow_up_settings;
CREATE TRIGGER update_follow_up_settings_updated_at
  BEFORE UPDATE ON follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE follow_up_settings IS 'Global configuration for auto follow-up timing and behavior';

-- ============================================================================
-- PART 35: FORMS TABLE (Lead Generation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  pipeline_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on forms" ON forms;
CREATE POLICY "Allow all operations on forms" ON forms FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_forms_updated_at ON forms;
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON forms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 36: FORM FIELDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  is_required BOOLEAN DEFAULT false,
  options JSONB,
  placeholder TEXT,
  display_order INT DEFAULT 0,
  mapping_field TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_fields_form_order ON form_fields(form_id, display_order);

ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on form_fields" ON form_fields;
CREATE POLICY "Allow all operations on form_fields" ON form_fields FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_form_fields_updated_at ON form_fields;
CREATE TRIGGER update_form_fields_updated_at BEFORE UPDATE ON form_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 37: FORM SUBMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  submitted_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on form_submissions" ON form_submissions;
CREATE POLICY "Allow all operations on form_submissions" ON form_submissions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_lead ON form_submissions(lead_id);

-- ============================================================================
-- PART 38: RESPONSE FEEDBACK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID,
  sender_id TEXT NOT NULL,
  bot_message TEXT NOT NULL,
  user_message TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  is_helpful BOOLEAN,
  correction TEXT,
  feedback_notes TEXT,
  feedback_type TEXT DEFAULT 'rating' CHECK (feedback_type IN ('rating', 'correction', 'both')),
  agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_feedback_sender ON response_feedback(sender_id);
CREATE INDEX IF NOT EXISTS idx_response_feedback_created ON response_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_feedback_rating ON response_feedback(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_response_feedback_helpful ON response_feedback(is_helpful);

ALTER TABLE response_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on response_feedback" ON response_feedback;
CREATE POLICY "Allow all operations on response_feedback" ON response_feedback
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for upcoming appointments with lead info
CREATE OR REPLACE VIEW upcoming_appointments AS
SELECT 
  a.*,
  l.name as lead_name,
  l.profile_pic as lead_profile_pic,
  l.phone as lead_phone,
  l.email as lead_email
FROM appointments a
LEFT JOIN leads l ON a.sender_psid = l.sender_id
WHERE a.appointment_date >= CURRENT_DATE
  AND a.status IN ('pending', 'confirmed')
ORDER BY a.appointment_date, a.start_time;

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

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- This script creates all required tables for Aphelion-Photon:
-- 
-- Core:
--   1. documents - RAG knowledge base with vector embeddings
--   2. document_folders - Folder organization for documents
--   3. knowledge_categories - Category system for knowledge base
--   4. document_sources - Tracking uploaded source files
--
-- Bot Configuration:
--   5. bot_settings - Bot configuration (name, tone, tokens, model)
--   6. bot_rules - Custom rules for the chatbot
--   7. bot_instructions - Extended bot instructions
--   8. bot_goals - Lead information collection goals
--
-- Conversations:
--   9. conversations - Chat history by sender
--   10. conversation_summaries - AI-generated conversation summaries
--
-- CRM/Leads:
--   11. pipeline_stages - CRM pipeline stages
--   12. leads - Lead management with follow-up tracking
--   13. lead_entities - Structured customer facts
--   14. lead_stage_history - Audit trail for lead movements
--   15. lead_activities - Customer interaction tracking
--
-- Automation:
--   16. workflows - Automation workflows
--   17. workflow_executions - Workflow execution tracking
--   18. human_takeover_sessions - Human agent takeover tracking
--
-- Facebook:
--   19. connected_pages - Facebook OAuth connected pages
--
-- E-commerce:
--   20. product_categories - Product category organization
--   21. products - Store products with pricing
--   22. product_variation_types - Variation types (Size, Color, etc.)
--   23. product_variations - Product-specific variations
--   24. store_settings - Store configuration
--   25. orders - Customer orders
--   26. order_items - Order line items
--   27. payment_methods - Payment method configuration
--
-- Real Estate:
--   28. properties - Real estate listings
--   29. property_images - Property gallery images
--
-- Appointments:
--   30. appointment_settings - Booking configuration
--   31. appointments - Booked appointments
--   32. appointment_disabled_dates - Blocked dates
--
-- Follow-up System:
--   33. follow_up_response_patterns - ML timing patterns
--   34. follow_up_settings - Global follow-up config
--
-- Lead Generation Forms:
--   35. forms - Form definitions
--   36. form_fields - Form field configuration
--   37. form_submissions - Form submission log
--
-- Feedback:
--   38. response_feedback - Agent ratings and corrections
-- ============================================================================


-- Migration: Add AI Priority Analysis fields to leads table
-- Run this in Supabase SQL Editor

-- Add attention_priority enum-like check
ALTER TABLE leads ADD COLUMN IF NOT EXISTS attention_priority TEXT CHECK (attention_priority IN ('critical', 'high', 'medium', 'low'));

-- Add timestamp for when priority was last analyzed
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_analyzed_at TIMESTAMPTZ;

-- Add index for priority filtering
CREATE INDEX IF NOT EXISTS idx_leads_attention_priority ON leads(attention_priority) WHERE attention_priority IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN leads.attention_priority IS 'AI-assigned priority level: critical, high, medium, low';
COMMENT ON COLUMN leads.priority_analyzed_at IS 'Timestamp when the priority was last updated by AI analysis';


-- Migration: Add Smart Passive mode fields to leads table
-- Run this in Supabase SQL Editor to enable Smart Passive mode tracking

-- Add needs_human_attention flag
-- This is set to true when the AI detects the customer needs human assistance
ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_human_attention BOOLEAN DEFAULT false;

-- Add timestamp for when Smart Passive mode was activated
ALTER TABLE leads ADD COLUMN IF NOT EXISTS smart_passive_activated_at TIMESTAMPTZ;

-- Track how many questions in a row went unanswered/repeated
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unanswered_question_count INT DEFAULT 0;

-- Store the last few questions to detect repetition
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recent_questions JSONB DEFAULT '[]'::jsonb;

-- Store the reason why Smart Passive was activated (for agent visibility)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS smart_passive_reason TEXT;

-- Index for quickly finding leads needing human attention (for dashboard highlighting)
CREATE INDEX IF NOT EXISTS idx_leads_needs_human_attention ON leads(needs_human_attention) 
  WHERE needs_human_attention = true;

-- Comment for documentation
COMMENT ON COLUMN leads.needs_human_attention IS 'True when AI has detected customer needs human agent assistance';
COMMENT ON COLUMN leads.smart_passive_activated_at IS 'Timestamp when Smart Passive mode was activated';
COMMENT ON COLUMN leads.unanswered_question_count IS 'Count of consecutive questions the AI could not answer satisfactorily';
COMMENT ON COLUMN leads.recent_questions IS 'JSON array of recent questions for repetition detection';
COMMENT ON COLUMN leads.smart_passive_reason IS 'Reason why Smart Passive was triggered (for agent visibility)';


-- ============================================================================
-- TENANT ROUTING TABLE FOR CENTRAL WEBHOOK ROUTER
-- This table maps Facebook Page IDs to customer instance URLs
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT UNIQUE,                    -- Facebook Page ID (NULL until customer connects)
  tenant_name TEXT NOT NULL,              -- Customer/Tenant Name (e.g., "Customer A")
  destination_url TEXT NOT NULL UNIQUE,   -- Full webhook URL (unique per tenant)
  secret_key TEXT,                        -- Optional: shared secret for request validation
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_tenant_routes_page_id ON tenant_routes(page_id);
CREATE INDEX IF NOT EXISTS idx_tenant_routes_active ON tenant_routes(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE tenant_routes ENABLE ROW LEVEL SECURITY;

-- Policy: Currently permissive for development
-- PRODUCTION TODO: Restrict with proper authentication:
--   - Admin users can read/write all routes
--   - Service role can read/write (for API operations)
--   - Anonymous users should have NO access
CREATE POLICY "Allow all operations on tenant_routes" ON tenant_routes
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_tenant_routes_updated_at ON tenant_routes;
CREATE TRIGGER update_tenant_routes_updated_at
  BEFORE UPDATE ON tenant_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE tenant_routes IS 'Maps Facebook Page IDs to customer instance webhook URLs for the Central Router';

-- Migration: Add AI Priority Analysis fields to leads table
-- Run this in Supabase SQL Editor

-- Add attention_priority enum-like check
ALTER TABLE leads ADD COLUMN IF NOT EXISTS attention_priority TEXT CHECK (attention_priority IN ('critical', 'high', 'medium', 'low'));

-- Add timestamp for when priority was last analyzed
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_analyzed_at TIMESTAMPTZ;

-- Add index for priority filtering
CREATE INDEX IF NOT EXISTS idx_leads_attention_priority ON leads(attention_priority) WHERE attention_priority IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN leads.attention_priority IS 'AI-assigned priority level: critical, high, medium, low';
COMMENT ON COLUMN leads.priority_analyzed_at IS 'Timestamp when the priority was last updated by AI analysis';

-- Add image_urls JSONB column to properties table
-- This enables storing multiple images per property

-- Add the new column for multiple images
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb;

-- Migrate existing image_url values into the new image_urls array
UPDATE properties 
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL 
  AND (image_urls IS NULL OR image_urls = '[]'::jsonb);

-- Create index for better query performance on JSONB
CREATE INDEX IF NOT EXISTS idx_properties_image_urls ON properties USING GIN (image_urls);

-- Add comment for documentation
COMMENT ON COLUMN properties.image_urls IS 'Array of image URLs for property gallery. First image is used as primary/thumbnail.';
