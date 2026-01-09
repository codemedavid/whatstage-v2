-- ============================================================================
-- USER-BASED MULTI-TENANCY MIGRATION
-- Generated: 2026-01-04
-- 
-- This migration adds user_id to all relevant tables and sets up Row Level
-- Security (RLS) policies for complete data isolation between users.
--
-- ⚠️ WARNING: This is a BREAKING CHANGE. All existing data will be orphaned
-- unless assigned to a user. For fresh start, run this on a clean database.
--
-- NOTE: Foreign keys to auth.users are NOT created because Supabase's 
-- SQL editor doesn't have permission to reference the auth schema.
-- RLS policies using auth.uid() provide the same security guarantees.
-- ============================================================================

-- ============================================================================
-- PART 1: ADD USER_ID TO BOT CONFIGURATION TABLES
-- ============================================================================

-- Bot Settings - Each user has their own bot configuration
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_settings_user ON bot_settings(user_id);

DROP POLICY IF EXISTS "Allow all operations on bot_settings" ON bot_settings;
CREATE POLICY "Users can manage their own bot_settings" ON bot_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Bot Rules - User-specific rules
ALTER TABLE bot_rules ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_bot_rules_user ON bot_rules(user_id);

DROP POLICY IF EXISTS "Allow all operations on bot_rules" ON bot_rules;
CREATE POLICY "Users can manage their own bot_rules" ON bot_rules
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Bot Instructions - User-specific instructions
ALTER TABLE bot_instructions ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_bot_instructions_user ON bot_instructions(user_id);

DROP POLICY IF EXISTS "Allow all operations on bot_instructions" ON bot_instructions;
CREATE POLICY "Users can manage their own bot_instructions" ON bot_instructions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Bot Goals
ALTER TABLE bot_goals ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_bot_goals_user ON bot_goals(user_id);

DROP POLICY IF EXISTS "Allow all operations on bot_goals" ON bot_goals;
CREATE POLICY "Users can manage their own bot_goals" ON bot_goals
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 2: ADD USER_ID TO KNOWLEDGE BASE TABLES
-- ============================================================================

-- Documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

DROP POLICY IF EXISTS "Allow all operations on documents" ON documents;
CREATE POLICY "Users can manage their own documents" ON documents
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Document Folders
ALTER TABLE document_folders ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_document_folders_user ON document_folders(user_id);

DROP POLICY IF EXISTS "Allow all operations on document_folders" ON document_folders;
CREATE POLICY "Users can manage their own document_folders" ON document_folders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Knowledge Categories
ALTER TABLE knowledge_categories ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_user ON knowledge_categories(user_id);

DROP POLICY IF EXISTS "Allow all operations on knowledge_categories" ON knowledge_categories;
CREATE POLICY "Users can manage their own knowledge_categories" ON knowledge_categories
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Document Sources
ALTER TABLE document_sources ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_document_sources_user ON document_sources(user_id);

DROP POLICY IF EXISTS "Allow all operations on document_sources" ON document_sources;
CREATE POLICY "Users can manage their own document_sources" ON document_sources
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 3: ADD USER_ID TO CRM/LEADS TABLES
-- ============================================================================

-- Pipeline Stages - Each user has their own pipeline
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_user ON pipeline_stages(user_id);

DROP POLICY IF EXISTS "Allow all operations on pipeline_stages" ON pipeline_stages;
CREATE POLICY "Users can manage their own pipeline_stages" ON pipeline_stages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Leads - Core CRM data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);

DROP POLICY IF EXISTS "Allow all operations on leads" ON leads;
CREATE POLICY "Users can manage their own leads" ON leads
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Lead Entities
ALTER TABLE lead_entities ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_lead_entities_user ON lead_entities(user_id);

DROP POLICY IF EXISTS "Allow all operations on lead_entities" ON lead_entities;
CREATE POLICY "Users can manage their own lead_entities" ON lead_entities
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Lead Stage History
ALTER TABLE lead_stage_history ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_user ON lead_stage_history(user_id);

DROP POLICY IF EXISTS "Allow all operations on lead_stage_history" ON lead_stage_history;
CREATE POLICY "Users can manage their own lead_stage_history" ON lead_stage_history
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Lead Activities
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_lead_activities_user ON lead_activities(user_id);

