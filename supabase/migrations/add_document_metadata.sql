-- Add metadata enrichment fields to documents table
-- These fields support tracking document freshness, confidence, and source

-- Add source_type column to track document origin
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user_upload';

-- Add confidence_score for document reliability scoring
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 1.0;

-- Add verified_at timestamp for freshness tracking
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NOW();

-- Add expires_at for time-sensitive content
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Create index on verified_at for freshness queries
CREATE INDEX IF NOT EXISTS documents_verified_at_idx 
  ON documents (verified_at DESC);

-- Create index on source_type for filtering
CREATE INDEX IF NOT EXISTS documents_source_type_idx 
  ON documents (source_type);

COMMENT ON COLUMN documents.source_type IS 'Source of the document: user_upload, setup_wizard, faq, api_import, etc.';
COMMENT ON COLUMN documents.confidence_score IS 'Reliability score 0.0-1.0, higher is more reliable';
COMMENT ON COLUMN documents.verified_at IS 'Last time this document was verified/updated';
COMMENT ON COLUMN documents.expires_at IS 'Optional expiration date for time-sensitive content';
