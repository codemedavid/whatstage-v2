import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { createClient } from '@/app/lib/supabaseServer';

/**
 * Helper to verify admin access
 */
async function verifyAdmin(): Promise<{ isAdmin: boolean; userId: string | null }> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return { isAdmin: false, userId: null };
        }

        const { data: adminUser } = await supabaseAdmin
            .from('admin_users')
            .select('id')
            .eq('user_id', user.id)
            .single();

        return { isAdmin: !!adminUser, userId: user.id };
    } catch {
        return { isAdmin: false, userId: null };
    }
}

/**
 * GET /api/admin/users/[id]
 * Get detailed user info
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { isAdmin } = await verifyAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id: userId } = await params;

    try {
        // Get user from auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);

        if (authError || !authData.user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get bot settings
        const { data: settings } = await supabaseAdmin
            .from('bot_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Get connected pages
        const { data: pages } = await supabaseAdmin
            .from('connected_pages')
            .select('page_id, page_name, is_active')
            .eq('user_id', userId);

        return NextResponse.json({
            user: {
                id: authData.user.id,
                email: authData.user.email,
                created_at: authData.user.created_at,
                last_sign_in_at: authData.user.last_sign_in_at,
            },
            settings: settings || null,
            pages: pages || [],
        }, { status: 200 });
    } catch (error) {
        console.error('[Admin Users] Get user error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/users/[id]
 * Update user settings (including API key)
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { isAdmin } = await verifyAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id: userId } = await params;

    try {
        const body = await request.json();
        const { bot_name, nvidia_api_key, email, password } = body;

        // Verify user exists
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authError || !authData.user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Update auth user if email or password provided
        if (email || password) {
            const authUpdates: { email?: string; password?: string } = {};
            if (email) authUpdates.email = email;
            if (password) authUpdates.password = password;

            const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
                userId,
                authUpdates
            );

            if (updateAuthError) {
                console.error('[Admin Users] Update auth error:', updateAuthError);
                return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
            }
        }

        // Update bot settings if provided
        if (bot_name !== undefined || nvidia_api_key !== undefined) {
            const updates: { bot_name?: string; nvidia_api_key?: string | null } = {};
            if (bot_name !== undefined) updates.bot_name = bot_name;
            if (nvidia_api_key !== undefined) updates.nvidia_api_key = nvidia_api_key || null;

            const { error: settingsError } = await supabaseAdmin
                .from('bot_settings')
                .update(updates)
                .eq('user_id', userId);

            if (settingsError) {
                console.error('[Admin Users] Update settings error:', settingsError);
                return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('[Admin Users] Update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/users/[id]
 * Delete a user and their associated data
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { isAdmin, userId: adminId } = await verifyAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id: userId } = await params;

    // Prevent self-deletion
    if (userId === adminId) {
        return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    try {
        // Verify user exists
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authError || !authData.user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Delete user data from related tables (in order to respect FK constraints)
        // Note: Child tables must be deleted before parent tables
        // Order: order_items → orders, lead_messages → leads, workflow_executions → workflows, etc.
        const tablesToClean = [
            // Child tables first (depend on parent tables)
            'order_items',          // FK → orders
            'lead_messages',        // FK → leads
            'workflow_executions',  // FK → workflows
            'knowledge_entries',    // FK → knowledge_categories
            // Parent tables (after their children are deleted)
            'orders',
            'leads',
            'workflows',
            'knowledge_categories',
            // Other tables (no notable FK dependencies to tables in this list)
            'products',
            'bot_rules',
            'bot_settings',
            'pipeline_stages',
            'connected_pages',
            'follow_up_settings',
            'appointment_settings',
            'appointments',
            'admin_users',
        ];

        for (const table of tablesToClean) {
            await supabaseAdmin
                .from(table)
                .delete()
                .eq('user_id', userId);
        }

        // Finally, delete the auth user
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('[Admin Users] Delete auth user error:', deleteError);
            return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('[Admin Users] Delete error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
