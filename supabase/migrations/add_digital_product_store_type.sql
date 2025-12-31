-- Migration: Add digital_product as a store type option
-- This updates the CHECK constraint on store_settings.store_type

-- Drop the existing constraint
ALTER TABLE store_settings 
DROP CONSTRAINT IF EXISTS store_settings_store_type_check;

-- Add the new constraint with digital_product option
ALTER TABLE store_settings 
ADD CONSTRAINT store_settings_store_type_check 
CHECK (store_type IN ('ecommerce', 'real_estate', 'digital_product'));
