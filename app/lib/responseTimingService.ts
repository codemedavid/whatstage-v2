/**
 * Response Timing Service
 * Simulates natural human typing delays and thinking pauses
 */

/**
 * Calculate a natural typing delay based on response length
 * Simulates human typing at ~30-50ms per character with variation
 * 
 * @param text - The response text to "type"
 * @returns Delay in milliseconds (500-3000ms range)
 */
export function calculateTypingDelay(text: string): number {
    // Base: ~30ms per character (faster than real typing, but adds natural feel)
    const baseDelay = text.length * 30;

    // Clamp to reasonable range
    const clampedDelay = Math.min(Math.max(baseDelay, 500), 3000);

    // Add random variation (±20%) for natural feel
    const variation = clampedDelay * (0.8 + Math.random() * 0.4);

    return Math.round(variation);
}

/**
 * Determine message complexity for thinking delay
 * 
 * @param message - The user's message to analyze
 * @returns Complexity level
 */
export function detectMessageComplexity(message: string): 'simple' | 'medium' | 'complex' {
    const wordCount = message.split(/\s+/).length;
    const hasQuestion = /[?]/.test(message);
    const hasMultipleQuestions = (message.match(/[?]/g) || []).length > 1;

    // Complex: multiple questions, long messages, or specific keywords
    const complexKeywords = ['compare', 'explain', 'difference', 'bakit', 'paano', 'why', 'how'];
    const hasComplexKeyword = complexKeywords.some(k => message.toLowerCase().includes(k));

    if (hasMultipleQuestions || wordCount > 20 || hasComplexKeyword) {
        return 'complex';
    }

    if (hasQuestion || wordCount > 8) {
        return 'medium';
    }

    return 'simple';
}

/**
 * Get a thinking delay based on message complexity
 * Simulates the AI "reading and thinking" before responding
 * 
 * @param complexity - Message complexity level
 * @returns Delay in milliseconds
 */
export function getThinkingDelay(complexity: 'simple' | 'medium' | 'complex'): number {
    const baseDelays = {
        simple: 300,
        medium: 800,
        complex: 1500
    };

    // Add random variation (0-500ms)
    return baseDelays[complexity] + Math.random() * 500;
}

/**
 * Get delay between split messages
 * Natural gap that feels like someone typing multiple bubbles
 * 
 * @returns Delay in milliseconds (500-1500ms)
 */
export function getMessageGapDelay(): number {
    return 500 + Math.random() * 1000;
}
