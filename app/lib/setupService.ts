import OpenAI from 'openai';
import { supabase } from './supabase';
import { addDocument } from './rag';

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

const AI_MODEL = 'qwen/qwen3-235b-a22b'; // Consistent with other services

interface BusinessInfo {
    name: string;
    description: string;
}

interface ProductInfo {
    type: string;
    details: string;
}

interface FlowPreferences {
    flowDescription: string;
    style: string;
}

/**
 * Generate initial knowledge base documents based on business and product info
 */
export async function generateKnowledgeBase(
    business: BusinessInfo,
    products: ProductInfo
) {
    console.log('[SetupService] Generating knowledge for:', business.name);

    const systemPrompt = `You are an expert technical writer and knowledge base architect.
    Your task is to generate clear, structured knowledge base articles based on the provided business and product information.
    
    OUTPUT FORMAT: Return a JSON array of objects, where each object represents a document.
    Example:
    [
        { "title": "About Us", "content": "..." },
        { "title": "Our Products", "content": "..." },
        { "title": "Services Offered", "content": "..." }
    ]
    
    The content should be professional, comprehensive, and ready for a customer-facing bot to use as reference.`;

    const userPrompt = `
    Business Name: ${business.name}
    Business Description: ${business.description}
    
    Product Type: ${products.type}
    Product Details: ${products.details}
    
    Generate 3-5 foundational knowledge base articles covering:
    1. Company Overview (About Us)
    2. Product/Service Offerings (Detailed breakdown)
    3. General FAQ (Implied from the type of business)
    `;

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4096,
        });

        let content = response.choices[0]?.message?.content || '[]';
        // Clean the response - remove markdown code blocks if present
        if (content.includes('```json')) {
            content = content.replace(/```json/g, '').replace(/```/g, '');
        } else if (content.includes('```')) {
            content = content.replace(/```/g, '');
        }

        const documents = JSON.parse(content);

        // Save documents to knowledge_base using addDocument
        // We'll search for the 'General' category first
        const { data: categories } = await supabase
            .from('knowledge_categories')
            .select('id')
            .eq('name', 'General')
            .single();

        const categoryId = categories?.id;

        const results = [];
        for (const doc of documents) {
            const success = await addDocument(
                `# ${doc.title}\n\n${doc.content}`,
                {
                    source: 'setup_wizard',
                    type: 'generated',
                    title: doc.title,
                    categoryId: categoryId
                }
            );
            results.push(success);
        }

        return results.every(r => r);

    } catch (error) {
        console.error('[SetupService] Error generating knowledge:', error);
        throw error;
    }
}

/**
 * Generate bot configuration (tone, initial rules, system prompt) based on flow preferences
 */
export async function generateBotConfiguration(
    business: BusinessInfo,
    preferences: FlowPreferences
) {
    console.log('[SetupService] Generating config for flow:', preferences.style);

    const systemPrompt = `You are an expert conversation designer.
    Your task is to analyze the user's desired conversation flow and style, and generate:
    1. A short, descriptive "Bot Tone" string.
    2. A list of specific "Bot Rules" to enforce this behavior.
    3. A comprehensive "System Prompt" (instructions) that tells the AI how to behave.
    
    OUTPUT FORMAT: JSON object.
    {
        "botTone": "string (max 50 chars)",
        "rules": ["rule 1", "rule 2", "rule 3", "rule 4"],
        "systemPrompt": "A comprehensive instruction for the AI assistant describing how to behave, what tone to use, and how to handle conversations..."
    }
    
    The systemPrompt should be detailed and include:
    - The personality and communication style
    - How to greet customers
    - How to handle common scenarios
    - Key behaviors to follow
    `;

    const userPrompt = `
    Business: ${business.name} (${business.description})
    Desired Conversation Flow: ${preferences.flowDescription}
    Speaking Style: ${preferences.style}
    
    Generate the configuration with a comprehensive system prompt/instructions.
    `;

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2048,
        });

        let content = response.choices[0]?.message?.content || '{}';
        // Clean the response - remove markdown code blocks if present
        if (content.includes('```json')) {
            content = content.replace(/```json/g, '').replace(/```/g, '');
        } else if (content.includes('```')) {
            content = content.replace(/```/g, '');
        }

        const config = JSON.parse(content);

        // Update bot_settings with tone
        const { data: settings } = await supabase.from('bot_settings').select('id').single();
        if (settings) {
            await supabase
                .from('bot_settings')
                .update({ bot_tone: config.botTone })
                .eq('id', settings.id);
            console.log('[SetupService] Updated bot_tone:', config.botTone);
        }

        // Save system prompt to bot_instructions table
        if (config.systemPrompt) {
            // Check if instructions exist
            const { data: existing } = await supabase
                .from('bot_instructions')
                .select('id')
                .limit(1)
                .single();

            if (existing) {
                // Update existing
                await supabase
                    .from('bot_instructions')
                    .update({ instructions: config.systemPrompt, updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                console.log('[SetupService] Updated bot_instructions');
            } else {
                // Insert new
                await supabase
                    .from('bot_instructions')
                    .insert({ instructions: config.systemPrompt });
                console.log('[SetupService] Created bot_instructions');
            }
        }

        // Add rules to bot_rules table
        if (config.rules && Array.isArray(config.rules)) {
            const rulesToInsert = config.rules.map((rule: string, index: number) => ({
                rule: rule,
                enabled: true,
                priority: index + 1,
                category: 'general'
            }));

            const { error: rulesError } = await supabase.from('bot_rules').insert(rulesToInsert);
            if (rulesError) {
                console.error('[SetupService] Error inserting rules:', rulesError);
            } else {
                console.log('[SetupService] Inserted', rulesToInsert.length, 'rules');
            }
        }

        return config;

    } catch (error) {
        console.error('[SetupService] Error generating config:', error);
        throw error;
    }
}
