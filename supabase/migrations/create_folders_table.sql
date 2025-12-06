-- Create document_folders table for persisting folders
CREATE TABLE IF NOT EXISTS document_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add folder_id column to documents table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'folder_id'
    ) THEN
        ALTER TABLE documents ADD COLUMN folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Enable RLS on document_folders
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations for now (adjust based on your auth setup)
CREATE POLICY "Allow all operations on document_folders" ON document_folders
    FOR ALL USING (true) WITH CHECK (true);
