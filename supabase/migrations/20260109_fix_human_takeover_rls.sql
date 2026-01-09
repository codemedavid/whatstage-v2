-- ============================================================================
-- FIX: Add service role bypass policy for human_takeover_sessions
-- 
-- The table has RLS enabled but was missing from the service role bypass 
-- policies in the multitenancy migration. This caused webhook handlers 
-- (which use supabaseAdmin/service role) to fail when inserting/querying
-- takeover sessions.
-- ============================================================================

-- Add service role bypass policy for human_takeover_sessions
CREATE POLICY "Service role can access all human_takeover_sessions" ON human_takeover_sessions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
