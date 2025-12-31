/**
 * Objection Handler Service
 * Detects customer hesitation/objections and provides handling guidance
 */

// Objection patterns by category
const OBJECTION_PATTERNS: Record<string, string[]> = {
    price: [
        'mahal', 'expensive', 'ang laki', 'budget', 'afford', 'pricey',
        'ang taas', 'too much', 'masyado', 'di kaya', 'ang gastos',
        'presyo', 'price', 'cost', 'magkano ba', 'bakit ganun kamahal'
    ],
    timing: [
        'mamaya', 'later', 'next time', 'pa-isip', 'think about it',
        'bukas', 'tomorrow', 'next week', 'not now', 'di pa ready',
        'pa-consult', 'ask muna', 'hindi pa', 'soon', 'someday',
        'pag-isipan', 'consider', 'balikan kita'
    ],
    trust: [
        'legit ba', 'scam', 'sure ba', 'safe ba', 'totoo ba',
        'reliable', 'trusted', 'reviews', 'feedback', 'may issue ba',
        'problema', 'complaint', 'baka', 'paano kung', 'what if'
    ],
    comparison: [
        'iba', 'another', 'other options', 'compare', 'vs',
        'mas okay', 'mas maganda', 'elsewhere', 'ibang store',
        'alternative', 'mas mura', 'competitor', 'difference'
    ],
    shipping: [
        'shipping', 'delivery', 'magkano padala', 'free shipping',
        'gaano katagal', 'how long', 'san galing', 'courier'
    ],
    quality: [
        'quality', 'kalidad', 'matibay', 'durable', 'warranty',
        'guarantee', 'original', 'authentic', 'fake', 'legit item'
    ]
};

// Handling prompts for each objection type
const OBJECTION_HANDLERS: Record<string, string> = {
    price: `Customer has PRICE concerns. 
- Acknowledge: "Gets ko, budget is important talaga"
- Highlight VALUE, not just features
- If applicable, mention: payment options, installments, promos, bundles
- Ask about their budget range to see if you can recommend alternatives
- Never be defensive about pricing`,

    timing: `Customer wants to DELAY decision.
- Don't push or pressure - this kills trust
- Validate: "No rush! Take your time to decide"
- Offer to send info they can review: "I can share the details para ma-check mo later"
- Gently keep door open: "Just message me pag ready ka na, andito lang ako"
- Stay warm and available`,

    trust: `Customer has TRUST concerns.
- Be understanding, never dismissive: "Valid concern, gets ko"
- Offer proof if available: reviews, testimonials, certifications
- Invite verification: "Pwede mo i-check yung reviews namin" or "visit ka sa store kung gusto mo"
- Be transparent about policies: returns, warranties, etc.
- Share your track record briefly if relevant`,

    comparison: `Customer is COMPARISON shopping.
- This is normal - don't be defensive
- Be helpful: "What specific features are you comparing?"
- Highlight YOUR unique value, not competitor weaknesses
- Understand their priorities to position better
- If asked directly about competitors, be respectful: "I can only speak for ours, but..."`,

    shipping: `Customer has SHIPPING questions.
- Provide clear, specific info on delivery times and costs
- Mention any free shipping thresholds if available
- Explain tracking and COD options if applicable
- Set realistic expectations on delivery times`,

    quality: `Customer has QUALITY concerns.
- Provide specifics: materials, manufacturing, origin
- Mention warranties/guarantees if available
- Offer to share photos/videos for authenticity
- Share return policy to reduce risk perception`
};

/**
 * Detect if message contains an objection and identify its type
 * 
 * @param message - The user's message
 * @returns The objection type or null if none detected
 */
export function detectObjection(message: string): string | null {
    const lowerMessage = message.toLowerCase();

    // Check each objection category
    for (const [type, patterns] of Object.entries(OBJECTION_PATTERNS)) {
        const hasMatch = patterns.some(pattern => lowerMessage.includes(pattern));
        if (hasMatch) {
            return type;
        }
    }

    return null;
}

/**
 * Get the handling prompt for an objection type
 * 
 * @param objectionType - The type of objection detected
 * @returns Handling guidance prompt
 */
export function getObjectionHandlingPrompt(objectionType: string): string {
    return OBJECTION_HANDLERS[objectionType] || '';
}

/**
 * Detect multiple objections in a message
 * 
 * @param message - The user's message
 * @returns Array of objection types detected
 */
export function detectAllObjections(message: string): string[] {
    const lowerMessage = message.toLowerCase();
    const detected: string[] = [];

    for (const [type, patterns] of Object.entries(OBJECTION_PATTERNS)) {
        const hasMatch = patterns.some(pattern => lowerMessage.includes(pattern));
        if (hasMatch) {
            detected.push(type);
        }
    }

    return detected;
}

/**
 * Build combined handling prompt for multiple objections
 * 
 * @param objectionTypes - Array of objection types
 * @returns Combined handling guidance prompt
 */
export function buildCombinedHandlingPrompt(objectionTypes: string[]): string {
    if (objectionTypes.length === 0) return '';

    const prompts = objectionTypes
        .map(type => OBJECTION_HANDLERS[type])
        .filter(Boolean);

    if (prompts.length === 0) return '';

    return `
OBJECTION(S) DETECTED: ${objectionTypes.join(', ')}

${prompts.join('\n\n')}

IMPORTANT: Handle objections with empathy. Never be pushy or defensive.
`;
}
