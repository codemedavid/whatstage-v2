/**
 * Fallback Message Service
 * 
 * Provides graceful degradation when AI is unavailable due to:
 * - Rate limits
 * - API errors
 * - Circuit breaker open
 * - High volume/queue overflow
 */

export type FallbackContext =
    | 'general'
    | 'products'
    | 'booking'
    | 'payment'
    | 'support'
    | 'busy';

interface FallbackMessages {
    [key: string]: string[];
}

/**
 * Context-aware fallback messages
 * Randomized selection to avoid robotic feel
 */
const FALLBACK_MESSAGES: FallbackMessages = {
    general: [
        "Sandali lang po! Marami kaming kausap ngayon. Babalik agad! 😊",
        "One moment po! Saglit lang, maraming customers. 🙏",
        "Hi! Busy kami ngayon pero babalik agad sayo! ⏳",
        "Pasensya na po, medyo marami kaming kausap. Saglit lang! 😊",
        "Sandali lang po! Andito lang kami. 🙌",
    ],
    products: [
        "Sandali lang po! Check mo muna products namin habang hinihintay mo ako. [SHOW_PRODUCTS] 🛒",
        "One moment! Tingnan mo muna available items namin. [SHOW_PRODUCTS] 😊",
        "Busy kami saglit! Pag-browse mo muna products namin. [SHOW_PRODUCTS] 🛍️",
    ],
    booking: [
        "Sandali lang po! Pwede ka na mag-book habang hinihintay mo ako. [SHOW_BOOKING] 📅",
        "One moment! Check mo muna available slots namin. [SHOW_BOOKING] 🗓️",
        "Busy kami saglit! Pag-schedule mo na appointment mo. [SHOW_BOOKING] 😊",
    ],
    payment: [
        "Sandali lang po! Eto muna payment details namin habang hinihintay mo ako. [SHOW_PAYMENT_METHODS] 💳",
        "One moment! Check mo muna payment options namin. [SHOW_PAYMENT_METHODS] 🏦",
    ],
    support: [
        "Nakuha ko na po concern mo. May tao na mag-aassist sayo shortly! 🙋",
        "Noted po! Ipapasa ko to sa team namin. Saglit lang! 📝",
        "Maraming salamat sa patience mo! Babalikan ka namin agad. 🙏",
    ],
    busy: [
        "Maraming salamat sa patience! Maraming customers ngayon pero babalikan ka namin. 💪",
        "Appreciate the patience! High volume kami ngayon pero priority ka namin. 🙌",
        "Sandali lang talaga po! Rush hour kami pero andito lang kami for you. ⏰",
    ],
};

/**
 * Get a random fallback message for the given context
 * 
 * @param context - The context of the conversation (general, products, booking, etc.)
 * @returns A random fallback message appropriate for the context
 */
export function getFallbackMessage(context: FallbackContext = 'general'): string {
    const messages = FALLBACK_MESSAGES[context] || FALLBACK_MESSAGES.general;
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
}

/**
 * Detect the best fallback context based on the user's message
 * 
 * @param userMessage - The user's original message
 * @returns The most appropriate fallback context
 */
export function detectFallbackContext(userMessage: string): FallbackContext {
    const lowerMessage = userMessage.toLowerCase();

    // Product-related keywords
    const productKeywords = [
        'product', 'item', 'buy', 'price', 'magkano', 'bili', 'order',
        'available', 'stock', 'catalog', 'menu', 'products'
    ];
    if (productKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'products';
    }

    // Booking-related keywords
    const bookingKeywords = [
        'book', 'schedule', 'appointment', 'visit', 'tripping',
        'reserve', 'slot', 'available time', 'kailan', 'pwede pumunta'
    ];
    if (bookingKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'booking';
    }

    // Payment-related keywords
    const paymentKeywords = [
        'payment', 'pay', 'bayad', 'gcash', 'maya', 'bank', 'transfer',
        'account', 'how to pay', 'paano magbayad'
    ];
    if (paymentKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'payment';
    }

    // Support/complaint keywords
    const supportKeywords = [
        'help', 'problem', 'issue', 'complaint', 'refund', 'return',
        'wrong', 'error', 'hindi gumagana', 'sira', 'broken'
    ];
    if (supportKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'support';
    }

    return 'general';
}

/**
 * Get an appropriate fallback message based on the user's message content
 * Automatically detects context and returns a relevant message
 * 
 * @param userMessage - The user's original message
 * @returns A context-aware fallback message
 */
export function getSmartFallbackMessage(userMessage: string): string {
    const context = detectFallbackContext(userMessage);
    return getFallbackMessage(context);
}

/**
 * Get a fallback message for high-volume situations
 * Used when the system is overwhelmed and needs to communicate delay
 */
export function getBusyFallbackMessage(): string {
    return getFallbackMessage('busy');
}
