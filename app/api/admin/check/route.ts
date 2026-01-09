import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { createClient } from '@/app/lib/supabaseServer';

/**
 * GET /api/admin/check
 * Check if the current user is an admin
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ isAdmin: false }, { status: 200 });
        }

        // Check if user is in admin_users table
        const { data: adminUser, error } = await supabaseAdmin
            .from('admin_users')
            .select('id')
            .eq('user_id', user.id)
            .single();

        if (error || !adminUser) {
            return NextResponse.json({ isAdmin: false }, { status: 200 });
        }

        return NextResponse.json({ isAdmin: true }, { status: 200 });
    } catch (error) {
        console.error('[Admin Check] Error:', error);
        return NextResponse.json({ isAdmin: false }, { status: 200 });
    }
}