DROP POLICY IF EXISTS "Allow all operations on lead_activities" ON lead_activities;
CREATE POLICY "Users can manage their own lead_activities" ON lead_activities
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 4: ADD USER_ID TO CONVERSATION TABLES
-- ============================================================================

-- Conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

DROP POLICY IF EXISTS "Allow all operations on conversations" ON conversations;
CREATE POLICY "Users can manage their own conversations" ON conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Conversation Summaries
ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user ON conversation_summaries(user_id);

DROP POLICY IF EXISTS "Allow all operations on conversation_summaries" ON conversation_summaries;
CREATE POLICY "Users can manage their own conversation_summaries" ON conversation_summaries
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 5: ADD USER_ID TO AUTOMATION TABLES
-- ============================================================================

-- Workflows
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id);

DROP POLICY IF EXISTS "Allow all operations on workflows" ON workflows;
CREATE POLICY "Users can manage their own workflows" ON workflows
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Workflow Executions
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user ON workflow_executions(user_id);

DROP POLICY IF EXISTS "Allow all operations on workflow_executions" ON workflow_executions;
CREATE POLICY "Users can manage their own workflow_executions" ON workflow_executions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Human Takeover Sessions
ALTER TABLE human_takeover_sessions ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_human_takeover_sessions_user ON human_takeover_sessions(user_id);

DROP POLICY IF EXISTS "Allow all operations on human_takeover_sessions" ON human_takeover_sessions;
CREATE POLICY "Users can manage their own human_takeover_sessions" ON human_takeover_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 6: ADD USER_ID TO FACEBOOK TABLES
-- ============================================================================

-- Connected Pages - Links Facebook pages to users
ALTER TABLE connected_pages ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_connected_pages_user ON connected_pages(user_id);

DROP POLICY IF EXISTS "Allow all operations on connected_pages" ON connected_pages;
CREATE POLICY "Users can manage their own connected_pages" ON connected_pages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 7: ADD USER_ID TO E-COMMERCE TABLES
-- ============================================================================

-- Product Categories
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_product_categories_user ON product_categories(user_id);

DROP POLICY IF EXISTS "Allow all operations on product_categories" ON product_categories;
CREATE POLICY "Users can manage their own product_categories" ON product_categories
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

DROP POLICY IF EXISTS "Allow all operations on products" ON products;
CREATE POLICY "Users can manage their own products" ON products
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Product Variation Types
ALTER TABLE product_variation_types ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_product_variation_types_user ON product_variation_types(user_id);

DROP POLICY IF EXISTS "Allow all operations on product_variation_types" ON product_variation_types;
CREATE POLICY "Users can manage their own product_variation_types" ON product_variation_types
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Product Variations
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_product_variations_user ON product_variations(user_id);

DROP POLICY IF EXISTS "Allow all operations on product_variations" ON product_variations;
CREATE POLICY "Users can manage their own product_variations" ON product_variations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Store Settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_settings_user ON store_settings(user_id);

DROP POLICY IF EXISTS "Allow all operations on store_settings" ON store_settings;
CREATE POLICY "Users can manage their own store_settings" ON store_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

DROP POLICY IF EXISTS "Allow all operations on orders" ON orders;
CREATE POLICY "Users can manage their own orders" ON orders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Order Items (inherits from orders, but add for explicit filtering)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_order_items_user ON order_items(user_id);

DROP POLICY IF EXISTS "Allow all operations on order_items" ON order_items;
CREATE POLICY "Users can manage their own order_items" ON order_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Payment Methods
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

DROP POLICY IF EXISTS "Allow all operations on payment_methods" ON payment_methods;
CREATE POLICY "Users can manage their own payment_methods" ON payment_methods
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 8: ADD USER_ID TO REAL ESTATE TABLES
-- ============================================================================

-- Properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);

DROP POLICY IF EXISTS "Allow all operations on properties" ON properties;
CREATE POLICY "Users can manage their own properties" ON properties
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- NOTE: property_images table does not exist in the current schema
-- If you add it later, uncomment the following:
-- ALTER TABLE property_images ADD COLUMN IF NOT EXISTS user_id UUID;
-- CREATE INDEX IF NOT EXISTS idx_property_images_user ON property_images(user_id);
-- DROP POLICY IF EXISTS "Allow all operations on property_images" ON property_images;
-- CREATE POLICY "Users can manage their own property_images" ON property_images
--   FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 9: ADD USER_ID TO APPOINTMENTS TABLES
-- ============================================================================

