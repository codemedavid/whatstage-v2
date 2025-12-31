-- Add creator_name column to digital_products
ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS creator_name TEXT;

COMMENT ON COLUMN digital_products.creator_name IS 'Name of the creator/author of the digital product';
