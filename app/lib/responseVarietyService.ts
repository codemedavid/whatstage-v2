/**
 * Response Variety Service
 * Provides varied responses to avoid repetitive bot-like patterns
 */

// Time-based greetings
const GREETINGS: Record<string, string[]> = {
    morning: ['Good morning!', 'Magandang umaga!', 'Morning! ☀️', 'Hello! Good morning po!'],
    afternoon: ['Good afternoon!', 'Magandang hapon!', 'Hello! 👋', 'Hi there!'],
    evening: ['Good evening!', 'Magandang gabi!', 'Evening! 🌙', 'Hello! Good evening po!'],
};

// Casual acknowledgments to sprinkle in responses
const ACKNOWLEDGMENTS = [
    'Gets ko!',
    'Ahh sige sige',
    'Okay gotcha!',
    'Noted!',
    'Ayun!',
    'Nice!',
    'Alright!',
    'Oo naman!',
    'Sige po!',
    'Got it!',
];

// Thinking/processing phrases for natural feel
const THINKING_PHRASES = [
    'Hmm...',
    'Wait lang ah...',
    'Let me check...',
    'Sandali lang...',
    'Ah wait...',
    'Sige check ko...',
];

// Soft transition phrases
const TRANSITIONS = [
    'By the way,',
    'Ah btw,',
    'Also,',
    'Tapos,',
    'And,',
];

// Closing phrases
const CLOSINGS = [
    'Anything else?',
    'May iba pa ba?',
    'Let me know if you need more help!',
    'Just ask if may tanong pa!',
    'Happy to help!',
];

/**
 * Get a random item from an array
 */
function randomFrom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get a time-appropriate greeting
 * 
 * @param hour - Optional hour override (0-23), defaults to current hour
 * @returns A greeting string
 */
export function getTimeBasedGreeting(hour?: number): string {
    const currentHour = hour ?? new Date().getHours();

    let period: 'morning' | 'afternoon' | 'evening';
    if (currentHour < 12) {
        period = 'morning';
    } else if (currentHour < 18) {
        period = 'afternoon';
    } else {
        period = 'evening';
    }

    return randomFrom(GREETINGS[period]);
}

/**
 * Get a random acknowledgment phrase
 * 
 * @returns An acknowledgment string
 */
export function getRandomAcknowledgment(): string {
    return randomFrom(ACKNOWLEDGMENTS);
}

/**
 * Get a random thinking phrase
 * 
 * @returns A thinking phrase
 */
export function getThinkingPhrase(): string {
    return randomFrom(THINKING_PHRASES);
}

/**
 * Get a random transition phrase
 * 
 * @returns A transition phrase
 */
export function getTransitionPhrase(): string {
    return randomFrom(TRANSITIONS);
}

/**
 * Get a random closing phrase
 * 
 * @returns A closing phrase
 */
export function getClosingPhrase(): string {
    return randomFrom(CLOSINGS);
}

/**
 * Get the current time period for context
 * 
 * @returns 'morning' | 'afternoon' | 'evening'
 */
export function getTimePeriod(): 'morning' | 'afternoon' | 'evening' {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
}

/**
 * Build time context string for AI prompt
 * 
 * @returns Context string about current time
 */
export function buildTimeContext(): string {
    const period = getTimePeriod();
    const hour = new Date().getHours();

    let context = `Current time: ${period}`;

    // Add specific context for edge times
    if (hour >= 11 && hour < 13) {
        context += ' (lunch time)';
    } else if (hour >= 17 && hour < 19) {
        context += ' (after work hours)';
    } else if (hour >= 21 || hour < 6) {
        context += ' (late night - keep responses brief)';
    }

    return context;
}