-- Appointment Settings
ALTER TABLE appointment_settings ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_settings_user ON appointment_settings(user_id);

DROP POLICY IF EXISTS "Allow all operations on appointment_settings" ON appointment_settings;
CREATE POLICY "Users can manage their own appointment_settings" ON appointment_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);

DROP POLICY IF EXISTS "Allow all operations on appointments" ON appointments;
CREATE POLICY "Users can manage their own appointments" ON appointments
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Appointment Disabled Dates
ALTER TABLE appointment_disabled_dates ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_appointment_disabled_dates_user ON appointment_disabled_dates(user_id);

DROP POLICY IF EXISTS "Allow all operations on appointment_disabled_dates" ON appointment_disabled_dates;
CREATE POLICY "Users can manage their own appointment_disabled_dates" ON appointment_disabled_dates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 10: ADD USER_ID TO FOLLOW-UP TABLES
-- ============================================================================

-- Follow-up Response Patterns
ALTER TABLE follow_up_response_patterns ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_follow_up_response_patterns_user ON follow_up_response_patterns(user_id);

DROP POLICY IF EXISTS "Allow all operations on follow_up_response_patterns" ON follow_up_response_patterns;
CREATE POLICY "Users can manage their own follow_up_response_patterns" ON follow_up_response_patterns
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Follow-up Settings
ALTER TABLE follow_up_settings ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_settings_user ON follow_up_settings(user_id);

DROP POLICY IF EXISTS "Allow all operations on follow_up_settings" ON follow_up_settings;
CREATE POLICY "Users can manage their own follow_up_settings" ON follow_up_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 11: ADD USER_ID TO FORMS TABLES
-- ============================================================================

-- Forms
ALTER TABLE forms ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_forms_user ON forms(user_id);

DROP POLICY IF EXISTS "Allow all operations on forms" ON forms;
CREATE POLICY "Users can manage their own forms" ON forms
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Form Fields
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_form_fields_user ON form_fields(user_id);

DROP POLICY IF EXISTS "Allow all operations on form_fields" ON form_fields;
CREATE POLICY "Users can manage their own form_fields" ON form_fields
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Form Submissions
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_form_submissions_user ON form_submissions(user_id);

DROP POLICY IF EXISTS "Allow all operations on form_submissions" ON form_submissions;
CREATE POLICY "Users can manage their own form_submissions" ON form_submissions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 12: ADD USER_ID TO DIGITAL PRODUCTS TABLES
-- ============================================================================

-- Digital Products
ALTER TABLE digital_products ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_digital_products_user ON digital_products(user_id);

DROP POLICY IF EXISTS "Allow all operations on digital_products" ON digital_products;
CREATE POLICY "Users can manage their own digital_products" ON digital_products
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Digital Product Media
ALTER TABLE digital_product_media ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_digital_product_media_user ON digital_product_media(user_id);

DROP POLICY IF EXISTS "Allow all operations on digital_product_media" ON digital_product_media;
CREATE POLICY "Users can manage their own digital_product_media" ON digital_product_media
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Digital Product Purchases
ALTER TABLE digital_product_purchases ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_user ON digital_product_purchases(user_id);

DROP POLICY IF EXISTS "Allow all operations on digital_product_purchases" ON digital_product_purchases;
CREATE POLICY "Users can manage their own digital_product_purchases" ON digital_product_purchases
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 13: ADD USER_ID TO FEEDBACK TABLE
-- ============================================================================

-- Response Feedback
ALTER TABLE response_feedback ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_response_feedback_user ON response_feedback(user_id);

DROP POLICY IF EXISTS "Allow all operations on response_feedback" ON response_feedback;
CREATE POLICY "Users can manage their own response_feedback" ON response_feedback
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 14: SPECIAL POLICIES FOR PUBLIC ACCESS (FORMS, PRODUCTS, PROPERTIES)
-- ============================================================================

