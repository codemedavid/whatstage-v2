-- ============================================================================
-- ADD DIGITAL PRODUCT PURCHASED WORKFLOW TRIGGER TYPE
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Drop the existing constraint and add new one with digital_product_purchased
ALTER TABLE workflows 
  DROP CONSTRAINT IF EXISTS workflows_trigger_type_check;

ALTER TABLE workflows 
  ADD CONSTRAINT workflows_trigger_type_check 
  CHECK (trigger_type IN ('stage_change', 'appointment_booked', 'digital_product_purchased'));

-- 2. Add column for linking to specific digital product (optional)
ALTER TABLE workflows 
  ADD COLUMN IF NOT EXISTS trigger_digital_product_id UUID REFERENCES digital_products(id) ON DELETE SET NULL;

-- 3. Create index for digital product triggered workflows
CREATE INDEX IF NOT EXISTS idx_workflows_digital_product_trigger 
  ON workflows(trigger_digital_product_id) 
  WHERE trigger_type = 'digital_product_purchased';

-- 4. Update comment
COMMENT ON COLUMN workflows.trigger_type IS 'Type of trigger: stage_change (pipeline stage), appointment_booked, or digital_product_purchased';
COMMENT ON COLUMN workflows.trigger_digital_product_id IS 'Optional: specific digital product to trigger on. NULL means any digital product purchase.';
