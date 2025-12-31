-- ============================================================================
-- DIGITAL PRODUCT PURCHASES - ADD FACEBOOK PSID TRACKING
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add facebook_psid column to track which Facebook user made the purchase
ALTER TABLE digital_product_purchases 
  ADD COLUMN IF NOT EXISTS facebook_psid TEXT;

-- Add index for efficient lookups by PSID
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_psid 
  ON digital_product_purchases(facebook_psid);

-- Comment for documentation
COMMENT ON COLUMN digital_product_purchases.facebook_psid IS 'Facebook sender PSID of the user who made the purchase';
