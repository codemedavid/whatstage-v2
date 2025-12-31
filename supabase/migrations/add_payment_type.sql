-- Add payment_type column to digital_products
-- Values: 'one_time' (default) or 'recurring'

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' 
CHECK (payment_type IN ('one_time', 'recurring'));

-- Add billing_interval for recurring payments (monthly, yearly, etc.)
ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly'
CHECK (billing_interval IN ('monthly', 'yearly'));

COMMENT ON COLUMN digital_products.payment_type IS 'one_time = single payment, recurring = subscription';
COMMENT ON COLUMN digital_products.billing_interval IS 'For recurring: monthly or yearly billing cycle';