-- Public forms need to be viewable by anyone (for form submission)
CREATE POLICY "Anyone can view active forms" ON forms
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view form fields of active forms" ON form_fields
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM forms 
      WHERE forms.id = form_fields.form_id 
      AND forms.is_active = true
    )
  );

-- Public products need to be viewable
CREATE POLICY "Anyone can view active products" ON products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view active properties" ON properties
  FOR SELECT USING (is_active = true);

-- NOTE: property_images table does not exist in the current schema
-- CREATE POLICY "Anyone can view property images" ON property_images
--   FOR SELECT USING (true);

CREATE POLICY "Anyone can view active digital products" ON digital_products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view digital product media" ON digital_product_media
  FOR SELECT USING (true);

-- ============================================================================
-- PART 15: SERVICE ROLE BYPASS POLICIES
-- For webhook processing and background jobs that use service role key
-- ============================================================================

-- Create policies that allow service role to access all data
-- These are needed for Facebook webhook processing

CREATE POLICY "Service role can access all leads" ON leads
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all conversations" ON conversations
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all bot_settings" ON bot_settings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all connected_pages" ON connected_pages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all workflow_executions" ON workflow_executions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all appointments" ON appointments
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all documents" ON documents
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all form_submissions" ON form_submissions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all digital_product_purchases" ON digital_product_purchases
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all orders" ON orders
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all products" ON products
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all properties" ON properties
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all digital_products" ON digital_products
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all payment_methods" ON payment_methods
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all workflows" ON workflows
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can access all pipeline_stages" ON pipeline_stages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- PART 16: PAGE_ID TO USER LOOKUP TABLE
-- For webhook routing - maps Facebook page_id to user_id
-- ============================================================================

-- This is handled by connected_pages.user_id
-- When webhook receives a message with page_id, lookup user via connected_pages

-- Drop the old tenant_routes table as it's no longer needed
DROP TABLE IF EXISTS tenant_routes;

-- ============================================================================
-- PART 17: UPDATE VIEWS WITH USER FILTER
-- ============================================================================

-- Recreate upcoming_appointments view with user filter
DROP VIEW IF EXISTS upcoming_appointments;
CREATE VIEW upcoming_appointments AS
SELECT 
  a.*,
  l.name as lead_name,
  l.profile_pic as lead_profile_pic,
  l.phone as lead_phone,
  l.email as lead_email
FROM appointments a
LEFT JOIN leads l ON a.sender_psid = l.sender_id AND a.user_id = l.user_id
WHERE a.appointment_date >= CURRENT_DATE
  AND a.status IN ('pending', 'confirmed')
ORDER BY a.appointment_date, a.start_time;

-- Recreate feedback_stats view with user filter
DROP VIEW IF EXISTS feedback_stats;
CREATE VIEW feedback_stats AS
SELECT 
  user_id,
  COUNT(*) as total_feedback,
  COUNT(CASE WHEN is_helpful = true THEN 1 END) as helpful_count,
  COUNT(CASE WHEN is_helpful = false THEN 1 END) as not_helpful_count,
  AVG(rating) as avg_rating,
  COUNT(CASE WHEN correction IS NOT NULL THEN 1 END) as corrections_count,
  DATE_TRUNC('day', created_at) as feedback_date
FROM response_feedback
GROUP BY user_id, DATE_TRUNC('day', created_at)
ORDER BY feedback_date DESC;

-- ============================================================================
-- PART 18: UPDATE MATCH_DOCUMENTS FUNCTION FOR USER ISOLATION
-- ============================================================================

-- Update the match_documents function to filter by user_id
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT,
  filter_user_id UUID DEFAULT NULL
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
    AND (filter_user_id IS NULL OR documents.user_id = filter_user_id)
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- 
-- All tables now have user_id columns and RLS policies.
-- 
-- NEXT STEPS:
-- 1. Update all API routes to:
--    a. Get user from session
--    b. Include user_id when inserting data
--
-- 2. Update webhook handler to:
--    a. Lookup user_id from connected_pages by page_id
--    b. Pass user_id to all data operations
--
-- 3. Create onboarding flow to initialize user data:
--    - Default pipeline stages
--    - Default bot settings
--    - Default categories
--
-- ============================================================================
