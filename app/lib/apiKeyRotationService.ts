/**
 * API Key Rotation Service
 * 
 * Manages multiple API keys with automatic rotation when rate limited.
 * Features:
 * - Round-robin selection with priority weighting
 * - Automatic cooldown when rate limited
 * - Fallback to environment variable if no DB keys configured
 * - Daily request tracking per key
 */

import { supabase } from './supabase';

// In-memory cache for available keys to reduce DB calls
interface CachedKey {
    id: string;
    apiKey: string;
    provider: string;
    priority: number;
}

let keyCache: CachedKey[] = [];
let keyCacheLastUpdated = 0;
const KEY_CACHE_TTL_MS = 30000; // 30 seconds cache

// Track which key we last used for round-robin
let lastUsedKeyIndex = -1;

// Track env key cooldown (in-memory since no DB record)
let envKeyCooldownUntil: number = 0;

/**
 * Check if the environment key is currently on cooldown
 */
function isEnvKeyOnCooldown(): boolean {
    return Date.now() < envKeyCooldownUntil;
}

/**
 * Put the environment key on cooldown
 */
function setEnvKeyCooldown(cooldownSeconds: number): void {
    envKeyCooldownUntil = Date.now() + cooldownSeconds * 1000;
    console.log(`[APIKeyRotation] Env key on cooldown for ${cooldownSeconds}s`);
}

export interface AvailableKey {
    apiKey: string;
    keyId: string | null; // null if using env fallback
}

/**
 * Get an available API key for the given provider
 * Uses environment variable by default, DB keys for rotation/fallback
 * 
 * @param provider - The AI provider (default: 'nvidia')
 * @param useDbKeys - Force using DB keys (for rotation after rate limit)
 * @returns The API key and its ID (for marking as rate limited later)
 */
export async function getAvailableApiKey(provider: string = 'nvidia', useDbKeys: boolean = false): Promise<AvailableKey> {
    try {
        const envKey = process.env.NVIDIA_API_KEY || '';

        // By default, use environment variable first
        if (!useDbKeys && envKey && !isEnvKeyOnCooldown()) {
            console.log('[APIKeyRotation] Using environment variable API key');
            return {
                apiKey: envKey,
                keyId: 'env', // Special ID to track env key
            };
        }

        const now = Date.now();

        // Refresh cache if expired
        if (now - keyCacheLastUpdated > KEY_CACHE_TTL_MS) {
            await refreshKeyCache(provider);
        }

        // Filter out keys that are currently on cooldown
        const availableKeys = keyCache.filter(key => key.provider === provider);

        if (availableKeys.length === 0) {
            // No DB keys available, try env key as last resort even if on cooldown
            console.log('[APIKeyRotation] No DB keys available, using environment variable as last resort');
            return {
                apiKey: envKey,
                keyId: null,
            };
        }

        // Round-robin selection with priority consideration
        // Higher priority keys appear more often in rotation
        const weightedKeys = getWeightedKeys(availableKeys);
        lastUsedKeyIndex = (lastUsedKeyIndex + 1) % weightedKeys.length;
        const selectedKey = weightedKeys[lastUsedKeyIndex];

        console.log(`[APIKeyRotation] Using DB key ${selectedKey.id.substring(0, 8)}... (priority: ${selectedKey.priority})`);

        // Increment daily counter (fire and forget)
        incrementDailyCounter(selectedKey.id).catch(err => {
            console.error('[APIKeyRotation] Error incrementing counter:', err);
        });

        return {
            apiKey: selectedKey.apiKey,
            keyId: selectedKey.id,
        };
    } catch (error) {
        console.error('[APIKeyRotation] Error getting API key:', error);
        // Fallback to environment variable
        return {
            apiKey: process.env.NVIDIA_API_KEY || '',
            keyId: null,
        };
    }
}

/**
 * Refresh the in-memory key cache from database
 */
async function refreshKeyCache(provider: string): Promise<void> {
    const now = new Date().toISOString();

    const { data: keys, error } = await supabase
        .from('api_keys')
        .select('id, api_key, provider, priority')
        .eq('provider', provider)
        .eq('is_active', true)
        .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
        .order('priority', { ascending: false });

    if (error) {
        console.error('[APIKeyRotation] Error fetching keys:', error);
        return;
    }

    keyCache = (keys || []).map(k => ({
        id: k.id,
        apiKey: k.api_key,
        provider: k.provider,
        priority: k.priority || 0,
    }));

    keyCacheLastUpdated = Date.now();
    console.log(`[APIKeyRotation] Cache refreshed: ${keyCache.length} keys available`);
}

