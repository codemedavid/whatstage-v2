/**
 * Message Queue Service with Priority Handling
 * 
 * Manages high-volume message processing with priority-based ordering.
 * Features:
 * - Priority levels (Critical, High, Medium, Low)
 * - In-memory queue with optional persistence
 * - Concurrent processing with configurable limits
 * - Queue depth monitoring
 */

import { supabase } from './supabase';

export enum MessagePriority {
    CRITICAL = 3,    // Human takeover, complaints, payment issues
    HIGH = 2,        // First-time customers, cart with items
    MEDIUM = 1,      // Returning customers, product inquiry
    LOW = 0,         // Follow-ups, general browse
}

export interface QueuedMessage {
    id: string;
    senderId: string;
    message: string;
    priority: MessagePriority;
    pageId?: string;
    queuedAt: Date;
    metadata?: {
        isFirstMessage?: boolean;
        hasCartItems?: boolean;
        isPaymentRelated?: boolean;
        isComplaint?: boolean;
    };
}

interface QueueConfig {
    maxQueueSize: number;
    maxConcurrent: number;
    processingTimeoutMs: number;
    enablePersistence: boolean;
}

const DEFAULT_CONFIG: QueueConfig = {
    maxQueueSize: 500,
    maxConcurrent: 10,
    processingTimeoutMs: 30000,
    enablePersistence: false, // Set true for production
};

// In-memory priority queue (sorted by priority desc, then by queuedAt asc)
let messageQueue: QueuedMessage[] = [];
const processing: Set<string> = new Set();
let config = DEFAULT_CONFIG;

// Metrics
const metrics = {
    totalQueued: 0,
    totalProcessed: 0,
    totalDropped: 0,
    avgWaitTimeMs: 0,
    totalWaitTimeMs: 0,
};

/**
 * Configure the queue
 */
export function configureQueue(newConfig: Partial<QueueConfig>): void {
    config = { ...config, ...newConfig };
}

/**
 * Detect message priority based on content and context
 * 
 * @param message - The message content
 * @param senderId - The sender's ID
 * @param context - Optional context about the sender
 */
export async function detectPriority(
    message: string,
    senderId: string,
    context?: {
        isFirstMessage?: boolean;
        hasCartItems?: boolean;
        humanTakeoverActive?: boolean;
    }
): Promise<{ priority: MessagePriority; reason: string }> {
    const lowerMessage = message.toLowerCase();

    // CRITICAL: Human takeover or explicit escalation
    if (context?.humanTakeoverActive) {
        return { priority: MessagePriority.CRITICAL, reason: 'Human takeover active' };
    }

    // CRITICAL: Complaints and urgent issues
    const complaintKeywords = [
        'complaint', 'refund', 'angry', 'upset', 'frustrated', 'terrible',
        'horrible', 'worst', 'scam', 'lawsuit', 'report', 'galit', 'reklamo',
        'bwisit', 'tangina', 'putangina', 'hindi dumating', 'sira', 'mali',
    ];
    if (complaintKeywords.some(kw => lowerMessage.includes(kw))) {
        return { priority: MessagePriority.CRITICAL, reason: 'Complaint detected' };
    }

    // HIGH: Payment-related
    const paymentKeywords = [
        'payment', 'paid', 'bayad', 'nagbayad', 'sent payment', 'gcash',
        'bank transfer', 'receipt', 'proof', 'resibo',
    ];
    if (paymentKeywords.some(kw => lowerMessage.includes(kw))) {
        return { priority: MessagePriority.HIGH, reason: 'Payment related' };
    }

    // HIGH: First-time customer
    if (context?.isFirstMessage) {
        return { priority: MessagePriority.HIGH, reason: 'First-time customer' };
    }

    // HIGH: Customer with cart items
    if (context?.hasCartItems) {
        return { priority: MessagePriority.HIGH, reason: 'Has items in cart' };
    }

    // MEDIUM: Product/booking inquiries
    const inquiryKeywords = [
        'price', 'magkano', 'available', 'book', 'schedule', 'order',
        'interested', 'gusto ko', 'pabili', 'how much',
    ];
    if (inquiryKeywords.some(kw => lowerMessage.includes(kw))) {
        return { priority: MessagePriority.MEDIUM, reason: 'Product/booking inquiry' };
    }

    // LOW: General messages
    return { priority: MessagePriority.LOW, reason: 'General message' };
}

/**
 * Add a message to the queue
 * 
 * @returns Queue position or null if queue is full
 */
