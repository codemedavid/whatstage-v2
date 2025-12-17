/**
 * Importance Service
 * Calculates message importance scores for importance-based memory retention
 */

// Importance levels
export const IMPORTANCE = {
    NORMAL: 1,      // Regular conversation
    KEY_INFO: 2,    // Contains important customer info
    MILESTONE: 3,   // Major event (booking, order, payment)
} as const;

export type ImportanceLevel = typeof IMPORTANCE[keyof typeof IMPORTANCE];

// Keywords that indicate key information (score: 2)
const KEY_INFO_KEYWORDS = [
    // Budget & pricing
    'budget', 'price', 'cost', 'afford', 'magkano', 'presyo', 'halaga',
    'million', 'thousand', 'pesos', 'php', 'downpayment', 'down payment',

    // Preferences
    'bedroom', 'bathroom', 'sqm', 'square meter', 'location', 'area',
    'prefer', 'gusto', 'want', 'looking for', 'hinahanap', 'need',

    // Contact info
    'phone', 'number', 'email', 'contact', 'viber', 'whatsapp',

    // Decisions
    'interested', 'consider', 'thinking', 'decide', 'isipin',
    'yes', 'oo', 'sige', 'ok', 'okay', 'go',

    // Objections & concerns
    'expensive', 'mahal', 'concern', 'problem', 'issue', 'question',
];

// Keywords that indicate milestones (score: 3)
const MILESTONE_KEYWORDS = [
    // Appointments
    'book', 'schedule', 'appointment', 'visit', 'viewing', 'tour',
    'booked', 'scheduled', 'confirmed',

    // Orders & payments
    'order', 'buy', 'purchase', 'checkout', 'paid', 'payment',
    'gcash', 'maya', 'bank transfer', 'bayad', 'nabayad',
    'confirmed', 'verified', 'received',

    // Cancellations & changes
    'cancel', 'reschedule', 'change', 'refund',

    // Completions
    'thank', 'thanks', 'salamat', 'done', 'complete', 'finish',
];

// Patterns for structured info extraction (even higher confidence)
const STRUCTURED_PATTERNS = [
    /\d+\s*(million|m|k|thousand|pesos|php)/i,  // Budget mentions
    /\d+\s*(bedroom|br|bathroom|bath|sqm|sqft)/i,  // Property specs
    /\d{10,11}/,  // Phone number
    /[\w.-]+@[\w.-]+\.\w+/i,  // Email
];

/**
 * Calculate importance score for a message
 * @param content Message content
 * @param role Message role ('user' or 'assistant')
 * @returns Importance score (1-3)
 */
export function calculateImportance(content: string, role: 'user' | 'assistant'): ImportanceLevel {
    const lowerContent = content.toLowerCase();

    // Check for milestone keywords first (highest priority)
    for (const keyword of MILESTONE_KEYWORDS) {
        if (lowerContent.includes(keyword.toLowerCase())) {
            return IMPORTANCE.MILESTONE;
        }
    }

    // Check for structured patterns (high confidence key info)
    for (const pattern of STRUCTURED_PATTERNS) {
        if (pattern.test(content)) {
            return IMPORTANCE.KEY_INFO;
        }
    }

    // Check for key info keywords
    for (const keyword of KEY_INFO_KEYWORDS) {
        if (lowerContent.includes(keyword.toLowerCase())) {
            return IMPORTANCE.KEY_INFO;
        }
    }

    // Default to normal importance
    return IMPORTANCE.NORMAL;
}

/**
 * Check if a message is a milestone message
 */
export function isMilestoneMessage(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return MILESTONE_KEYWORDS.some(keyword =>
        lowerContent.includes(keyword.toLowerCase())
    );
}

/**
 * Get milestone type from message content
 */
export function getMilestoneType(content: string): string | null {
    const lowerContent = content.toLowerCase();

    if (/book|schedule|appointment|visit|viewing/.test(lowerContent)) {
        return 'appointment_booked';
    }
    if (/order|buy|purchase|checkout/.test(lowerContent)) {
        return 'order_placed';
    }
    if (/paid|payment|gcash|maya|bank.*transfer|verified|received/.test(lowerContent)) {
        return 'payment_confirmed';
    }
    if (/cancel/.test(lowerContent)) {
        return 'cancelled';
    }

    return null;
}
