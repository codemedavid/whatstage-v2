-- Create document_sources table for tracking uploaded documents
-- This tracks the source files that have been uploaded and processed

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

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_document_sources_status ON document_sources(status);
CREATE INDEX IF NOT EXISTS idx_document_sources_created ON document_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_sources_category ON document_sources(category_id);

-- Enable RLS
ALTER TABLE document_sources ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust based on your auth setup)
CREATE POLICY "Allow all operations on document_sources" ON document_sources
  FOR ALL USING (true) WITH CHECK (true);

-- Add source_file_id column to documents table to link chunks back to source
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS source_file_id UUID REFERENCES document_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_source_file ON documents(source_file_id);
