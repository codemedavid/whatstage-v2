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

import { createHash } from 'crypto';
import { supabase } from './supabase';
import { getUserApiKeyForUser } from './userBotConfigService';

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

// Track user key cooldowns (in-memory since tracked per-user without DB updates)
const userKeyCooldowns = new Map<string, number>();

/**
 * Generate a one-way hash token from userId for safe logging (no PII)
 */
function hashUserIdForLogging(userId: string): string {
    return createHash('sha256').update(userId).digest('hex').substring(0, 8);
}

/**
 * Cleanup stale entries from userKeyCooldowns Map to prevent memory leak
 */
function cleanupStaleUserCooldowns(): void {
    const now = Date.now();
    // Use Array.from() for TypeScript compatibility with Map iteration
    Array.from(userKeyCooldowns.entries()).forEach(([userId, cooldownUntil]) => {
        if (cooldownUntil <= now) {
            userKeyCooldowns.delete(userId);
        }
    });
}

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

/**
 * Check if a user's key is currently on cooldown
 */
function isUserKeyOnCooldown(userId: string): boolean {
    // Lazy cleanup: remove stale entries before checking
    cleanupStaleUserCooldowns();
    const cooldownUntil = userKeyCooldowns.get(userId);
    if (!cooldownUntil) return false;
    return Date.now() < cooldownUntil;
}

/**
 * Put a user's dedicated key on cooldown
 */
function setUserKeyCooldown(userId: string, cooldownSeconds: number): void {
    // Lazy cleanup: remove stale entries before adding
    cleanupStaleUserCooldowns();
    userKeyCooldowns.set(userId, Date.now() + cooldownSeconds * 1000);
    // Log with hashed token to avoid exposing PII
    const hashedToken = hashUserIdForLogging(userId);
    console.log(`[APIKeyRotation] User key [${hashedToken}] on cooldown for ${cooldownSeconds}s`);
}

export interface AvailableKey {
    apiKey: string;
    keyId: string; // 'env' for env fallback, 'user:userId' for user keys, or DB key ID
    keyType: 'user' | 'rotation' | 'env'; // Track which tier is being used
    isOnCooldown: boolean; // true if this key is currently on cooldown
}

/**
 * Get an available API key for the given provider
 * 
 * 3-TIER FALLBACK HIERARCHY:
 * 1. User's dedicated API key (if userId provided and key configured)
 * 2. DB key rotation pool (api_keys table)
 * 3. .env NVIDIA_API_KEY (last resort)
 * 
 * @param provider - The AI provider (default: 'nvidia')
 * @param userId - Optional user ID for fetching dedicated key
 * @returns The API key, its ID, and which tier it's from
 */
export async function getAvailableApiKey(provider: string = 'nvidia', userId?: string | null): Promise<AvailableKey> {
    try {
        const envKey = process.env.NVIDIA_API_KEY || '';

        // === TIER 1: User's dedicated API key ===
        if (userId && !isUserKeyOnCooldown(userId)) {
            const userKey = await getUserApiKeyForUser(userId);
            if (userKey) {
                console.log(`[APIKeyRotation] Using user's dedicated API key for user [${hashUserIdForLogging(userId)}]`);
                return {
                    apiKey: userKey,
                    keyId: `user:${userId}`, // Special ID to track user's key
                    keyType: 'user',
                    isOnCooldown: false,
                };
            }
            console.log(`[APIKeyRotation] User [${hashUserIdForLogging(userId)}] has no dedicated key, trying rotation pool...`);
        } else if (userId && isUserKeyOnCooldown(userId)) {
            console.log(`[APIKeyRotation] User key on cooldown for [${hashUserIdForLogging(userId)}], trying rotation pool...`);
        }

        // === TIER 2: DB key rotation pool ===
        const now = Date.now();

        // Refresh cache if expired
        if (now - keyCacheLastUpdated > KEY_CACHE_TTL_MS) {
            await refreshKeyCache(provider);
        }

        // Filter keys by provider
        const availableKeys = keyCache.filter(key => key.provider === provider);

        if (availableKeys.length > 0) {
            // Round-robin selection with priority consideration
            const weightedKeys = getWeightedKeys(availableKeys);
            lastUsedKeyIndex = (lastUsedKeyIndex + 1) % weightedKeys.length;
            const selectedKey = weightedKeys[lastUsedKeyIndex];

            console.log(`[APIKeyRotation] Using rotation pool key ${selectedKey.id.substring(0, 8)}... (priority: ${selectedKey.priority})`);

            // Increment daily counter (fire and forget)
            incrementDailyCounter(selectedKey.id).catch(err => {
                console.error('[APIKeyRotation] Error incrementing counter:', err);
            });

            return {
                apiKey: selectedKey.apiKey,
                keyId: selectedKey.id,
                keyType: 'rotation',
                isOnCooldown: false,
            };
        }

        console.log('[APIKeyRotation] No rotation pool keys available, using .env fallback as last resort');

        // === TIER 3: .env fallback ===
        const envOnCooldown = isEnvKeyOnCooldown();
        return {
            apiKey: envKey,
            keyId: 'env',
            keyType: 'env',
            isOnCooldown: envOnCooldown,
        };
    } catch (error) {
        console.error('[APIKeyRotation] Error getting API key:', error);
        // Fallback to environment variable
        return {
            apiKey: process.env.NVIDIA_API_KEY || '',
            keyId: 'env',
            keyType: 'env',
            isOnCooldown: isEnvKeyOnCooldown(),
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
 * @param keyId - The key ID to mark ('env' for environment key, 'user:userId' for user keys, or DB key ID)
 * @param cooldownSeconds - How long to wait before using this key again
 */
export async function markKeyRateLimited(keyId: string, cooldownSeconds: number = 60): Promise<void> {
    // Handle environment key
    if (keyId === 'env') {
        setEnvKeyCooldown(cooldownSeconds);
        return;
    }

    // Handle user's dedicated key
    if (keyId.startsWith('user:')) {
        const userId = keyId.replace('user:', '');
        setUserKeyCooldown(userId, cooldownSeconds);
        return;
    }

    // Should not happen with new interface, but guard against empty strings
    if (!keyId) {
        console.log('[APIKeyRotation] Cannot mark empty key as rate limited');
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
