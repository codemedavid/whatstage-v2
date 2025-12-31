-- ============================================================================
-- MULTI-STEP FORMS MIGRATION
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
CREATE POLICY "Allow all operations on form_file_uploads" ON form_file_uploads FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_submission ON form_file_uploads(form_submission_id);
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_field ON form_file_uploads(field_id);

-- Comment for documentation
COMMENT ON COLUMN form_fields.step_number IS 'Step number for multi-step forms (1-based)';
COMMENT ON COLUMN forms.page_id IS 'Optional Facebook page ID for Messenger redirect after submission';
COMMENT ON TABLE form_file_uploads IS 'Stores uploaded files from form submissions (e.g., payment screenshots)';
