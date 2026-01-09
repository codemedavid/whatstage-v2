/**
 * Distributed Webhook Message Deduplication Service
 * 
 * Uses Supabase table to track processed message IDs across all serverless instances.
 * This prevents duplicate processing when:
 * - Facebook retries webhook delivery
 * - Multiple Vercel instances receive the same message
 * - Cold starts create fresh in-memory caches
 */

import { supabaseAdmin } from './supabaseAdmin';

// TTL for processed messages (5 minutes - Facebook typically retries within 1-2 min)
const MESSAGE_TTL_MS = 5 * 60 * 1000;

// Cleanup interval (run every 100 checks to avoid excessive cleanup)
let checkCount = 0;
const CLEANUP_INTERVAL = 100;

/**
 * Check if a message ID has already been processed.
 * Returns true if already processed (should skip), false if new.
 */
export async function isMessageProcessed(messageId: string): Promise<boolean> {
    if (!messageId) return false;

    try {
        const { data, error } = await supabaseAdmin
            .from('processed_webhook_messages')
            .select('id')
            .eq('message_id', messageId)
            .single();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = not found, which is expected for new messages
            console.error('[Dedup] Error checking message:', error.message);
        }

        return !!data;
    } catch (error) {
        console.error('[Dedup] Exception checking message:', error);
        return false; // Default to processing on error
    }
}

/**
 * Mark a message ID as processed.
 * Uses upsert with ON CONFLICT to handle race conditions atomically.
 */
export async function markMessageProcessed(messageId: string): Promise<void> {
    if (!messageId) return;

    try {
        const { error } = await supabaseAdmin
            .from('processed_webhook_messages')
            .upsert(
                {
                    message_id: messageId,
                    processed_at: new Date().toISOString(),
                },
                {
                    onConflict: 'message_id',
                    ignoreDuplicates: true, // Don't error if already exists
                }
            );

        if (error) {
            console.error('[Dedup] Error marking message processed:', error.message);
        }

        // Periodically cleanup old entries
        checkCount++;
        if (checkCount >= CLEANUP_INTERVAL) {
            checkCount = 0;
            cleanupOldMessages().catch(err => {
                console.error('[Dedup] Cleanup error:', err);
            });
        }
    } catch (error) {
        console.error('[Dedup] Exception marking message:', error);
    }
}

/**
 * Atomic check-and-mark in a single operation.
 * Returns true if message was already processed, false if this is the first time.
 * Uses INSERT ... ON CONFLICT DO NOTHING to atomically claim the message.
 */
export async function checkAndMarkProcessed(messageId: string): Promise<boolean> {
    if (!messageId) return false;

    try {
        // Try to insert - if it succeeds, we're the first processor
        // If it fails with conflict, someone else already processed it
        const { data, error } = await supabaseAdmin
            .from('processed_webhook_messages')
            .insert({
                message_id: messageId,
                processed_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (error) {
            if (error.code === '23505') {
                // Unique violation - already processed
                return true;
            }
            console.error('[Dedup] Error in checkAndMark:', error.message);
            return false; // Default to processing on error
        }

        // Successfully inserted - this is the first processor
        // Trigger cleanup periodically
        checkCount++;
        if (checkCount >= CLEANUP_INTERVAL) {
            checkCount = 0;
            cleanupOldMessages().catch(err => {
                console.error('[Dedup] Cleanup error:', err);
            });
        }

        return false;
    } catch (error) {
        console.error('[Dedup] Exception in checkAndMark:', error);
        return false;
    }
}

/**
 * Remove messages older than TTL
 */
async function cleanupOldMessages(): Promise<void> {
    const cutoff = new Date(Date.now() - MESSAGE_TTL_MS).toISOString();

    const { error, count } = await supabaseAdmin
        .from('processed_webhook_messages')
        .delete()
        .lt('processed_at', cutoff);

    if (error) {
        console.error('[Dedup] Cleanup delete error:', error.message);
    } else if (count && count > 0) {
        console.log(`[Dedup] Cleaned up ${count} old message entries`);
    }
}
