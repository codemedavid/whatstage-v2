-- Add notification settings columns to digital_products
-- These settings control the Messenger notification sent after a purchase

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_title TEXT;

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_greeting TEXT;

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_button_text TEXT;

ALTER TABLE digital_products 
ADD COLUMN IF NOT EXISTS notification_button_url TEXT;

COMMENT ON COLUMN digital_products.notification_title IS 'Title for the purchase confirmation notification in Messenger';
COMMENT ON COLUMN digital_products.notification_greeting IS 'Greeting message sent after purchase completion';
COMMENT ON COLUMN digital_products.notification_button_text IS 'Optional CTA button text for the notification';
COMMENT ON COLUMN digital_products.notification_button_url IS 'Optional CTA button URL for the notification';
