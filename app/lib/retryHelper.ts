/**
 * Enhanced Retry Helper with Jitter and Rate Limit Awareness
 * 
 * Improvements over basic retry:
 * - Jitter to prevent thundering herd
 * - Retry-After header support
 * - Integration with circuit breaker
 * - Rate limit specific handling
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

export interface RetryOptions {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs?: number;           // Cap the maximum delay
    jitterPercent?: number;        // Add randomness to delay (0-100)
    shouldRetry?: (error: AnyError) => boolean;
    onRetry?: (attempt: number, error: AnyError, nextDelayMs: number) => void;
    onRateLimit?: (error: AnyError, retryAfterMs: number) => void;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Add jitter to a delay value to prevent thundering herd
 * 
 * @param baseDelayMs - The base delay in milliseconds
 * @param jitterPercent - Percentage of jitter to add (0-100)
 * @returns Delay with random jitter added
 */
function addJitter(baseDelayMs: number, jitterPercent: number = 25): number {
    const jitterRange = baseDelayMs * (jitterPercent / 100);
    const jitter = Math.random() * jitterRange * 2 - jitterRange; // +/- jitterRange
    return Math.max(0, Math.round(baseDelayMs + jitter));
}

/**
 * Extract Retry-After header value from error response
 * 
 * @param error - The error object
 * @returns Retry delay in milliseconds, or null if not present
 */
function getRetryAfterMs(error: AnyError): number | null {
    // Check various error structures for Retry-After header
    const retryAfter =
        error.headers?.['retry-after'] ||
        error.response?.headers?.['retry-after'] ||
        error.response?.headers?.get?.('retry-after');

    if (!retryAfter) return null;

    // Check if it's a number (seconds) or a date string
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
        return seconds * 1000;
    }

    // Try parsing as date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
    }

    return null;
}

/**
 * Check if error is a rate limit error (429)
 */
export function isRateLimitError(error: AnyError): boolean {
    return (
        error.status === 429 ||
        error.statusCode === 429 ||
        error.response?.status === 429 ||
        error.code === 'rate_limit_exceeded' ||
        error.message?.toLowerCase().includes('rate limit')
    );
}

/**
 * Check if an error is likely transient (network, 5xx, rate limit)
 */
export function isTransientError(error: AnyError): boolean {
    // Check for network errors
    if (
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('network') ||
        error.message?.includes('fetch failed')
    ) {
        return true;
    }

    // Rate limits are transient
    if (isRateLimitError(error)) {
        return true;
    }

    // Check for server errors (500-599)
    const status = error.status || error.statusCode || error.response?.status;
    if (status >= 500 && status < 600) {
        return true;
    }

    // Check for specific LLM/OpenAI errors
    if (error.type === 'server_error' || error.code === 'rate_limit_exceeded') {
        return true;
    }

    // Timeout errors
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        return true;
    }

    return false;
}

/**
 * Execute a function with enhanced retry logic
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Retry-After header support
 * - Max delay cap
 * - Rate limit specific callbacks
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    const {
        maxAttempts,
        initialDelayMs,
        backoffMultiplier,
        maxDelayMs = 30000,
        jitterPercent = 25,
        shouldRetry,
        onRetry,
        onRateLimit,
    } = options;

    let lastError: AnyError;
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error: AnyError) {
            lastError = error;

            // Check if we should stop retrying
            if (shouldRetry && !shouldRetry(error)) {
                throw error;
            }

            // If this was the last attempt, throw the error
            if (attempt === maxAttempts) {
                throw error;
            }

            // Calculate next delay
            let nextDelay = delay;

            // Check for Retry-After header (rate limit specific)
            const retryAfterMs = getRetryAfterMs(error);
            if (retryAfterMs !== null && isRateLimitError(error)) {
                nextDelay = retryAfterMs;
                console.log(`[Retry] Rate limit with Retry-After: ${retryAfterMs}ms`);

                // Notify about rate limit
                if (onRateLimit) {
                    onRateLimit(error, retryAfterMs);
                }
            } else {
                // Apply jitter to prevent thundering herd
                nextDelay = addJitter(delay, jitterPercent);
            }

            // Cap the delay
            nextDelay = Math.min(nextDelay, maxDelayMs);

            // Notify about retry
            if (onRetry) {
                onRetry(attempt, error, nextDelay);
            }

            // Wait before next attempt
            await sleep(nextDelay);

            // Calculate next delay with exponential backoff
            delay = Math.min(delay * backoffMultiplier, maxDelayMs);
        }
    }

    throw lastError;
}

/**
 * Default retry options for AI/LLM calls
 */
export const DEFAULT_LLM_RETRY_OPTIONS: Partial<RetryOptions> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 15000,
    jitterPercent: 25,
    shouldRetry: isTransientError,
};

/**
 * Create retry options with custom overrides
 */
export function createRetryOptions(overrides: Partial<RetryOptions> = {}): RetryOptions {
    return {
        ...DEFAULT_LLM_RETRY_OPTIONS,
        ...overrides,
    } as RetryOptions;
}
