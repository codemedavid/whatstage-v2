-- ============================================================================
-- ADD PAYMENT TYPE COLUMNS TO DIGITAL_PRODUCTS
-- Run this in Supabase SQL Editor
-- Adds payment_type and billing_interval_months for subscription support
-- ============================================================================

-- Add payment_type column (one_time or monthly recurring)
ALTER TABLE digital_products 
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' 
    CHECK (payment_type IN ('one_time', 'monthly'));

-- Add billing_interval_months for recurring payments
ALTER TABLE digital_products 
  ADD COLUMN IF NOT EXISTS billing_interval_months INTEGER DEFAULT 1;

-- Add thumbnail_url for product card display
ALTER TABLE digital_products 
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN digital_products.payment_type IS 'one_time = single payment, monthly = recurring subscription';
COMMENT ON COLUMN digital_products.billing_interval_months IS 'For monthly payments, how many months between charges (1 = monthly, 3 = quarterly, etc)';
COMMENT ON COLUMN digital_products.thumbnail_url IS 'Thumbnail image for product cards in Messenger';

-- Update existing records to have default values
UPDATE digital_products 
SET payment_type = 'one_time', billing_interval_months = 1 
WHERE payment_type IS NULL;

SELECT 'Migration completed: payment_type and billing_interval_months columns added' as result;
