-- Add thumbnail_url column to digital_products for a dedicated thumbnail image
ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN digital_products.thumbnail_url IS 'Dedicated thumbnail image URL for product cards and previews';
