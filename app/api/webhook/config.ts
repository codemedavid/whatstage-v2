import { supabase } from '@/app/lib/supabase';

// Cache settings to avoid database calls on every request
let cachedSettings: any = null;
let settingsLastFetched = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Cache for connected page tokens
const pageTokenCache = new Map<string, { token: string; fetchedAt: number }>();
const PAGE_TOKEN_CACHE_MS = 60000; // 1 minute cache

export async function getSettings() {
    const now = Date.now();
    if (cachedSettings && now - settingsLastFetched < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
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

// Get page access token - first tries connected_pages table, then falls back to bot_settings
export async function getPageToken(pageId?: string): Promise<string | null> {
    // If we have a page ID, try to get page-specific token first
    if (pageId) {
        const now = Date.now();
        const cached = pageTokenCache.get(pageId);
        if (cached && now - cached.fetchedAt < PAGE_TOKEN_CACHE_MS) {
            return cached.token;
        }

        try {
            const { data, error } = await supabase
                .from('connected_pages')
                .select('page_access_token')
                .eq('page_id', pageId)
                .eq('is_active', true)
                .single();

            if (!error && data?.page_access_token) {
                pageTokenCache.set(pageId, { token: data.page_access_token, fetchedAt: now });
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
