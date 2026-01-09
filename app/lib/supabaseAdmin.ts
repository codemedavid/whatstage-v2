import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client
 * Uses service role key to bypass Row Level Security (RLS).
 * 
 * Use this for:
 * - Webhook processing (Facebook webhooks don't have user auth)
 * - Background jobs (cron jobs, scheduled tasks)
 * - Admin operations that need to access all data
 * 
 * ⚠️ NEVER expose this client to the frontend!
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables before creating client
if (!supabaseUrl || !supabaseServiceKey) {
    const missingVars = [];
    if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

    console.error(`[SupabaseAdmin] FATAL: Missing required environment variables: ${missingVars.join(', ')}. Admin operations will fail.`);

    // Throw error to prevent usage with invalid configuration
    throw new Error(`[SupabaseAdmin] Missing required environment variables: ${missingVars.join(', ')}`);
}

export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

/**
 * Get user_id from a Facebook page_id
 * Used by webhooks to route messages to the correct user's data
 */
export async function getUserIdFromPageId(pageId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('connected_pages')
        .select('user_id')
        .eq('page_id', pageId)
        .eq('is_active', true)
        .single();

    if (error || !data) {
        console.error(`[SupabaseAdmin] Failed to lookup user for page ${pageId}:`, error);
        return null;
    }

    return data.user_id;
}

/**
 * Initialize default data for a new user with rollback on failure
 * Call this after a user signs up
 */
export async function initializeNewUser(userId: string): Promise<boolean> {
    // Track what was inserted for potential rollback
    const insertedTables: string[] = [];

    try {
        // Create default pipeline stages
        const { error: stagesError } = await supabaseAdmin
            .from('pipeline_stages')
            .insert([
                { user_id: userId, name: 'New Lead', display_order: 0, color: '#3b82f6', is_default: true },
                { user_id: userId, name: 'Interested', display_order: 1, color: '#8b5cf6', is_default: false },
                { user_id: userId, name: 'Qualified', display_order: 2, color: '#f59e0b', is_default: false },
                { user_id: userId, name: 'Negotiating', display_order: 3, color: '#10b981', is_default: false },
                { user_id: userId, name: 'Won', display_order: 4, color: '#22c55e', is_default: false },
                { user_id: userId, name: 'Lost', display_order: 5, color: '#ef4444', is_default: false },
            ]);

        if (stagesError) {
            console.error('[InitUser] Failed to create pipeline stages:', stagesError);
            await rollbackUserData(userId, insertedTables);
            return false;
        }
        insertedTables.push('pipeline_stages');

        // Create default bot settings
        const { error: settingsError } = await supabaseAdmin
            .from('bot_settings')
            .insert({
                user_id: userId,
                bot_name: 'Assistant',
                bot_tone: 'helpful and professional',
                setup_step: 0,
                is_setup_completed: false,
            });

        if (settingsError) {
            console.error('[InitUser] Failed to create bot settings:', settingsError);
            await rollbackUserData(userId, insertedTables);
            return false;
        }
        insertedTables.push('bot_settings');

        // Create default knowledge categories
        const { error: categoriesError } = await supabaseAdmin
            .from('knowledge_categories')
            .insert([
                { user_id: userId, name: 'General', type: 'general', color: 'gray' },
                { user_id: userId, name: 'Pricing', type: 'general', color: 'green' },
                { user_id: userId, name: 'FAQs', type: 'qa', color: 'blue' },
                { user_id: userId, name: 'Product Info', type: 'general', color: 'purple' },
            ]);

        if (categoriesError) {
            console.error('[InitUser] Failed to create knowledge categories:', categoriesError);
            await rollbackUserData(userId, insertedTables);
            return false;
        }
        insertedTables.push('knowledge_categories');

        // Create default follow-up settings
        const { error: followUpError } = await supabaseAdmin
            .from('follow_up_settings')
            .insert({
                user_id: userId,
                is_enabled: true,
            });

        if (followUpError) {
            console.error('[InitUser] Failed to create follow-up settings:', followUpError);
            await rollbackUserData(userId, insertedTables);
            return false;
        }
        insertedTables.push('follow_up_settings');

        // Create default appointment settings
        const { error: appointmentError } = await supabaseAdmin
            .from('appointment_settings')
            .insert({
                user_id: userId,
                business_hours_start: '09:00:00',
                business_hours_end: '17:00:00',
                slot_duration_minutes: 60,
                days_available: [1, 2, 3, 4, 5],
                is_active: true,
            });

        if (appointmentError) {
            console.error('[InitUser] Failed to create appointment settings:', appointmentError);
            await rollbackUserData(userId, insertedTables);
            return false;
        }
        insertedTables.push('appointment_settings');

        console.log(`[InitUser] Successfully initialized user ${userId}`);
        return true;

    } catch (error) {
        console.error('[InitUser] Error initializing user:', error);
        await rollbackUserData(userId, insertedTables);
        return false;
    }
}

/**
 * Rollback user data by deleting from tables in reverse order
 */
async function rollbackUserData(userId: string, insertedTables: string[]): Promise<void> {
    console.log(`[InitUser] Rolling back user ${userId} data from tables: ${insertedTables.join(', ')}`);

    // Delete in reverse order to respect any foreign key constraints
    const tablesToDelete = [...insertedTables].reverse();

    for (const table of tablesToDelete) {
        try {
            const { error } = await supabaseAdmin
                .from(table)
                .delete()
                .eq('user_id', userId);

            if (error) {
                console.error(`[InitUser] Failed to rollback ${table}:`, error);
            } else {
                console.log(`[InitUser] Rolled back ${table} for user ${userId}`);
            }
        } catch (err) {
            console.error(`[InitUser] Exception rolling back ${table}:`, err);
        }
    }
}
