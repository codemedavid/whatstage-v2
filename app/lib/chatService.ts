import OpenAI from 'openai';
import { searchAllSources, MediaMatch } from './rag';
import { supabase } from './supabase';
import { getRecentActivities, buildActivityContextForAI, LeadActivity, findRecentActivityByType } from './activityTrackingService';
import { getCatalogContext } from './productRagService';
import { getCurrentCart, buildCartContextForAI } from './cartContextService';
import { getLeadEntities, buildEntityContextForAI, extractEntitiesFromMessage, LeadEntity } from './entityTrackingService';
import { calculateImportance } from './importanceService';
import { getSmartPassiveState, buildSmartPassiveContext, SmartPassiveState } from './smartPassiveService';
import { withRetry, isTransientError, isRateLimitError } from './retryHelper';
import { buildTimeContext } from './responseVarietyService';
import { detectObjection, getObjectionHandlingPrompt } from './objectionHandlerService';
// Rate limit resilience services
import { getAvailableApiKey, markKeyRateLimited } from './apiKeyRotationService';
import { canProceed, recordSuccess, recordFailure, getCircuitState, CircuitState } from './circuitBreakerService';
import { trackRequest, shouldThrottle } from './rateLimitService';
import { getSmartFallbackMessage, getBusyFallbackMessage } from './fallbackMessageService';

const MAX_HISTORY = 10; // Reduced to prevent context overload

// Cache settings to avoid database calls on every request
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSettings: any = null;
let settingsLastRead = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Fetch bot settings from database with caching
async function getBotSettings() {
    const now = Date.now();
    if (cachedSettings && now - settingsLastRead < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional', ai_model: 'qwen/qwen3-235b-a22b' };
        }

        cachedSettings = data;
        settingsLastRead = now;
        return data;
    } catch (error) {
        console.error('Error fetching bot settings:', error);
        return { bot_name: 'Assistant', bot_tone: 'helpful and professional', ai_model: 'qwen/qwen3-235b-a22b' };
    }
}

// Dynamic client creation with API key rotation
let currentClient: OpenAI | null = null;
let currentKeyId: string | null = null;

/**
 * Get or create OpenAI client with API key rotation
 */
async function getAIClient(): Promise<{ client: OpenAI; keyId: string | null }> {
    const { apiKey, keyId } = await getAvailableApiKey('nvidia');

    // Reuse client if same key
    if (currentClient && currentKeyId === keyId) {
        return { client: currentClient, keyId };
    }

    currentClient = new OpenAI({
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey,
    });
    currentKeyId = keyId;

    return { client: currentClient, keyId };
}

// Legacy client for backward compatibility (uses env key)
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Fetch bot rules from database
async function getBotRules(): Promise<string[]> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            console.error('Error fetching bot rules:', error);
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('Error fetching bot rules:', error);
        return [];
    }
}

// Fetch bot instructions from database
async function getBotInstructions(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('Error fetching bot instructions:', error);
        return '';
    }
}

// Fetch lead's goal status for goal-driven AI behavior
interface LeadGoalStatus {
    goal_met_at: string | null;
    has_name: boolean;
    has_email: boolean;
    has_phone: boolean;
}

async function getLeadGoalStatus(senderId: string): Promise<LeadGoalStatus> {
    try {
        const { data, error } = await supabase
            .from('leads')
            .select('goal_met_at, name, email, phone')
            .eq('sender_id', senderId)
            .single();

        if (error || !data) {
            return { goal_met_at: null, has_name: false, has_email: false, has_phone: false };
        }

        return {
            goal_met_at: data.goal_met_at,
            has_name: !!data.name,
            has_email: !!data.email,
            has_phone: !!data.phone,
        };
    } catch (error) {
        console.error('Error fetching lead goal status:', error);
        return { goal_met_at: null, has_name: false, has_email: false, has_phone: false };
    }
}

// Detect customer's language style from recent messages
function detectLanguageStyle(history: { role: string; content: string }[]): 'formal' | 'casual' | 'taglish' {
    const userMessages = history.filter(m => m.role === 'user').slice(-3);
    if (userMessages.length === 0) return 'casual';

    const text = userMessages.map(m => m.content).join(' ').toLowerCase();

    // Taglish markers (Filipino words mixed with English)
    const taglishMarkers = ['po', 'opo', 'ako', 'mo', 'ko', 'ba', 'nga', 'lang', 'yung', 'ano', 'naman', 'pala', 'sige', 'oo', 'hindi', 'gusto', 'kasi'];
    // Formal English markers
    const formalMarkers = ['please', 'thank you', 'i would like', 'may i', 'could you', 'kindly', 'appreciate', 'regarding'];

    const taglishScore = taglishMarkers.filter(m => text.includes(m)).length;
    const formalScore = formalMarkers.filter(m => text.includes(m)).length;

    if (formalScore >= 2) return 'formal';
    if (taglishScore >= 2) return 'taglish';
    return 'casual';
}