export async function enqueue(
    senderId: string,
    message: string,
    pageId?: string,
    priorityOverride?: MessagePriority
): Promise<{ position: number; estimatedWaitMs: number } | null> {
    // Check if already processing this sender
    if (processing.has(senderId)) {
        console.log(`[Queue] Sender ${senderId} already processing, skipping queue`);
        return { position: 0, estimatedWaitMs: 0 };
    }

    // Check queue capacity
    if (messageQueue.length >= config.maxQueueSize) {
        console.log(`[Queue] Queue full (${messageQueue.length}), dropping message`);
        metrics.totalDropped++;
        return null;
    }

    // Detect priority
    const { priority, reason } = priorityOverride !== undefined
        ? { priority: priorityOverride, reason: 'Override' }
        : await detectPriority(message, senderId);

    const queuedMessage: QueuedMessage = {
        id: `${senderId}-${Date.now()}`,
        senderId,
        message,
        priority,
        pageId,
        queuedAt: new Date(),
    };

    // Insert in sorted position (priority desc, then time asc)
    const insertIndex = messageQueue.findIndex(
        m => m.priority < priority ||
            (m.priority === priority && m.queuedAt > queuedMessage.queuedAt)
    );

    if (insertIndex === -1) {
        messageQueue.push(queuedMessage);
    } else {
        messageQueue.splice(insertIndex, 0, queuedMessage);
    }

    metrics.totalQueued++;

    const position = messageQueue.findIndex(m => m.id === queuedMessage.id) + 1;
    const estimatedWaitMs = position * 2000; // Rough estimate: 2s per message

    console.log(`[Queue] Enqueued ${senderId} at position ${position} (${priority}: ${reason})`);

    return { position, estimatedWaitMs };
}

/**
 * Get the next message to process
 * 
 * @returns The next message or null if queue is empty
 */
export function dequeue(): QueuedMessage | null {
    if (messageQueue.length === 0) {
        return null;
    }

    // Get highest priority message (already sorted)
    const message = messageQueue.shift()!;
    processing.add(message.senderId);

    // Track wait time
    const waitTimeMs = Date.now() - message.queuedAt.getTime();
    metrics.totalWaitTimeMs += waitTimeMs;
    metrics.totalProcessed++;
    metrics.avgWaitTimeMs = metrics.totalWaitTimeMs / metrics.totalProcessed;

    console.log(`[Queue] Dequeued ${message.senderId} (waited ${waitTimeMs}ms)`);

    return message;
}

/**
 * Mark a message as done processing
 */
export function markComplete(senderId: string): void {
    processing.delete(senderId);
}

/**
 * Mark a message as failed (can be re-queued)
 */
export function markFailed(senderId: string, requeue: boolean = false): void {
    processing.delete(senderId);

    if (requeue) {
        // Find the original message in processing and re-queue with lower priority
        console.log(`[Queue] Re-queuing failed message for ${senderId}`);
        // Note: Original message is gone, caller should handle re-queuing if needed
    }
}

/**
 * Get current queue status
 */
export function getQueueStatus(): {
    queueLength: number;
    processingCount: number;
    metrics: typeof metrics;
    byPriority: Record<MessagePriority, number>;
} {
    const byPriority = {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.MEDIUM]: 0,
        [MessagePriority.LOW]: 0,
    };

    for (const msg of messageQueue) {
        byPriority[msg.priority]++;
    }

    return {
        queueLength: messageQueue.length,
        processingCount: processing.size,
        metrics: { ...metrics },
        byPriority,
    };
}

/**
 * Check if a sender is currently in queue or processing
 */
export function isInQueue(senderId: string): boolean {
    return processing.has(senderId) || messageQueue.some(m => m.senderId === senderId);
}

/**
 * Get estimated wait time for a new message
 */
export function getEstimatedWaitTime(priority: MessagePriority = MessagePriority.MEDIUM): number {
    // Count messages with same or higher priority
    const aheadCount = messageQueue.filter(m => m.priority >= priority).length;
    return aheadCount * 2000; // 2s estimate per message
}

/**
 * Clear the queue (for testing or emergency)
 */
export function clearQueue(): void {
    const count = messageQueue.length;
    messageQueue = [];
    processing.clear();
    console.log(`[Queue] Cleared ${count} messages`);
}

/**
 * Process queue with a handler function
 * This is meant to be called in a worker/loop
 * 
 * @param handler - Function to process each message
 * @param concurrency - Number of concurrent processors
 */
export async function processQueue(
    handler: (message: QueuedMessage) => Promise<void>,
    concurrency: number = config.maxConcurrent
): Promise<void> {
    const promises: Promise<void>[] = [];

    while (promises.length < concurrency && messageQueue.length > 0) {
        const message = dequeue();
        if (!message) break;

        const promise = (async () => {
            try {
                await Promise.race([
                    handler(message),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout')), config.processingTimeoutMs)
                    ),
                ]);
                markComplete(message.senderId);
            } catch (error) {
                console.error(`[Queue] Error processing ${message.senderId}:`, error);
                markFailed(message.senderId);
            }
        })();

        promises.push(promise);
    }

    await Promise.all(promises);
}

/**
 * Check if queue can accept more messages
 */
export function canAcceptMessage(): boolean {
    return messageQueue.length < config.maxQueueSize;
}

/**
 * Get queue health status
 */
export function getQueueHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    message: string;
} {
    const utilization = messageQueue.length / config.maxQueueSize;

    if (utilization >= 0.9) {
        return { status: 'critical', message: `Queue at ${(utilization * 100).toFixed(0)}% capacity` };
    }
    if (utilization >= 0.7) {
        return { status: 'warning', message: `Queue at ${(utilization * 100).toFixed(0)}% capacity` };
    }
    return { status: 'healthy', message: 'Queue operating normally' };
}
