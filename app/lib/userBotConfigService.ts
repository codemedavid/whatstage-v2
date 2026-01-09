/**
 * User-aware bot configuration service
 * 
 * These functions fetch bot configuration for a specific user using supabaseAdmin.
 * This is used by webhook handlers that don't have user sessions but know the userId
 * from the page_id mapping.
 * 
 * CACHING STRATEGY:
 * - Uses in-memory Map caches with TTL-based expiration (CACHE_MS)
 * - Caches are per-container and will be lost on serverless cold starts
 * - Maximum cache size (MAX_CACHE_SIZE) with LRU-style eviction prevents memory bloat
 * - For mission-critical high-volume deployments, consider migrating to Redis/Upstash
 * 
 * LIMITATIONS:
 * - Cache is not shared across serverless instances
 * - Cold starts will result in cache misses (database fetch required)
 * - No cross-instance invalidation (updates in one instance won't clear cache in another)
 */

import { supabaseAdmin } from './supabaseAdmin';

// Cache configuration
const CACHE_MS = 60000; // 1 minute cache TTL
const MAX_CACHE_SIZE = 1000; // Maximum entries per cache to prevent memory bloat

// Caches keyed by userId with TTL tracking
const userSettingsCache = new Map<string, { data: any; fetchedAt: number }>();
const userRulesCache = new Map<string, { data: string[]; fetchedAt: number }>();
const userInstructionsCache = new Map<string, { data: string; fetchedAt: number }>();
const userApiKeyCache = new Map<string, { data: string | null; fetchedAt: number }>();

// Cache metrics for monitoring
let cacheHits = 0;
let cacheMisses = 0;
let evictions = 0;

/**
 * Evict oldest entries if cache exceeds maximum size (LRU-style eviction)
 */
function enforceMaxSize<T>(cache: Map<string, { data: T; fetchedAt: number }>, maxSize: number) {
    if (cache.size <= maxSize) return;

    // Sort by fetchedAt (oldest first) and remove oldest entries
    const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);

    const toRemove = cache.size - maxSize;
    for (let i = 0; i < toRemove; i++) {
        cache.delete(entries[i][0]);
        evictions++;
    }
}

/**
 * Clean expired entries from a cache
 */
function cleanExpiredEntries<T>(cache: Map<string, { data: T; fetchedAt: number }>, now: number) {
    const keysToDelete: string[] = [];
    cache.forEach((value, key) => {
        if (now - value.fetchedAt >= CACHE_MS) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => cache.delete(key));
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
    return {
        settingsCacheSize: userSettingsCache.size,
        rulesCacheSize: userRulesCache.size,
        instructionsCacheSize: userInstructionsCache.size,
        apiKeyCacheSize: userApiKeyCache.size,
        totalHits: cacheHits,
        totalMisses: cacheMisses,
        totalEvictions: evictions,
        hitRate: cacheHits + cacheMisses > 0
            ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%'
            : 'N/A'
    };
}

/**
 * Get bot settings for a specific user
 */
export async function getBotSettingsForUser(userId: string) {
    const now = Date.now();

    // Clean expired entries periodically (every 10th call roughly)
    if (Math.random() < 0.1) {
        cleanExpiredEntries(userSettingsCache, now);
    }

    const cached = userSettingsCache.get(userId);
    if (cached && now - cached.fetchedAt < CACHE_MS) {
        cacheHits++;
        return cached.data;
    }
    cacheMisses++;

    try {
        const { data, error } = await supabaseAdmin
            .from('bot_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('[UserBotConfig] Error fetching settings for user:', userId.substring(0, 8) + '...', error);
            return {
                bot_name: 'Assistant',
                bot_tone: 'helpful and professional',
                ai_model: 'qwen/qwen3-235b-a22b',
                primary_goal: 'lead_generation',
            };
        }

        userSettingsCache.set(userId, { data, fetchedAt: now });
        enforceMaxSize(userSettingsCache, MAX_CACHE_SIZE);
        return data;
    } catch (error) {
        console.error('[UserBotConfig] Error fetching settings:', error);
        return {
            bot_name: 'Assistant',
            bot_tone: 'helpful and professional',
            ai_model: 'qwen/qwen3-235b-a22b',
            primary_goal: 'lead_generation',
        };
    }
}

/**
 * Get bot rules for a specific user
 */
export async function getBotRulesForUser(userId: string): Promise<string[]> {
    const now = Date.now();

    // Clean expired entries periodically
    if (Math.random() < 0.1) {
        cleanExpiredEntries(userRulesCache, now);
    }

    const cached = userRulesCache.get(userId);
    if (cached && now - cached.fetchedAt < CACHE_MS) {
        cacheHits++;
        return cached.data;
    }
    cacheMisses++;

    try {
        const { data: rules, error } = await supabaseAdmin
            .from('bot_rules')
            .select('rule')
            .eq('user_id', userId)
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            console.error('[UserBotConfig] Error fetching rules for user:', userId.substring(0, 8) + '...', error);
            return [];
        }

        const rulesList = rules?.map((r: any) => r.rule) || [];
        userRulesCache.set(userId, { data: rulesList, fetchedAt: now });
        enforceMaxSize(userRulesCache, MAX_CACHE_SIZE);
        return rulesList;
    } catch (error) {
        console.error('[UserBotConfig] Error fetching rules:', error);
        return [];
    }
}

