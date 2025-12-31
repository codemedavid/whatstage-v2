/**
 * Rate Limit Tracking Service
 * 
 * Tracks API usage metrics and implements proactive throttling.
 * Features:
 * - Per-minute request counting
 * - Latency tracking
 * - Proactive throttling before hitting limits
 * - Dashboard-friendly metrics
 */

import { supabase } from './supabase';

// In-memory buffer for metrics (batched writes to reduce DB load)
interface MetricBuffer {
    provider: string;
    windowStart: string;
    requestCount: number;
    successCount: number;
    errorCount: number;
    rateLimitCount: number;
    totalLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
}

const metricBuffer: Map<string, MetricBuffer> = new Map();
let lastFlush = Date.now();
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds

// Configurable thresholds
interface ThrottleConfig {
    maxRequestsPerMinute: number;
    throttleAtPercent: number;  // Start throttling at this % of max
    criticalAtPercent: number;  // Critical warning at this %
}

const DEFAULT_CONFIG: ThrottleConfig = {
    maxRequestsPerMinute: 60,   // Adjust based on your NVIDIA quota
    throttleAtPercent: 70,
    criticalAtPercent: 90,
};

// Cache for recent metrics
interface RecentMetrics {
    requestsLastMinute: number;
    errorsLastMinute: number;
    rateLimitsLastMinute: number;
    avgLatencyMs: number;
    lastUpdated: number;
}

const metricsCache: Map<string, RecentMetrics> = new Map();
const METRICS_CACHE_TTL_MS = 10000; // 10 seconds

/**
 * Get the current minute window start timestamp
 */
function getCurrentWindowStart(): string {
    const now = new Date();
    now.setSeconds(0, 0); // Round down to minute
    return now.toISOString();
}

/**
 * Get buffer key for a provider and window
 */
function getBufferKey(provider: string, windowStart: string): string {
    return `${provider}:${windowStart}`;
}

/**
 * Track a single API request
 * 
 * @param provider - The AI provider (e.g., 'nvidia')
 * @param latencyMs - Request latency in milliseconds
 * @param isError - Whether the request failed (non-rate-limit error)
 * @param isRateLimit - Whether the request hit a rate limit
 */
export async function trackRequest(
    provider: string,
    latencyMs: number,
    isError: boolean = false,
    isRateLimit: boolean = false
): Promise<void> {
    const windowStart = getCurrentWindowStart();
    const bufferKey = getBufferKey(provider, windowStart);

    // Get or create buffer entry
    let buffer = metricBuffer.get(bufferKey);
    if (!buffer) {
        buffer = {
            provider,
            windowStart,
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            rateLimitCount: 0,
            totalLatencyMs: 0,
            minLatencyMs: latencyMs,
            maxLatencyMs: latencyMs,
        };
        metricBuffer.set(bufferKey, buffer);
    }

    // Update buffer
    buffer.requestCount++;
    buffer.totalLatencyMs += latencyMs;
    buffer.minLatencyMs = Math.min(buffer.minLatencyMs, latencyMs);
    buffer.maxLatencyMs = Math.max(buffer.maxLatencyMs, latencyMs);

    if (isRateLimit) {
        buffer.rateLimitCount++;
    } else if (isError) {
        buffer.errorCount++;
    } else {
        buffer.successCount++;
    }

    // Invalidate cache on rate limit
    if (isRateLimit) {
        metricsCache.delete(provider);
    }

    // Flush if interval passed
    const now = Date.now();
    if (now - lastFlush > FLUSH_INTERVAL_MS) {
        await flushMetrics();
    }
}

/**
 * Flush buffered metrics to database
 */
async function flushMetrics(): Promise<void> {
    if (metricBuffer.size === 0) return;

    const bufferCopy = new Map(metricBuffer);
    metricBuffer.clear();
    lastFlush = Date.now();

    for (const [, buffer] of bufferCopy) {
        try {
            // Use the upsert function we created in the migration
            await supabase.rpc('upsert_rate_metric', {
                p_provider: buffer.provider,
                p_window_start: buffer.windowStart,
                p_latency_ms: Math.round(buffer.totalLatencyMs / buffer.requestCount),
                p_is_error: buffer.errorCount > 0,
                p_is_rate_limit: buffer.rateLimitCount > 0,
            });
        } catch (error) {
            console.error('[RateLimitService] Error flushing metrics:', error);
            // Put back in buffer for retry
            const key = getBufferKey(buffer.provider, buffer.windowStart);
            const existing = metricBuffer.get(key);
            if (existing) {
                existing.requestCount += buffer.requestCount;
                existing.successCount += buffer.successCount;
                existing.errorCount += buffer.errorCount;
                existing.rateLimitCount += buffer.rateLimitCount;
                existing.totalLatencyMs += buffer.totalLatencyMs;
            } else {
                metricBuffer.set(key, buffer);
            }
        }
    }
}

/**
 * Check if we should throttle requests to avoid hitting rate limits
 * 
 * @param provider - The AI provider
 * @param config - Optional throttle configuration
 * @returns Object with throttle decision and details
 */
