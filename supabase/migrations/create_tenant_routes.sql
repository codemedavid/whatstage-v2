-- ============================================================================
-- TENANT ROUTING TABLE FOR CENTRAL WEBHOOK ROUTER
-- This table maps Facebook Page IDs to customer instance URLs
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT UNIQUE,                    -- Facebook Page ID (NULL until customer connects)
  tenant_name TEXT NOT NULL,              -- Customer/Tenant Name (e.g., "Customer A")
  destination_url TEXT NOT NULL UNIQUE,   -- Full webhook URL (unique per tenant)
  secret_key TEXT,                        -- Optional: shared secret for request validation
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_tenant_routes_page_id ON tenant_routes(page_id);
CREATE INDEX IF NOT EXISTS idx_tenant_routes_active ON tenant_routes(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE tenant_routes ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (restrict in production via API key/auth)
CREATE POLICY "Allow all operations on tenant_routes" ON tenant_routes
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_tenant_routes_updated_at ON tenant_routes;
CREATE TRIGGER update_tenant_routes_updated_at
  BEFORE UPDATE ON tenant_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE tenant_routes IS 'Maps Facebook Page IDs to customer instance webhook URLs for the Central Router';