/**
 * Get bot instructions for a specific user
 */
export async function getBotInstructionsForUser(userId: string): Promise<string> {
    const now = Date.now();

    // Clean expired entries periodically
    if (Math.random() < 0.1) {
        cleanExpiredEntries(userInstructionsCache, now);
    }

    const cached = userInstructionsCache.get(userId);
    if (cached && now - cached.fetchedAt < CACHE_MS) {
        cacheHits++;
        return cached.data;
    }
    cacheMisses++;

    try {
        const { data, error } = await supabaseAdmin
            .from('bot_instructions')
            .select('instructions')
            .eq('user_id', userId)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('[UserBotConfig] Error fetching instructions for user:', userId.substring(0, 8) + '...', error);
            return '';
        }

        const instructions = data?.instructions || '';
        userInstructionsCache.set(userId, { data: instructions, fetchedAt: now });
        enforceMaxSize(userInstructionsCache, MAX_CACHE_SIZE);
        return instructions;
    } catch (error) {
        console.error('[UserBotConfig] Error fetching instructions:', error);
        return '';
    }
}

/**
 * Get payment methods for a specific user
 */
export async function getPaymentMethodsForUser(userId: string): Promise<string> {
    try {
        const { data, error } = await supabaseAdmin
            .from('payment_methods')
            .select('name, account_name, account_number, instructions, qr_code_url')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) {
            console.log('[UserBotConfig] No payment methods found for user:', userId.substring(0, 8) + '...');
            return '';
        }

        // Format payment methods for the AI
        let formatted = 'AVAILABLE PAYMENT METHODS:\n';
        data.forEach((pm, index) => {
            formatted += `\n${index + 1}. ${pm.name}`;
            if (pm.account_name) formatted += `\n   Account Name: ${pm.account_name}`;
            if (pm.account_number) formatted += `\n   Account/Number: ${pm.account_number}`;
            if (pm.instructions) formatted += `\n   Instructions: ${pm.instructions}`;
            if (pm.qr_code_url) formatted += `\n   [QR Code Available]`;
        });
        formatted += '\n';

        return formatted;
    } catch (error) {
        console.error('[UserBotConfig] Error fetching payment methods:', error);
        return '';
    }
}

/**
 * Get user's dedicated NVIDIA API key
 * Returns null if user has no dedicated key configured
 */
export async function getUserApiKeyForUser(userId: string): Promise<string | null> {
    const now = Date.now();

    // Clean expired entries periodically
    if (Math.random() < 0.1) {
        cleanExpiredEntries(userApiKeyCache, now);
    }

    const cached = userApiKeyCache.get(userId);
    if (cached && now - cached.fetchedAt < CACHE_MS) {
        cacheHits++;
        return cached.data;
    }
    cacheMisses++;

    try {
        const { data, error } = await supabaseAdmin
            .from('bot_settings')
            .select('nvidia_api_key')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('[UserBotConfig] Error fetching API key for user:', userId.substring(0, 8) + '...', error);
            return null;
        }

        const apiKey = data?.nvidia_api_key || null;
        userApiKeyCache.set(userId, { data: apiKey, fetchedAt: now });
        enforceMaxSize(userApiKeyCache, MAX_CACHE_SIZE);
        return apiKey;
    } catch (error) {
        console.error('[UserBotConfig] Error fetching API key:', error);
        return null;
    }
}

/**
 * Clear cache for a specific user (call after settings update)
 */
export function clearUserCache(userId: string) {
    userSettingsCache.delete(userId);
    userRulesCache.delete(userId);
    userInstructionsCache.delete(userId);
    userApiKeyCache.delete(userId);
}

/**
 * Clear all caches (useful for testing or forced refresh)
 */
export function clearAllCaches() {
    userSettingsCache.clear();
    userRulesCache.clear();
    userInstructionsCache.clear();
    userApiKeyCache.clear();
    cacheHits = 0;
    cacheMisses = 0;
    evictions = 0;
}