export async function shouldThrottle(
    provider: string = 'nvidia',
    config: ThrottleConfig = DEFAULT_CONFIG
): Promise<{
    shouldThrottle: boolean;
    shouldDelay: boolean;
    delayMs: number;
    reason?: string;
    usagePercent: number;
}> {
    const metrics = await getRecentMetrics(provider);
    const usagePercent = (metrics.requestsLastMinute / config.maxRequestsPerMinute) * 100;

    // Critical level - definitely throttle
    if (usagePercent >= config.criticalAtPercent) {
        return {
            shouldThrottle: true,
            shouldDelay: true,
            delayMs: 5000, // 5 second delay
            reason: `Critical: ${usagePercent.toFixed(0)}% of rate limit used`,
            usagePercent,
        };
    }

    // Throttle level - add small delay
    if (usagePercent >= config.throttleAtPercent) {
        const delayMs = Math.round((usagePercent - config.throttleAtPercent) * 100);
        return {
            shouldThrottle: false,
            shouldDelay: true,
            delayMs: Math.min(delayMs, 3000),
            reason: `Warning: ${usagePercent.toFixed(0)}% of rate limit used`,
            usagePercent,
        };
    }

    // Recent rate limits - be cautious
    if (metrics.rateLimitsLastMinute > 0) {
        return {
            shouldThrottle: false,
            shouldDelay: true,
            delayMs: 2000,
            reason: `Recent rate limits detected: ${metrics.rateLimitsLastMinute}`,
            usagePercent,
        };
    }

    return {
        shouldThrottle: false,
        shouldDelay: false,
        delayMs: 0,
        usagePercent,
    };
}

/**
 * Get recent metrics for a provider (with caching)
 */
export async function getRecentMetrics(provider: string = 'nvidia'): Promise<RecentMetrics> {
    const cached = metricsCache.get(provider);
    if (cached && Date.now() - cached.lastUpdated < METRICS_CACHE_TTL_MS) {
        return cached;
    }

    try {
        // Get metrics from last 2 minutes (current + previous window)
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('rate_limit_metrics')
            .select('request_count, error_count, rate_limit_count, total_latency_ms')
            .eq('provider', provider)
            .gte('window_start', twoMinutesAgo)
            .order('window_start', { ascending: false })
            .limit(2);

        if (error) {
            console.error('[RateLimitService] Error fetching metrics:', error);
            return getDefaultMetrics();
        }

        const metrics: RecentMetrics = {
            requestsLastMinute: 0,
            errorsLastMinute: 0,
            rateLimitsLastMinute: 0,
            avgLatencyMs: 0,
            lastUpdated: Date.now(),
        };

        if (data && data.length > 0) {
            let totalLatency = 0;
            let totalRequests = 0;

            for (const row of data) {
                metrics.requestsLastMinute += row.request_count || 0;
                metrics.errorsLastMinute += row.error_count || 0;
                metrics.rateLimitsLastMinute += row.rate_limit_count || 0;
                totalLatency += row.total_latency_ms || 0;
                totalRequests += row.request_count || 0;
            }

            metrics.avgLatencyMs = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;
        }

        // Also add in-memory buffer data
        const currentWindow = getCurrentWindowStart();
        const bufferKey = getBufferKey(provider, currentWindow);
        const buffer = metricBuffer.get(bufferKey);
        if (buffer) {
            metrics.requestsLastMinute += buffer.requestCount;
            metrics.errorsLastMinute += buffer.errorCount;
            metrics.rateLimitsLastMinute += buffer.rateLimitCount;
        }

        metricsCache.set(provider, metrics);
        return metrics;
    } catch (error) {
        console.error('[RateLimitService] Error in getRecentMetrics:', error);
        return getDefaultMetrics();
    }
}

function getDefaultMetrics(): RecentMetrics {
    return {
        requestsLastMinute: 0,
        errorsLastMinute: 0,
        rateLimitsLastMinute: 0,
        avgLatencyMs: 0,
        lastUpdated: Date.now(),
    };
}

/**
 * Get dashboard-friendly metrics summary
 */
export async function getDashboardMetrics(provider: string = 'nvidia'): Promise<{
    current: RecentMetrics;
    hourly: {
        totalRequests: number;
        totalErrors: number;
        totalRateLimits: number;
        avgLatencyMs: number;
        successRate: number;
    };
}> {
    const current = await getRecentMetrics(provider);

    // Get last hour of metrics
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data } = await supabase
        .from('rate_limit_metrics')
        .select('request_count, success_count, error_count, rate_limit_count, total_latency_ms')
        .eq('provider', provider)
        .gte('window_start', oneHourAgo);

    let totalRequests = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalRateLimits = 0;
    let totalLatency = 0;

    if (data) {
        for (const row of data) {
            totalRequests += row.request_count || 0;
            totalSuccess += row.success_count || 0;
            totalErrors += row.error_count || 0;
            totalRateLimits += row.rate_limit_count || 0;
            totalLatency += row.total_latency_ms || 0;
        }
    }

    return {
        current,
        hourly: {
            totalRequests,
            totalErrors,
            totalRateLimits,
            avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
            successRate: totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 100,
        },
    };
}

/**
 * Force flush metrics (call on graceful shutdown)
 */
export async function forceFlush(): Promise<void> {
    await flushMetrics();
}