// Build style guidance based on detected language style
function buildStylePrompt(languageStyle: 'formal' | 'casual' | 'taglish'): string {
    const styleGuides: Record<string, string> = {
        formal: `COMMUNICATION STYLE: Formal
- Use polite, professional English
- Be respectful and courteous
- Use fewer emojis (1 max per message)
- Example: "Thank you for your inquiry. I'd be happy to help."`,

        casual: `COMMUNICATION STYLE: Casual
- Be friendly and conversational
- Use contractions and relaxed language
- 1-2 emojis per message is fine
- Example: "Hey! Yeah, we've got that. Want me to show you?"`,

        taglish: `COMMUNICATION STYLE: Taglish
- Mix Filipino and English naturally
- Use common expressions: "po", "sige", "oo naman"
- Be warm and approachable
- 1-2 emojis per message
- Example: "Oo naman! Meron po tayo niyan. Gusto mo i-check?"`
    };

    return styleGuides[languageStyle] || styleGuides.casual;
}

// Build goal-driven prompt context

function buildGoalPromptContext(
    primaryGoal: string,
    goalStatus: LeadGoalStatus,
    hasProducts: boolean,
    hasProperties: boolean,
    hasDigitalProducts: boolean = false
): string {
    // If goal is already met, instruct AI to stop pursuing
    if (goalStatus.goal_met_at) {
        return `
GOAL STATUS: ✅ COMPLETED
The customer has already achieved the primary goal (${primaryGoal}). 
- Do NOT proactively push for bookings, orders, or lead info collection.
- Only help if the customer explicitly asks for something new.
- Focus on customer support and answering their questions.

`;
    }

    // Build goal-specific instructions
    let goalInstructions = '';

    switch (primaryGoal) {
        case 'lead_generation':
            const missing: string[] = [];
            if (!goalStatus.has_name) missing.push('name');
            if (!goalStatus.has_email) missing.push('email');
            if (!goalStatus.has_phone) missing.push('phone');

            if (missing.length > 0) {
                goalInstructions = `
PRIMARY GOAL: 🎯 Lead Generation
Your mission: Naturally collect the customer's ${missing.join(', ')}.
- Work towards getting their contact details through natural conversation.
- Don't ask for all at once - be conversational.
- Once you have their info, thank them and offer to help further.

`;
            } else {
                goalInstructions = `
GOAL STATUS: ✅ Lead info collected (name, email, phone available)
Focus on helping the customer with their queries now.

`;
            }
            break;

        case 'appointment_booking':
            goalInstructions = `
PRIMARY GOAL: 📅 Appointment Booking
Your mission: Guide the customer to book an appointment.

SOFT CTA APPROACH (don't be pushy):
- Don't say "Book now!" - instead: "kung gusto mo, pwede ka mag-schedule dito"
- Create curiosity: "may available slots pa this week kung interested ka"
- Use questions: "gusto mo ba mag-set ng schedule?"
- When relevant: "Kung free ka, i-check mo yung slots dito: [SHOW_BOOKING]"

- Be helpful first, then naturally transition to booking.
- Once booked, the goal is complete - stop suggesting more bookings.

`;
            break;


        case 'tripping':
            goalInstructions = `
PRIMARY GOAL: 🏠 Property Tripping
Your mission: Get the customer to schedule a property site visit.
${hasProperties ? '- Show properties when relevant: [SHOW_PROPERTIES]' : ''}
- Encourage them to book a tripping/site visit: [SHOW_BOOKING]
- "Gusto mo ba pumunta para makita mo mismo? [SHOW_BOOKING]"

`;
            break;

        case 'purchase':
            goalInstructions = `
PRIMARY GOAL: 💰 Purchase
Your mission: Guide the customer to make a purchase.
${hasProducts ? '- Show products when relevant: [SHOW_PRODUCTS]' : ''}
${hasDigitalProducts ? '- Show digital products/courses when relevant: [SHOW_DIGITAL_PRODUCTS]' : ''}
- Help them find what they need and encourage checkout.
- Once they complete an order, the goal is complete.

CRITICAL PRIORITY RULE:
- Your #1 focus is PURCHASING products or digital products. This is the main goal.
- Do NOT suggest [SHOW_BOOKING] or appointment scheduling when products/digital products are available.
- Only mention booking as a LAST RESORT if there are NO products/digital products and customer explicitly asks for consultation.

`;
            break;

        default:
            goalInstructions = '';
    }

    return goalInstructions;
}

// Payment-related keywords to detect
const PAYMENT_KEYWORDS = [
    'payment', 'bayad', 'magbayad', 'pay', 'gcash', 'maya', 'paymaya',
    'bank', 'transfer', 'account', 'qr', 'qr code', 'send payment',
    'how to pay', 'paano magbayad', 'payment method', 'payment option',
    'where to pay', 'saan magbabayad', 'bank details', 'account number',
    'bdo', 'bpi', 'metrobank', 'unionbank', 'landbank', 'pnb',
    'remittance', 'padala', 'deposit'
];

// Check if message is asking about payment methods
function isPaymentQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Fetch active payment methods from database
async function getPaymentMethods(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('name, account_name, account_number, instructions, qr_code_url')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) {
            console.log('No payment methods found or error:', error);
            return '';
        }

        // Format payment methods for the AI
        let formatted = 'AVAILABLE PAYMENT METHODS:\n';
        data.forEach((pm, index) => {
            formatted += `\n${index + 1}. ${pm.name}`;
            if (pm.account_name) formatted += `\n   Account Name: ${pm.account_name}`;
            if (pm.account_number) formatted += `\n   Account/Number: ${pm.account_number}`;
            if (pm.instructions) formatted += `\n   Instructions: ${pm.instructions}`;
            if (pm.qr_code_url) formatted += `\n   [QR Code Available]`;
        });
        formatted += '\n';

        console.log('[Payment Methods]:', formatted);
        return formatted;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return '';
    }
}

