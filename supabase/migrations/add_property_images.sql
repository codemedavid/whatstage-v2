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
