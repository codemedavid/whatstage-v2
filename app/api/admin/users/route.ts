import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { createClient } from '@/app/lib/supabaseServer';
import { initializeNewUser } from '@/app/lib/supabaseAdmin';

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

interface UserWithSettings {
    id: string;
    email: string;
    created_at: string;
    bot_settings: {
        bot_name: string;
        nvidia_api_key: string | null;
    } | null;
    connected_pages: {
        page_name: string;
    }[];
}

/**
 * GET /api/admin/users
 * List all users with their settings
 */
export async function GET() {
    const { isAdmin } = await verifyAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        // Get all users from auth.users via admin API
        const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

        if (authError) {
            console.error('[Admin Users] Auth list error:', authError);
            return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
        }

        // Get bot_settings for all users (for API key status)
        const { data: allBotSettings } = await supabaseAdmin
            .from('bot_settings')
            .select('user_id, bot_name, nvidia_api_key');

        // Get connected pages count per user
        const { data: allPages } = await supabaseAdmin
            .from('connected_pages')
            .select('user_id, page_name');

        // Build user list with settings
        const users = authUsers.users.map(authUser => {
            const settings = allBotSettings?.find(s => s.user_id === authUser.id);
            const pages = allPages?.filter(p => p.user_id === authUser.id) || [];

            return {
                id: authUser.id,
                email: authUser.email,
                created_at: authUser.created_at,
                bot_name: settings?.bot_name || 'Not configured',
                has_api_key: !!settings?.nvidia_api_key,
                pages_count: pages.length,
            };
        });

        return NextResponse.json({ users }, { status: 200 });
    } catch (error) {
        console.error('[Admin Users] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/users
 * Create a new user
 */
export async function POST(request: NextRequest) {
    const { isAdmin } = await verifyAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { email, password, bot_name, nvidia_api_key } = body;

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        // Create user via Supabase auth admin API
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm the email
        });

        if (authError) {
            console.error('[Admin Users] Create user error:', authError);
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        const newUserId = authData.user.id;

        // Initialize user data (pipeline stages, bot settings, etc.)
        const initialized = await initializeNewUser(newUserId);
        if (!initialized) {
            console.error('[Admin Users] Failed to initialize user data');
            // User was created but initialization failed - try to clean up
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            return NextResponse.json({ error: 'Failed to initialize user data' }, { status: 500 });
        }

        // Update bot settings with provided values
        if (bot_name || nvidia_api_key) {
            const updates: { bot_name?: string; nvidia_api_key?: string } = {};
            if (bot_name) updates.bot_name = bot_name;
            if (nvidia_api_key) updates.nvidia_api_key = nvidia_api_key;

            const { error: settingsError } = await supabaseAdmin
                .from('bot_settings')
                .update(updates)
                .eq('user_id', newUserId);

            if (settingsError) {
                console.error('[Admin Users] Failed to update bot_settings:', {
                    userId: newUserId,
                    attemptedUpdates: { bot_name: !!bot_name, nvidia_api_key: !!nvidia_api_key },
                    error: settingsError,
                });
                // Rollback: delete the created user to avoid inconsistent state
                await supabaseAdmin.auth.admin.deleteUser(newUserId);
                return NextResponse.json(
                    { error: 'Failed to configure user settings' },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({
            success: true,
            user: {
                id: newUserId,
                email: authData.user.email,
            }
        }, { status: 201 });
    } catch (error) {
        console.error('[Admin Users] Create error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
