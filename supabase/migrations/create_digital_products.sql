-- ============================================================================
-- DIGITAL PRODUCTS MIGRATION
-- Run this in Supabase SQL Editor
-- For selling courses, digital downloads, and online content
-- ============================================================================

-- 1. CREATE DIGITAL_PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS digital_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'PHP',
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  checkout_form_id UUID REFERENCES forms(id) ON DELETE SET NULL, -- Link to Lead Gen Form for checkout
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  -- Access settings
  access_type TEXT DEFAULT 'instant', -- 'instant', 'scheduled', 'drip'
  access_duration_days INT, -- NULL = lifetime access
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_digital_products_category ON digital_products(category_id);
CREATE INDEX IF NOT EXISTS idx_digital_products_active ON digital_products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_digital_products_order ON digital_products(display_order);
CREATE INDEX IF NOT EXISTS idx_digital_products_form ON digital_products(checkout_form_id);

-- Enable RLS
ALTER TABLE digital_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on digital_products" ON digital_products
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_digital_products_updated_at ON digital_products;
CREATE TRIGGER update_digital_products_updated_at
  BEFORE UPDATE ON digital_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. CREATE DIGITAL_PRODUCT_MEDIA TABLE (for banner images/videos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS digital_product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_product_id UUID REFERENCES digital_products(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT, -- For video thumbnails
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_digital_product_media_product ON digital_product_media(digital_product_id);
CREATE INDEX IF NOT EXISTS idx_digital_product_media_order ON digital_product_media(digital_product_id, display_order);

-- Enable RLS
ALTER TABLE digital_product_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on digital_product_media" ON digital_product_media
  FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- 3. CREATE DIGITAL_PRODUCT_PURCHASES TABLE (track purchases/access)
-- ============================================================================

CREATE TABLE IF NOT EXISTS digital_product_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_product_id UUID REFERENCES digital_products(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  form_submission_id UUID REFERENCES form_submissions(id) ON DELETE SET NULL,
  purchase_date TIMESTAMPTZ DEFAULT NOW(),
  access_expires_at TIMESTAMPTZ, -- NULL = never expires
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  -- Payment info
  amount_paid DECIMAL(10, 2),
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_product ON digital_product_purchases(digital_product_id);
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_lead ON digital_product_purchases(lead_id);
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_submission ON digital_product_purchases(form_submission_id);
CREATE INDEX IF NOT EXISTS idx_digital_product_purchases_status ON digital_product_purchases(status) WHERE status = 'active';

-- Enable RLS
ALTER TABLE digital_product_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on digital_product_purchases" ON digital_product_purchases
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_digital_product_purchases_updated_at ON digital_product_purchases;
CREATE TRIGGER update_digital_product_purchases_updated_at
  BEFORE UPDATE ON digital_product_purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 4. ADD DIGITAL PRODUCT REFERENCE TO FORM_SUBMISSIONS
-- ============================================================================

ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS digital_product_id UUID REFERENCES digital_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_digital_product ON form_submissions(digital_product_id);


-- ============================================================================
-- COMMENTS FOR REFERENCE
-- ============================================================================

COMMENT ON TABLE digital_products IS 'Courses and digital products for sale';
COMMENT ON COLUMN digital_products.checkout_form_id IS 'Lead Gen Form used for checkout';
COMMENT ON COLUMN digital_products.access_type IS 'instant = immediate access, scheduled = set release date, drip = gradual content unlock';
COMMENT ON COLUMN digital_products.access_duration_days IS 'NULL means lifetime access';

COMMENT ON TABLE digital_product_media IS 'Images and videos for product banner/carousel';
COMMENT ON COLUMN digital_product_media.media_type IS 'Either image or video';
COMMENT ON COLUMN digital_product_media.thumbnail_url IS 'Video thumbnail for carousel preview';

COMMENT ON TABLE digital_product_purchases IS 'Track who purchased what digital product';
COMMENT ON COLUMN digital_product_purchases.form_submission_id IS 'Links to the checkout form submission';