// Fetch conversation history for a sender using hybrid selection
// Gets 5 most recent + up to 5 high-importance messages from last 50
export async function getConversationHistory(senderId: string): Promise<{ role: string; content: string }[]> {
    try {
        // Get the last 50 messages to select from
        const { data: allMessages, error } = await supabase
            .from('conversations')
            .select('id, role, content, importance_score, created_at')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching conversation history:', error);
            return [];
        }

        if (!allMessages || allMessages.length === 0) {
            return [];
        }

        // Take 5 most recent messages
        const recentMessages = allMessages.slice(0, 5);
        const recentIds = new Set(recentMessages.map(m => m.id));

        // Get up to 5 high-importance messages (score >= 2) not already in recent
        const highImportanceMessages = allMessages
            .filter(m => (m.importance_score || 1) >= 2 && !recentIds.has(m.id))
            .slice(0, 5);

        // Combine and sort by created_at (oldest first for context)
        const combinedMessages = [...recentMessages, ...highImportanceMessages]
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // Limit to MAX_HISTORY total
        const finalMessages = combinedMessages.slice(-MAX_HISTORY);

        return finalMessages.map(m => ({ role: m.role, content: m.content }));
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        return [];
    }
}

// Store a message with importance score (fire and forget - don't await)
function storeMessageAsync(senderId: string, role: 'user' | 'assistant', content: string) {
    // Run in background - don't block the response
    (async () => {
        try {
            // Calculate importance score based on content
            const importance_score = calculateImportance(content, role);

            // Insert message with importance score
            const { error: insertError } = await supabase
                .from('conversations')
                .insert({
                    sender_id: senderId,
                    role,
                    content,
                    importance_score,
                });

            if (insertError) {
                console.error('Error storing message:', insertError);
            }

            // Cleanup old LOW-importance messages only (preserve high-importance)
            const { count } = await supabase
                .from('conversations')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', senderId);

            if (count && count > MAX_HISTORY + 20) {
                // Delete oldest LOW-importance ones to get back to reasonable size
                const { data: oldMessages } = await supabase
                    .from('conversations')
                    .select('id')
                    .eq('sender_id', senderId)
                    .eq('importance_score', 1) // Only delete normal importance
                    .order('created_at', { ascending: true })
                    .limit(count - MAX_HISTORY - 10); // Keep some buffer

                if (oldMessages && oldMessages.length > 0) {
                    await supabase
                        .from('conversations')
                        .delete()
                        .in('id', oldMessages.map(m => m.id));
                }
            }
        } catch (error) {
            console.error('Error in storeMessage:', error);
        }
    })();
}

// Fetch the latest conversation summary for a sender
export async function getLatestConversationSummary(senderId: string): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('conversation_summaries')
            .select('summary')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            return '';
        }

        return data?.summary || '';
    } catch (error) {
        console.error('Error fetching conversation summary:', error);
        return '';
    }
}

// Generate a new conversation summary (to be called periodically)
export async function generateConversationSummary(senderId: string, leadId?: string): Promise<string | void> {
    console.log(`Generating conversation summary for ${senderId}...`);
    try {
        // 1. Get last 20 messages
        const { data: messages } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false }) // Get newest first
            .limit(20);

        if (!messages || messages.length === 0) return;

        // Reverse to chronological order for the AI
        const history = messages.reverse().map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

        // 2. Get recent activities (last 10)
        const recentActivities = await getRecentActivities(senderId, 10);
        const activityContext = buildActivityContextForAI(recentActivities);

        // 3. Get previous summary
        const previousSummary = await getLatestConversationSummary(senderId);

        // Fetch settings for model
        const settings = await getBotSettings();
        const aiModel = settings.ai_model || "qwen/qwen3-235b-a22b";

        // 4. Generate new summary using LLM
        const prompt = `You are an expert conversation summarizer. Your goal is to create a concise but comprehensive summary of the customer's context.

PREVIOUS CONTEXT:
${previousSummary || 'None'}

RECENT ACTIVITY:
${activityContext || 'None'}

RECENT CONVERSATION (Last 20 messages):
${history}

INSTRUCTIONS:
Create a new summary that merges the Previous Context with new information from Recent Conversation and Activity.
Key details to track:
- Customer's name, preferences, budget, and specific interests (products/properties).
- Any questions they asked that are still unresolved.
- Verification status (payments, receipts).
- Tone and sentiment.
- Key milestones (ordered, booked appointment, etc.).

OUTPUT:
Return ONLY the summary text. Do not add "Here is the summary" or other filler.`;

        const completion = await client.chat.completions.create({
            model: aiModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 512,
        });

        const newSummary = completion.choices[0]?.message?.content || '';
        console.log('Generated summary:', newSummary);

        if (newSummary) {
            // 5. Save new summary
            const { error: insertError } = await supabase
                .from('conversation_summaries')
                .insert({
                    sender_id: senderId,
                    summary: newSummary,
                    meta: {
                        messages_analyzed: messages.length,
                        has_lead_id: !!leadId
                    }
                });

            if (insertError) {
                console.error('Error saving conversation summary:', insertError);
                throw insertError;
            }

            console.log('✅ New conversation summary generated and saved.');
        }

        return newSummary;

    } catch (error) {
        console.error('Error generating conversation summary:', error);
        throw error; // Rethrow to allow caller to handle/see it
    }
}

