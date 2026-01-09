import { supabaseAdmin } from './supabaseAdmin';
import { deactivateSmartPassive } from './smartPassiveService';

// Cache settings to avoid database calls on every request
// Key: userId, Value: { timeout, fetchedAt }
const cachedTimeouts = new Map<string, { timeout: number; fetchedAt: number }>();
const TIMEOUT_CACHE_MS = 60000; // 1 minute cache

/**
 * Get the human takeover timeout setting from bot_settings
 */
export async function getHumanTakeoverTimeout(userId?: string | null): Promise<number> {
    const cacheKey = userId || 'default';
    const now = Date.now();
    const cached = cachedTimeouts.get(cacheKey);

    if (cached && now - cached.fetchedAt < TIMEOUT_CACHE_MS) {
        return cached.timeout;
    }

    try {
        let query = supabaseAdmin
            .from('bot_settings')
            .select('human_takeover_timeout_minutes');

        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            // Explicitly query for global default where user_id is NULL
            query = query.is('user_id', null);
        }

        const { data, error } = await query.limit(1).single();

        if (error) {
            console.error('Error fetching takeover timeout:', error);
            return 5; // Default 5 minutes
        }

        const timeout = data?.human_takeover_timeout_minutes ?? 5;
        cachedTimeouts.set(cacheKey, { timeout, fetchedAt: now });
        return timeout;
    } catch (error) {
        console.error('Error fetching takeover timeout:', error);
        return 5;
    }
}

/**
 * Clear the cached timeout (call when settings are updated)
 */
export function clearTakeoverTimeoutCache(userId?: string | null) {
    if (userId) {
        cachedTimeouts.delete(userId);
    } else {
        cachedTimeouts.clear();
    }
}

/**
 * Start or refresh a human takeover session for a lead
 * Called when a human agent sends a message to a customer
 * @param leadSenderId - The customer's sender ID (PSID)
 * @param userId - The user/tenant ID who owns this conversation
 */
export async function startOrRefreshTakeover(leadSenderId: string, userId?: string | null): Promise<void> {
    try {
        const timeoutMinutes = await getHumanTakeoverTimeout(userId);

        // Build the upsert data - include user_id if available
        const upsertData: Record<string, unknown> = {
            lead_sender_id: leadSenderId,
            last_human_message_at: new Date().toISOString(),
            timeout_minutes: timeoutMinutes,
        };

        if (userId) {
            upsertData.user_id = userId;
        }

        // Upsert the takeover session (insert or update if exists)
        // Using supabaseAdmin to bypass RLS
        const { error } = await supabaseAdmin
            .from('human_takeover_sessions')
            .upsert(upsertData, {
                onConflict: 'lead_sender_id',
            });

        if (error) {
            console.error('Error starting/refreshing takeover:', error);
        } else {
            console.log(`Human takeover started/refreshed for ${leadSenderId}, timeout: ${timeoutMinutes} minutes, userId: ${userId || 'none'}`);

            // Also deactivate Smart Passive mode since human is now handling this
            await deactivateSmartPassive(leadSenderId);
        }
    } catch (error) {
        console.error('Error in startOrRefreshTakeover:', error);
    }
}

/**
 * Check if a human takeover is currently active for a lead
 * Returns true if AI should stay silent
 */
export async function isTakeoverActive(leadSenderId: string): Promise<boolean> {
    try {
        const { data, error } = await supabaseAdmin
            .from('human_takeover_sessions')
            .select('last_human_message_at, timeout_minutes')
            .eq('lead_sender_id', leadSenderId)
            .single();

        if (error) {
            // No session found = no takeover active
            if (error.code === 'PGRST116') {
                return false;
            }
            console.error('Error checking takeover status:', error);
            return false;
        }

        if (!data) {
            return false;
        }

        // Check if the takeover has expired
        const lastHumanMessage = new Date(data.last_human_message_at);
        const timeoutMs = (data.timeout_minutes || 5) * 60 * 1000;
        const now = new Date();
        const elapsed = now.getTime() - lastHumanMessage.getTime();

        if (elapsed >= timeoutMs) {
            // Takeover has expired, clean up the session
            await endTakeover(leadSenderId);
            console.log(`Human takeover expired for ${leadSenderId} (${Math.round(elapsed / 60000)} mins elapsed)`);
            return false;
        }

        const remainingMins = Math.round((timeoutMs - elapsed) / 60000);
        console.log(`Human takeover ACTIVE for ${leadSenderId}, ${remainingMins} minutes remaining`);
        return true;
    } catch (error) {
        console.error('Error in isTakeoverActive:', error);
        return false;
    }
}

/**
 * End a human takeover session (cleanup)
 */
export async function endTakeover(leadSenderId: string): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('human_takeover_sessions')
            .delete()
            .eq('lead_sender_id', leadSenderId);

        if (error) {
            console.error('Error ending takeover:', error);
        }
    } catch (error) {
        console.error('Error in endTakeover:', error);
    }
}

/**
 * Manually end takeover for a specific lead (for UI "Resume AI" button if needed)
 */
export async function manuallyEndTakeover(leadSenderId: string): Promise<boolean> {
    try {
        const { error } = await supabaseAdmin
            .from('human_takeover_sessions')
            .delete()
            .eq('lead_sender_id', leadSenderId);

        if (error) {
            console.error('Error manually ending takeover:', error);
            return false;
        }

        console.log(`Human takeover manually ended for ${leadSenderId}`);
        return true;
    } catch (error) {
        console.error('Error in manuallyEndTakeover:', error);
        return false;
    }
}
