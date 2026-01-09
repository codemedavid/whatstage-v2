import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseAdmin';

// Entity types we track
export type EntityType = 'name' | 'preference' | 'budget' | 'interest' | 'contact' | 'custom';

export interface LeadEntity {
    id: string;
    sender_id: string;
    entity_type: EntityType;
    entity_key: string;
    entity_value: string;
    confidence: number;
    source: string;
    created_at: string;
    updated_at: string;
}

interface ExtractedEntity {
    type: EntityType;
    key: string;
    value: string;
    confidence: number;
}

// OpenAI client for entity extraction
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

/**
 * Extract entities from a conversation exchange using LLM
 * Called after each bot response (fire and forget)
 */
export async function extractEntitiesFromMessage(
    senderId: string,
    userMessage: string,
    botResponse: string
): Promise<void> {
    try {
        const prompt = `Extract customer information ONLY from what the USER explicitly stated.

USER MESSAGE: "${userMessage}"
BOT RESPONSE (for context only): "${botResponse}"

CRITICAL RULES:
1. ONLY extract information the USER explicitly said in their message
2. DO NOT extract prices, details, or facts mentioned by the BOT
3. Only extract from BOT response if the USER confirmed/acknowledged it (e.g., "yes that's my budget", "okay I'll take it")
4. If user just asks a question or says "ok"/"thanks" without sharing new info, return []

Entity types to look for in USER MESSAGE:
- name: Customer's name they stated (key: "full_name", "first_name", "nickname")
- preference: Preferences USER expressed (key: "bedrooms", "property_type", "location", "features")
- budget: Budget USER stated (key: "max_budget", "min_budget", "budget_range") - NOT prices bot mentioned!
- interest: Items USER expressed interest in (key: "property_id", "product_name", "listing_interest")
- contact: Contact info USER shared (key: "phone", "email", "messenger")
- custom: Other facts USER shared about themselves

Return JSON array. If USER didn't share any new information, return [].
Format: [{"type": "...", "key": "...", "value": "...", "confidence": 0.0-1.0}]

Examples:
- USER: "My name is Juan" → [{"type":"name","key":"first_name","value":"Juan","confidence":0.95}]
- USER: "How much is that?" BOT: "It's P450" → [] (user asked question, didn't share info)
- USER: "ok" BOT: "The price is P450" → [] (user just acknowledged, didn't confirm as their budget)
- USER: "That P450 is within my budget" BOT: "Great!" → [{"type":"budget","key":"confirmed_budget","value":"P450","confidence":0.8}]

Return ONLY the JSON array, no other text.`;

        const completion = await client.chat.completions.create({
            model: 'meta/llama-3.1-8b-instruct',  // Use smaller model for extraction
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 512,
        });

        const responseText = completion.choices[0]?.message?.content || '[]';

        // Parse the JSON response
        let entities: ExtractedEntity[] = [];
        try {
            // Clean up response - might have markdown code blocks
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                entities = JSON.parse(jsonMatch[0]);
            }
        } catch (parseError) {
            console.log('[EntityTracking] Failed to parse response:', responseText);
            return;
        }

        if (entities.length === 0) {
            return;
        }

        console.log(`[EntityTracking] Extracted ${entities.length} entities for ${senderId}:`, entities);

        // Upsert each entity
        for (const entity of entities) {
            await upsertEntity(senderId, entity.type, entity.key, entity.value, entity.confidence);
        }

    } catch (error) {
        console.error('[EntityTracking] Error extracting entities:', error);
    }
}

/**
 * Upsert an entity (insert or update if exists)
 * Uses supabaseAdmin to bypass RLS since this is called from webhook context
 */
export async function upsertEntity(
    senderId: string,
    entityType: EntityType,
    entityKey: string,
    entityValue: string,
    confidence: number = 1.0,
    source: string = 'ai_extraction',
    userId?: string | null
): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('lead_entities')
            .upsert({
                sender_id: senderId,
                entity_type: entityType,
                entity_key: entityKey,
                entity_value: entityValue,
                confidence,
                source,
                updated_at: new Date().toISOString(),
                ...(userId && { user_id: userId })
            }, {
                onConflict: 'sender_id,entity_type,entity_key'
            });

        if (error) {
            console.error('[EntityTracking] Error upserting entity:', error);
        }
    } catch (error) {
        console.error('[EntityTracking] Error in upsertEntity:', error);
    }
}

/**
 * Get all entities for a sender
 * Uses supabaseAdmin to bypass RLS, filters by user_id when provided
 */
export async function getLeadEntities(senderId: string, userId?: string | null): Promise<LeadEntity[]> {
    try {
        let query = supabaseAdmin
            .from('lead_entities')
            .select('*')
            .eq('sender_id', senderId)
            .order('entity_type', { ascending: true })
            .order('updated_at', { ascending: false });

        // Filter by user_id for multi-tenancy isolation when provided
        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[EntityTracking] Error fetching entities:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('[EntityTracking] Error in getLeadEntities:', error);
        return [];
    }
}

/**
 * Build entity context for AI system prompt
 */
export function buildEntityContextForAI(entities: LeadEntity[]): string {
    if (!entities || entities.length === 0) {
        return '';
    }

    // Group entities by type
    const grouped: Record<string, LeadEntity[]> = {};
    for (const entity of entities) {
        if (!grouped[entity.entity_type]) {
            grouped[entity.entity_type] = [];
        }
        grouped[entity.entity_type].push(entity);
    }

    const lines: string[] = [];

    // Format each group
    if (grouped.name) {
        const nameInfo = grouped.name.map(e => `${e.entity_key}: ${e.entity_value}`).join(', ');
        lines.push(`- Name: ${nameInfo}`);
    }

    if (grouped.preference) {
        const prefs = grouped.preference.map(e => `${e.entity_key}: ${e.entity_value}`).join(', ');
        lines.push(`- Preferences: ${prefs}`);
    }

    if (grouped.budget) {
        const budget = grouped.budget.map(e => `${e.entity_key}: ${e.entity_value}`).join(', ');
        lines.push(`- Budget: ${budget}`);
    }

    if (grouped.interest) {
        const interests = grouped.interest.map(e => e.entity_value).join(', ');
        lines.push(`- Interests: ${interests}`);
    }

    if (grouped.contact) {
        const contacts = grouped.contact.map(e => `${e.entity_key}: ${e.entity_value}`).join(', ');
        lines.push(`- Contact Info: ${contacts}`);
    }

    if (grouped.custom) {
        const customs = grouped.custom.map(e => `${e.entity_key}: ${e.entity_value}`).join(', ');
        lines.push(`- Other: ${customs}`);
    }

    if (lines.length === 0) {
        return '';
    }

    return `CUSTOMER PROFILE (Known facts about this customer):
${lines.join('\n')}

IMPORTANT: Use this profile to personalize responses. Address the customer by name if known. Reference their preferences and budget when making recommendations.
`;
}

/**
 * Delete all entities for a sender (for testing/cleanup)
 * Uses supabaseAdmin to bypass RLS
 */
export async function deleteLeadEntities(senderId: string, userId?: string | null): Promise<void> {
    try {
        let query = supabaseAdmin
            .from('lead_entities')
            .delete()
            .eq('sender_id', senderId);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { error } = await query;

        if (error) {
            console.error('[EntityTracking] Error deleting entities:', error);
        }
    } catch (error) {
        console.error('[EntityTracking] Error in deleteLeadEntities:', error);
    }
}
