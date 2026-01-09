import { supabaseAdmin, getUserIdFromPageId } from '@/app/lib/supabaseAdmin';

// Cache settings to avoid database calls on every request
// Now keyed by user_id for multi-user support
const settingsCache = new Map<string, { settings: any; fetchedAt: number }>();
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Cache for connected page tokens
const pageTokenCache = new Map<string, { token: string; userId: string; fetchedAt: number }>();
const PAGE_TOKEN_CACHE_MS = 60000; // 1 minute cache

// Legacy global settings cache for backwards compatibility
let cachedSettings: any = null;
let settingsLastFetched = 0;

/**
 * Get settings for a specific user
 * @param userId - The user ID to get settings for
 */
export async function getSettingsForUser(userId: string) {
    const now = Date.now();
    const cached = settingsCache.get(userId);
    if (cached && now - cached.fetchedAt < SETTINGS_CACHE_MS) {
        return cached.settings;
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('bot_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('Error fetching settings for user:', userId, error);
            return {
                facebook_verify_token: 'TEST_TOKEN',
                facebook_page_access_token: null,
            };
        }

        settingsCache.set(userId, { settings: data, fetchedAt: now });
        return data;
    } catch (error) {
        console.error('Error fetching settings for user:', userId, error);
        return {
            facebook_verify_token: 'TEST_TOKEN',
            facebook_page_access_token: null,
        };
    }
}

/**
 * Get settings - legacy function for backwards compatibility
 * Falls back to first available settings if no user context.
 * 
 * @deprecated Use getSettingsForUser(userId) for multi-tenant safety.
 * Falls back to first available settings without user filtering!
 */
export async function getSettings() {
    console.warn('[DEPRECATION] getSettings() called without userId - use getSettingsForUser() for multi-tenant safety');
    const now = Date.now();
    if (cachedSettings && now - settingsLastFetched < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching settings:', error);
            return {
                facebook_verify_token: 'TEST_TOKEN',
                facebook_page_access_token: null,
            };
        }

        cachedSettings = data;
        settingsLastFetched = now;
        return data;
    } catch (error) {
        console.error('Error fetching settings:', error);
        return {
            facebook_verify_token: 'TEST_TOKEN',
            facebook_page_access_token: null,
        };
    }
}

/**
 * Get page access token and user_id from a page_id
 * @param pageId - The Facebook page ID
 * @returns Object with token and userId
 */
export async function getPageTokenAndUser(pageId: string): Promise<{ token: string | null; userId: string | null }> {
    const now = Date.now();
    const cached = pageTokenCache.get(pageId);
    if (cached && now - cached.fetchedAt < PAGE_TOKEN_CACHE_MS) {
        return { token: cached.token, userId: cached.userId };
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('connected_pages')
            .select('page_access_token, user_id')
            .eq('page_id', pageId)
            .eq('is_active', true)
            .single();

        if (!error && data?.page_access_token && data?.user_id) {
            pageTokenCache.set(pageId, {
                token: data.page_access_token,
                userId: data.user_id,
                fetchedAt: now
            });
            return { token: data.page_access_token, userId: data.user_id };
        }
    } catch (error) {
        console.error('Error fetching page token and user:', error);
    }

    return { token: null, userId: null };
}

/**
 * Get page access token - first tries connected_pages table, then falls back to bot_settings
 * @deprecated Use getPageTokenAndUser instead for user-based data isolation
 */
export async function getPageToken(pageId?: string): Promise<string | null> {
    // If we have a page ID, try to get page-specific token first
    if (pageId) {
        const now = Date.now();
        const cached = pageTokenCache.get(pageId);
        if (cached && now - cached.fetchedAt < PAGE_TOKEN_CACHE_MS) {
            return cached.token;
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('connected_pages')
                .select('page_access_token, user_id')
                .eq('page_id', pageId)
                .eq('is_active', true)
                .single();

            if (!error && data?.page_access_token) {
                pageTokenCache.set(pageId, {
                    token: data.page_access_token,
                    userId: data.user_id || '',
                    fetchedAt: now
                });
                return data.page_access_token;
            }
        } catch (error) {
            console.error('Error fetching page token:', error);
        }
    }

    // Fallback to bot_settings or environment variable
    const settings = await getSettings();
    return settings.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null;
}

/**
 * Get user_id from a page_id
 * Wrapper around supabaseAdmin.getUserIdFromPageId for convenience
 */
export { getUserIdFromPageId };