/**
 * Create a weighted list of keys based on priority
 * Higher priority keys appear more times in the list
 */
function getWeightedKeys(keys: CachedKey[]): CachedKey[] {
    const weighted: CachedKey[] = [];

    for (const key of keys) {
        // Priority 0 = 1 entry, Priority 1 = 2 entries, etc.
        const weight = Math.max(1, (key.priority || 0) + 1);
        for (let i = 0; i < weight; i++) {
            weighted.push(key);
        }
    }

    return weighted;
}

/**
 * Mark a key as rate limited and put it on cooldown
 * 
 * @param keyId - The key ID to mark ('env' for environment key, null for fallback)
 * @param cooldownSeconds - How long to wait before using this key again
 */
export async function markKeyRateLimited(keyId: string | null, cooldownSeconds: number = 60): Promise<void> {
    // Handle environment key
    if (keyId === 'env') {
        setEnvKeyCooldown(cooldownSeconds);
        return;
    }

    if (!keyId) {
        console.log('[APIKeyRotation] Cannot mark fallback key as rate limited');
        return;
    }

    const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();

    try {
        const { error } = await supabase
            .from('api_keys')
            .update({
                cooldown_until: cooldownUntil,
                last_rate_limited_at: new Date().toISOString(),
            })
            .eq('id', keyId);

        if (error) {
            console.error('[APIKeyRotation] Error marking key rate limited:', error);
            return;
        }

        // Increment rate_limit_hits counter
        const { data: currentKey } = await supabase
            .from('api_keys')
            .select('rate_limit_hits')
            .eq('id', keyId)
            .single();

        if (currentKey) {
            await supabase
                .from('api_keys')
                .update({ rate_limit_hits: (currentKey.rate_limit_hits || 0) + 1 })
                .eq('id', keyId);
        }

        // Remove from cache immediately
        keyCache = keyCache.filter(k => k.id !== keyId);

        console.log(`[APIKeyRotation] DB key ${keyId.substring(0, 8)}... on cooldown for ${cooldownSeconds}s`);
    } catch (error) {
        console.error('[APIKeyRotation] Error in markKeyRateLimited:', error);
    }
}

/**
 * Increment the daily request counter for a key
 */
async function incrementDailyCounter(keyId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Use upsert logic - reset counter if it's a new day
    const { data: key } = await supabase
        .from('api_keys')
        .select('requests_today, last_request_date')
        .eq('id', keyId)
        .single();

    const newCount = key?.last_request_date === today
        ? (key.requests_today || 0) + 1
        : 1;

    await supabase
        .from('api_keys')
        .update({
            requests_today: newCount,
            last_request_date: today,
        })
        .eq('id', keyId);
}

/**
 * Check if there are any available keys (not all on cooldown)
 * Useful for circuit breaker to know if rotation is possible
 */
export async function hasAvailableKeys(provider: string = 'nvidia'): Promise<boolean> {
    const now = Date.now();

    // Refresh cache if expired
    if (now - keyCacheLastUpdated > KEY_CACHE_TTL_MS) {
        await refreshKeyCache(provider);
    }

    return keyCache.filter(k => k.provider === provider).length > 0;
}

/**
 * Force refresh the key cache
 * Call this after adding new keys or after cooldowns expire
 */
export async function forceRefreshKeyCache(provider: string = 'nvidia'): Promise<void> {
    keyCacheLastUpdated = 0; // Force cache expiry
    await refreshKeyCache(provider);
}

/**
 * Get current key status for monitoring/dashboard
 */
export async function getKeyStatus(provider: string = 'nvidia'): Promise<{
    totalKeys: number;
    availableKeys: number;
    cooldownKeys: number;
}> {
    const now = new Date().toISOString();

    const { data: allKeys } = await supabase
        .from('api_keys')
        .select('id, cooldown_until')
        .eq('provider', provider)
        .eq('is_active', true);

    const total = allKeys?.length || 0;
    const onCooldown = allKeys?.filter(k => k.cooldown_until && k.cooldown_until > now).length || 0;

    return {
        totalKeys: total,
        availableKeys: total - onCooldown,
        cooldownKeys: onCooldown,
    };
}