// Image context type for passing image analysis to the chatbot
export interface ImageContext {
    isReceipt: boolean;
    confidence: number;
    details?: string;
    extractedAmount?: string;
    extractedDate?: string;
    imageUrl?: string;
    // Receipt verification fields
    receiverName?: string;
    receiverNumber?: string;
    paymentPlatform?: string;
    verificationStatus?: 'verified' | 'mismatch' | 'unknown';
    verificationDetails?: string;
}

export async function getBotResponse(
    userMessage: string,
    senderId: string = 'web_default',
    imageContext?: ImageContext
): Promise<string> {
    const startTime = Date.now();

    // Read bot configuration from database (cached)
    const settings = await getBotSettings();
    const botName = settings.bot_name || 'Assistant';
    const botTone = settings.bot_tone || 'helpful and professional';

    // Store user message immediately (fire and forget)
    storeMessageAsync(senderId, 'user', userMessage);

    // Check if this is a payment-related query
    const isPaymentRelated = isPaymentQuery(userMessage);
    let paymentMethodsContext = '';
    if (isPaymentRelated) {
        paymentMethodsContext = await getPaymentMethods();
    }

    // Run independent operations in PARALLEL
    // Using unified search for documents + media (single embedding, single query)
    const results = await Promise.all([
        getBotRules(),
        getConversationHistory(senderId),
        searchAllSources(userMessage, { includeMedia: true }), // Unified search for docs + media
        getBotInstructions(),
        getRecentActivities(senderId, 5), // Get last 5 activities for context
        getCatalogContext(), // Get products, properties, payment methods
        getLatestConversationSummary(senderId), // Get long-term context summary
        getCurrentCart(senderId), // Get current cart status
        getLeadEntities(senderId), // Get structured customer facts
        getSmartPassiveState(senderId), // Get Smart Passive mode state
        getLeadGoalStatus(senderId), // Get goal completion status
    ]);

    // Destructure promise results
    const [rules, history, unifiedSearch, instructions, activities, catalogContext] = results.slice(0, 6) as [
        string[],
        { role: string; content: string }[],
        Awaited<ReturnType<typeof searchAllSources>>,
        string,
        LeadActivity[],
        string
    ];
    const summary = results[6] as string;
    const cart = results[7] as Awaited<ReturnType<typeof getCurrentCart>>;
    const entities = results[8] as LeadEntity[];
    const smartPassiveState = results[9] as SmartPassiveState;
    const goalStatus = results[10] as LeadGoalStatus;
    const primaryGoal = settings.primary_goal || 'lead_generation';

    // Extract document context and media from unified search
    const context = unifiedSearch.documents;
    const relevantMedia = unifiedSearch.relevantMedia;

    // Build media search result for compatibility with existing code
    const mediaSearchResult: { media: MediaMatch | null; confidence: 'high' | 'medium' | 'low' | 'none' } = relevantMedia.length > 0
        ? { media: relevantMedia[0], confidence: relevantMedia[0].similarity >= 0.70 ? 'high' : relevantMedia[0].similarity >= 0.55 ? 'medium' : 'low' }
        : { media: null, confidence: 'none' };

    console.log(`Parallel fetch took ${Date.now() - startTime}ms - rules: ${rules.length}, history: ${history.length}, activities: ${activities.length}, catalog: ${catalogContext.length} chars, isPaymentQuery: ${isPaymentRelated}, summary len: ${summary.length}, cart items: ${cart?.item_count || 0}, entities: ${entities.length}, smartPassive: ${smartPassiveState.isActive}, mediaMatches: ${relevantMedia.length}, topMedia: ${relevantMedia[0]?.title || 'none'}`);
    console.log('[RAG CONTEXT]:', context ? context.substring(0, 500) + '...' : 'NO CONTEXT RETRIEVED');


    // Check what's available in the catalog to conditionally enable tools
    const hasProducts = catalogContext && catalogContext.includes('PRODUCT CATALOG:');
    const hasProperties = catalogContext && catalogContext.includes('PROPERTY LISTINGS:');
    const hasDigitalProducts = catalogContext && catalogContext.includes('DIGITAL PRODUCT CATALOG:');

    // Anti-looping: Check for recent activities to avoid suggesting recently completed actions
    const recentBooking = findRecentActivityByType(activities, 'appointment_booked', 24);
    const recentOrder = findRecentActivityByType(activities, 'order_completed', 24);

    console.log('[AntiLoop] Recent booking found:', !!recentBooking, recentBooking?.metadata);
    console.log('[AntiLoop] Recent order found:', !!recentOrder);

    // Build dynamic UI TOOLS list
    let uiToolsList = '';
    let examplesList = '';

    // Only show product tools if products exist AND user hasn't just completed an order
    if (hasProducts && !recentOrder) {
        uiToolsList += `- [SHOW_PRODUCTS] : When user wants to BROWSE ALL products/items available.\n`;
        uiToolsList += `- [RECOMMEND_PRODUCT:product_id] : When recommending a SPECIFIC product based on user preferences. Use the exact product ID from the catalog.\n`;
        uiToolsList += `- [SHOW_CART] : When user asks to see their cart, order, or what they've added. Example: "ano na sa cart ko?" / "what's in my cart?"\n`;
        uiToolsList += `- [REMOVE_CART:product_name] : When user wants to REMOVE an item from their cart. Replace "product_name" with the actual product name they want removed.\n`;

        examplesList += `- Example (browse all): "Yes, meron kaming available. Check mo dito: [SHOW_PRODUCTS]"\n`;
        examplesList += `- Example (specific recommendation): "Based sa preferences mo, try mo to: [RECOMMEND_PRODUCT:abc123-uuid-here]"\n`;
        examplesList += `- Example: "Okay po, aalisin ko na yan sa cart mo. [REMOVE_CART:Product Name Here]"\n`;
    } else if (hasProducts && recentOrder) {
        // Still allow cart tools but hide SHOW_PRODUCTS from proactive suggestions
        uiToolsList += `- [SHOW_CART] : When user asks to see their cart, order, or what they've added.\n`;
        uiToolsList += `- [REMOVE_CART:product_name] : When user wants to REMOVE an item from their cart.\n`;
    }

    if (hasProperties) {
        uiToolsList += `- [SHOW_PROPERTIES] : When user wants to BROWSE ALL properties available. This shows a visual card carousel.\n`;
        uiToolsList += `- [RECOMMEND_PROPERTY:property_id] : When recommending a SPECIFIC property based on user preferences (bedrooms, budget, location). Use the exact property ID from the catalog. Shows only that one property card.\n`;
        examplesList += `- Example (browse all): "Meron kaming available na properties! Check mo: [SHOW_PROPERTIES]"\n`;
        examplesList += `- Example (specific recommendation): "Base sa budget mo, try mo tingnan to: [RECOMMEND_PROPERTY:abc123-uuid-here]"\n`;
    }

    // Digital product tools - for courses, digital downloads, online content
    if (hasDigitalProducts) {
        uiToolsList += `- [SHOW_DIGITAL_PRODUCTS] : When user wants to BROWSE ALL digital products/courses available. This shows a visual card carousel.\n`;
        uiToolsList += `- [RECOMMEND_DIGITAL_PRODUCT:digital_product_id] : When recommending a SPECIFIC digital product/course based on user needs. Use the exact digital product ID from the catalog.\n`;
        examplesList += `- Example (browse digital): "Meron kaming online courses! Check mo: [SHOW_DIGITAL_PRODUCTS]"\n`;
        examplesList += `- Example (specific digital): "Perfect para sayo yung course na to: [RECOMMEND_DIGITAL_PRODUCT:abc123-uuid-here]"\n`;
    }

    // General tools - conditionally show booking based on goal + availability
    // Only show booking tool when:
    // 1. Goal is appointment_booking or tripping (booking-focused goals)
    // 2. Goal is lead_generation (general)
    // 3. OR no products/properties/digital products exist (fallback)
    const shouldShowBookingTool = !recentBooking && (
        primaryGoal === 'appointment_booking' ||
        primaryGoal === 'tripping' ||
        primaryGoal === 'lead_generation' ||
        (!hasProducts && !hasProperties && !hasDigitalProducts) // Fallback when no products/properties/digital products exist
    );

    if (shouldShowBookingTool) {
        uiToolsList += `- [SHOW_BOOKING] : When user wants to schedule a visit, appointment, or consultation.\n`;
        examplesList += `- Example: "Pwede tayo mag-schedule. [SHOW_BOOKING]"`;
    }
    uiToolsList += `- [SHOW_PAYMENT_METHODS] : When user asks how to pay or asks for bank details.\n`;

    // Add media tool if we have a relevant match
    if (mediaSearchResult.media && mediaSearchResult.confidence !== 'none') {
        const media = mediaSearchResult.media;
        uiToolsList += `- [SEND_MEDIA:${media.id}] : Send the "${media.title}" ${media.media_type} to the customer. Use this to share educational content, tours, or demonstrations.\n`;
        examplesList += `- Example (proactive media): "I have a video that shows exactly that! [SEND_MEDIA:${media.id}]"\n`;
    }

    // Detect customer's language style from conversation history
    const languageStyle = detectLanguageStyle(history);
    const stylePrompt = buildStylePrompt(languageStyle);

    // Get time context for natural greetings
    const timeContext = buildTimeContext();

    // Detect objections in current message
    const objection = detectObjection(userMessage);
    const objectionPrompt = objection ? getObjectionHandlingPrompt(objection) : '';

    // Get customer name from entities for personalization
    const customerName = entities.find(e => e.entity_type === 'name')?.entity_value || '';

    // Build a clear system prompt optimized for Llama 3.1
    let systemPrompt = `You are ${botName}. Your style: ${botTone}.

${stylePrompt}

${timeContext}
${customerName ? `CUSTOMER NAME: ${customerName} (use occasionally to personalize, not every message)\n` : ''}
UI TOOLS (Use these tags when relevant):
${uiToolsList}

IMPORTANT: 
- Answer the user's question FIRST, then add the appropriate tag at the end.
- You can recommend checking products/properties ONLY if they are available and relevant.
${examplesList}

CRITICAL RULES:
- DO NOT generate links like [LINK], [LINK_TO_BOOKING], or any URL. Use the UI TOOLS tags above instead.
- DO NOT sign off your messages (e.g., "WhatStage PH", "Galaxy Coffee"). Just send the message.
- If asking to book/schedule, ALWAYS use [SHOW_BOOKING]. DO NOT say "click this link".
- DO NOT list options if you don't have their specific names. NEVER say "Pwede kang mag-choose: , , ,".
- When user asks about a SPECIFIC product/property by name or describes their preferences, use [RECOMMEND_PRODUCT:id] or [RECOMMEND_PROPERTY:id] with the matching item's ID from the catalog.
- When user wants to see ALL available items, use [SHOW_PRODUCTS] or [SHOW_PROPERTIES].
- Keep your text message SHORT when using recommendation tags - the card will show all the details.
- DO NOT invent media tags. NEVER use [media], [video], or [image]. Only use [SEND_MEDIA:id] when it appears in the UI TOOLS list above with a valid media ID.

HUMANIZATION TIPS:
- Don't be too perfect - occasional filler words are okay ("ah", "hmm", "actually")
- Ask follow-up questions sometimes instead of just answering
- Reference things they mentioned earlier if relevant
- Be warm but not over-the-top enthusiastic
`;

    // Add media suggestion context if available
    if (mediaSearchResult.media && mediaSearchResult.confidence !== 'none') {
        const media = mediaSearchResult.media;
        const confidenceText = mediaSearchResult.confidence === 'high'
            ? 'This is highly relevant - proactively suggest it'
            : mediaSearchResult.confidence === 'medium'
                ? 'This may be helpful - offer it naturally if appropriate'
                : 'Only mention if the customer explicitly asks for visual content';

        systemPrompt += `
AVAILABLE MEDIA TO SHARE:
You have a ${media.media_type} available that may help this conversation:
- Title: "${media.title}"
- Description: ${media.description}
- Relevance: ${confidenceText}

To send this ${media.media_type}, include [SEND_MEDIA:${media.id}] in your response.
Example: "Meron akong video na pwede mo panoorin para mas magets mo! [SEND_MEDIA:${media.id}]"

IMPORTANT:
- Be natural - don't force the media if it's not relevant
- Briefly introduce what the media shows before sending
- Only use this tag ONCE per response
`;
    }

    // Add objection handling if detected
    if (objection && objectionPrompt) {
        systemPrompt += `
OBJECTION DETECTED (${objection}):
${objectionPrompt}

`;
    }

    // Inject goal-driven context
    const goalContext = buildGoalPromptContext(primaryGoal, goalStatus, !!hasProducts, !!hasProperties, !!hasDigitalProducts);
    if (goalContext) {
        systemPrompt += goalContext;
    }


    if (hasProducts) {
        systemPrompt += `
CART REMOVAL DETECTION:
When a customer says things like:
- "wag na po yung..." / "alisin mo na yung..." / "remove..." / "tanggalin..."
- "ayoko na ng..." / "cancel ko yung..."
Use the [REMOVE_CART:product_name] tag with the product name they mentioned.
`;
    }

    systemPrompt += `\n`;

    // Add instructions from database if available
    if (instructions) {
        systemPrompt += `${instructions}

`;
    }

    if (rules.length > 0) {
        systemPrompt += `RULES:\n${rules.join('\n')}\n\n`;
    }

    // Add knowledge base FIRST (HIGHEST PRIORITY)
    if (context && context.trim().length > 0) {
        systemPrompt += `PRIORITY SOURCE - REFERENCE DATA (Knowledge Base):
${context}

IMPORTANT: 
- This is your PRIMARY source of truth. 
- When asked about price/magkano/cost, use the EXACT price above.
- Do NOT make up prices or add details not in the reference data.

`;
    } else {
        systemPrompt += `NOTE: No reference data available. If asked for specific prices or details, say "Ipa-check ko muna sa team."

`;
    }

    // Add product/property catalog context (SECONDARY PRIORITY)
    if (catalogContext && catalogContext.trim().length > 0) {
        systemPrompt += `SECONDARY SOURCE - PRODUCT/PROPERTY CATALOG:
${catalogContext}

IMPORTANT: 
- Use this ONLY if the user explicitly asks about products, properties, or items for sale.
- Do NOT proactively offer products/properties if the user is asking about general topics or from the Reference Data above.
- Use the EXACT prices and details from the catalog above when answering.

PRODUCT/PROPERTY DISPLAY RULES - CRITICAL:
- When you RECOMMEND a specific product, you MUST use [RECOMMEND_PRODUCT:product_id] with the actual product_id from the catalog.
- When you RECOMMEND a specific property, you MUST use [RECOMMEND_PROPERTY:property_id] with the actual property_id from the catalog.
- The product/property card shows the visual - your text should be SHORT.
- Example: "Perfect match para sayo yung Aries Men! [RECOMMEND_PRODUCT:abc123-uuid-here]"
- DO NOT describe the product details in text then NOT show the card. ALWAYS include the tag to show the card.
- Keep your text SHORT (1-2 sentences max) - the card will show all the details.
- Use [SHOW_PRODUCTS] or [SHOW_PROPERTIES] only when user wants to browse ALL items, not for specific recommendations.

`;
    }

    // Add payment methods details for specific questions
    if (paymentMethodsContext) {
        systemPrompt += `${paymentMethodsContext}

INSTRUCTION FOR PAYMENT QUERIES:
- Explain the options briefly if asked.
- Add [SHOW_PAYMENT_METHODS] tag to show the full list UI.

`;
    }

    // Add Customer Profile (Structured Entities)
    const entityContext = buildEntityContextForAI(entities);
    if (entityContext) {
        systemPrompt += `${entityContext}
`;
    }

    // Add Long-Term Context Summary (Memory)
    if (summary && summary.trim().length > 0) {
        systemPrompt += `LONG TERM MEMORY (Customer Context):
${summary}

IMPORTANT: Use this context to remember what the customer previously said, their name, preferences, and past actions.
`;
    }


    // Add customer activity history context
    const activityContext = buildActivityContextForAI(activities);
    if (activityContext) {
        systemPrompt += `${activityContext}
`;
    }

    // Anti-looping context injection: Guide the AI to avoid suggesting recently completed actions
    if (recentBooking) {
        const bookingDate = recentBooking.metadata?.appointment_date || 'soon';
        const bookingTime = recentBooking.metadata?.start_time || '';
        systemPrompt += `
IMPORTANT - ANTI-LOOP CONTEXT:
The customer has ALREADY booked an appointment${bookingTime ? ` at ${bookingTime}` : ''}${bookingDate !== 'soon' ? ` on ${bookingDate}` : ''}.
- Do NOT ask them to book again or suggest scheduling.
- If they ask about booking, acknowledge their existing appointment first.
- Only offer to reschedule if they explicitly ask to change their booking.

`;
    }
    if (recentOrder) {
        systemPrompt += `
IMPORTANT - ANTI-LOOP CONTEXT:
The customer has recently completed an order.
- Focus on order status, delivery updates, or customer support.
- Do NOT proactively push new products unless they explicitly ask.
- If they ask about products, you can still help but don't be pushy.

`;
    }

    // Add current cart context
    const cartContext = buildCartContextForAI(cart);
    if (cartContext) {
        systemPrompt += `${cartContext}
`;
    }

    // Add Smart Passive context if active (customer needs human attention)
    const smartPassiveContext = buildSmartPassiveContext(smartPassiveState);
    if (smartPassiveContext) {
        systemPrompt += smartPassiveContext;
    }

    // Add image context if customer sent an image
    if (imageContext) {
        systemPrompt += `IMAGE ANALYSIS (Customer sent an image):
`;
        if (imageContext.isReceipt && imageContext.confidence >= 0.7) {
            systemPrompt += `- This appears to be a RECEIPT/PROOF OF PAYMENT (${Math.round(imageContext.confidence * 100)}% confidence)
`;
            if (imageContext.details) {
                systemPrompt += `- Details: ${imageContext.details}
`;
            }
            if (imageContext.extractedAmount) {
                systemPrompt += `- Amount shown: ${imageContext.extractedAmount}
`;
            }
            if (imageContext.extractedDate) {
                systemPrompt += `- Date: ${imageContext.extractedDate}
`;
            }
            if (imageContext.receiverName) {
                systemPrompt += `- Receiver Name: ${imageContext.receiverName}
`;
            }
            if (imageContext.receiverNumber) {
                systemPrompt += `- Receiver Number: ${imageContext.receiverNumber}
`;
            }
            if (imageContext.paymentPlatform) {
                systemPrompt += `- Platform: ${imageContext.paymentPlatform}
`;
            }

            // Add verification status
            if (imageContext.verificationStatus === 'verified') {
                systemPrompt += `
✅ PAYMENT VERIFIED: ${imageContext.verificationDetails}

INSTRUCTION: The payment details MATCH our records! Thank the customer warmly, confirm the payment is verified and correct. Let them know their order will be processed. Be enthusiastic and appreciative!

`;
            } else if (imageContext.verificationStatus === 'mismatch') {
                systemPrompt += `
⚠️ PAYMENT MISMATCH: ${imageContext.verificationDetails}

INSTRUCTION: Politely inform the customer that the payment details don't match our records. Ask them to double-check if they sent to the correct account. Provide our correct payment details (use [SHOW_PAYMENT_METHODS] if helpful). Be helpful and understanding - maybe they made an honest mistake.

`;
            } else {
                systemPrompt += `
INSTRUCTION: Thank the customer for their payment proof. Confirm you received it and will process it. Be warm and appreciative.

`;
            }
        } else if (imageContext.isReceipt) {
            systemPrompt += `- This might be a receipt but confidence is low (${Math.round(imageContext.confidence * 100)}%)
`;
            if (imageContext.details) {
                systemPrompt += `- What I see: ${imageContext.details}
`;
            }
            systemPrompt += `
INSTRUCTION: Politely ask the customer if this is their payment proof. If the image is unclear, ask them to resend a clearer photo.

`;
        } else {
            systemPrompt += `- This does NOT appear to be a receipt (${Math.round(imageContext.confidence * 100)}% confidence)
`;
            if (imageContext.details) {
                systemPrompt += `- What I see: ${imageContext.details}
`;
            }
            systemPrompt += `
INSTRUCTION: Respond naturally about the image. If they might be trying to send payment proof, guide them on what to send.

`;
        }
    }

    // Build messages array with history
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of history) {
        messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    try {
        const llmStart = Date.now();

        // === CIRCUIT BREAKER CHECK ===
        // If circuit is open, immediately return fallback
        if (!canProceed('nvidia')) {
            console.log('[Resilience] Circuit breaker OPEN - returning fallback');
            return getSmartFallbackMessage(userMessage);
        }

        // === RATE LIMIT THROTTLING CHECK ===
        const throttleCheck = await shouldThrottle('nvidia');
        if (throttleCheck.shouldThrottle) {
            console.log(`[Resilience] Rate limit critical (${throttleCheck.usagePercent.toFixed(0)}%) - returning fallback`);
            return getBusyFallbackMessage();
        }
        if (throttleCheck.shouldDelay && throttleCheck.delayMs > 0) {
            console.log(`[Resilience] Throttling: delaying ${throttleCheck.delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, throttleCheck.delayMs));
        }

        // === GET AI CLIENT WITH KEY ROTATION ===
        const { client: aiClient, keyId } = await getAIClient();

        // Use selected model or default to Qwen
        const aiModel = settings.ai_model || "qwen/qwen3-235b-a22b";

        // Prepare completion options
        const completionOptions: OpenAI.Chat.ChatCompletionCreateParams & { chat_template_kwargs?: { thinking: boolean } } = {
            model: aiModel,
            messages,
            temperature: 0.3,
            top_p: 0.7,
            max_tokens: 1024,
            stream: true,
        };

        // Add DeepSeek specific options if selected
        if (aiModel.includes('deepseek')) {
            completionOptions.chat_template_kwargs = { "thinking": true };
            completionOptions.max_tokens = 8192; // DeepSeek supports larger context
        }

        let responseContent: string = '';
        let lastKeyId = keyId;

        responseContent = await withRetry(async () => {
            // Get fresh client (may rotate key on retry)
            const { client: retryClient, keyId: retryKeyId } = await getAIClient();
            lastKeyId = retryKeyId;

            const stream = await retryClient.chat.completions.create(completionOptions as OpenAI.Chat.ChatCompletionCreateParams) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

            let contentBuffer = '';
            let reasoningBuffer = '';

            // Process the stream
            for await (const chunk of stream) {
                // Collect reasoning (thinking) content
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const reasoning = (chunk.choices[0]?.delta as any)?.reasoning_content;
                if (reasoning) {
                    reasoningBuffer += reasoning;
                }

                // Collect actual response content
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    contentBuffer += content;
                }
            }

            if (reasoningBuffer) {
                console.log('Reasoning:', reasoningBuffer.substring(0, 200) + '...');
            }

            return contentBuffer;
        }, {
            maxAttempts: 3,
            initialDelayMs: 1000,
            backoffMultiplier: 2,
            maxDelayMs: 15000,
            jitterPercent: 25,
            shouldRetry: isTransientError,
            onRetry: (attempt, error, nextDelayMs) => {
                console.warn(`LLM call failed (attempt ${attempt}), retrying in ${nextDelayMs}ms...`, error.message);

                // If rate limited, mark key for cooldown and rotate
                if (isRateLimitError(error) && lastKeyId) {
                    console.log(`[Resilience] Rate limit hit on key ${lastKeyId?.substring(0, 8)}...`);
                    markKeyRateLimited(lastKeyId, 60).catch(err => {
                        console.error('[Resilience] Error marking key rate limited:', err);
                    });
                }
            },
            onRateLimit: (error, retryAfterMs) => {
                console.log(`[Resilience] Rate limit with Retry-After: ${retryAfterMs}ms`);
                // Track for metrics
                trackRequest('nvidia', 0, false, true).catch(() => { });
            }
        });

        const llmDuration = Date.now() - llmStart;
        console.log(`LLM call took ${llmDuration} ms`);

        // === TRACK SUCCESS METRICS ===
        recordSuccess('nvidia');
        trackRequest('nvidia', llmDuration, false, false).catch(() => { });

        // Handle empty responses with a fallback
        if (!responseContent || responseContent.trim() === '') {
            console.warn('Empty response from LLM after retries');
            return getSmartFallbackMessage(userMessage);
        }

        // Store bot response (fire and forget)
        storeMessageAsync(senderId, 'assistant', responseContent);

        // Extract entities from this exchange (fire and forget - don't block response)
        extractEntitiesFromMessage(senderId, userMessage, responseContent).catch(err => {
            console.error('[EntityTracking] Background extraction error:', err);
        });

        console.log(`Total response time: ${Date.now() - startTime} ms`);
        return responseContent;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Error calling NVIDIA API after retries:", error.response?.data || error.message || error);

        // === RECORD FAILURE FOR CIRCUIT BREAKER ===
        recordFailure('nvidia', isTransientError(error));
        trackRequest('nvidia', 0, true, isRateLimitError(error)).catch(() => { });

        // Return user-friendly fallback instead of empty string
        return getSmartFallbackMessage(userMessage);
    }
}
