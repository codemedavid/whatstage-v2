/**
 * Utility for retrying operations with exponential backoff
 */

interface RetryOptions {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    shouldRetry?: (error: any) => boolean;
    onRetry?: (attempt: number, error: any) => void;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    let lastError: any;
    let delay = options.initialDelayMs;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Check if we should stop retrying
            if (options.shouldRetry && !options.shouldRetry(error)) {
                throw error;
            }

            // If this was the last attempt, throw the error
            if (attempt === options.maxAttempts) {
                throw error;
            }

            // Notify about retry
            if (options.onRetry) {
                options.onRetry(attempt, error);
            }

            // Wait before next attempt
            await sleep(delay);
            delay *= options.backoffMultiplier;
        }
    }

    throw lastError;
}

/**
 * Check if an error is likely transient (network, 5xx, rate limit)
 */
export function isTransientError(error: any): boolean {
    // Check for network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('network')) {
        return true;
    }

    // Check for rate limits (429) via various error structures
    if (error.status === 429 || error.statusCode === 429 || error.response?.status === 429) {
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

    return false;
}
