import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseAdmin';
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
    products: ProductInfo,
    userId: string
) {
    console.log('[SetupService] Generating knowledge for:', business.name, 'user:', userId);

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
        // We'll search for the 'General' category for this user first
        const { data: categories } = await supabaseAdmin
            .from('knowledge_categories')
            .select('id')
            .eq('user_id', userId)
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
                    categoryId: categoryId,
                    userId: userId
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
    preferences: FlowPreferences,
    userId: string
) {
    console.log('[SetupService] Generating config for flow:', preferences.style, 'user:', userId);

    const systemPrompt = `You are an expert AI assistant configuration designer.
    Your task is to analyze the user's desired workflow and create task-oriented instructions for the bot.
    
    IMPORTANT: Generate ACTION-ORIENTED instructions that tell the bot WHAT TO DO, not conversation scripts or dialog examples.
    Focus on tasks, goals, and behaviors - NOT specific phrases or greetings to say.
    
    Generate:
    1. A short, descriptive "Bot Tone" string.
    2. A list of specific "Bot Rules" as actionable guidelines.
    3. A comprehensive "System Prompt" with task-oriented instructions.
    
    OUTPUT FORMAT: JSON object.
    {
        "botTone": "string (max 50 chars)",
        "rules": ["rule 1", "rule 2", "rule 3", "rule 4"],
        "systemPrompt": "Task-oriented instructions describing what the bot should accomplish..."
    }
    
    The systemPrompt MUST be task-oriented and include:
    - Primary objectives and goals the bot should achieve
    - Actions to take (e.g., "Collect customer contact information", "Qualify leads by asking about their needs")
    - When to escalate to human agents
    - What information to gather from customers
    - How to prioritize different customer needs
    
    DO NOT include:
    - Scripted greetings or specific phrases to say
    - Example conversations or dialog
    - Word-for-word responses
    
    Keep instructions concise and action-focused.
    `;

    const userPrompt = `
    Business: ${business.name} (${business.description})
    Bot Tasks & Workflow: ${preferences.flowDescription}
    Communication Style: ${preferences.style}
    
    Generate task-oriented configuration. Focus on WHAT the bot should DO, not what it should SAY.
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

        // Update bot_settings with tone for this user
        const { data: settings } = await supabaseAdmin
            .from('bot_settings')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (settings) {
            await supabaseAdmin
                .from('bot_settings')
                .update({ bot_tone: config.botTone })
                .eq('id', settings.id)
                .eq('user_id', userId);
            console.log('[SetupService] Updated bot_tone:', config.botTone);
        }

        // Save system prompt to bot_instructions table
        if (config.systemPrompt) {
            // Check if instructions exist for this user
            const { data: existing } = await supabaseAdmin
                .from('bot_instructions')
                .select('id')
                .eq('user_id', userId)
                .limit(1)
                .single();

            if (existing) {
                // Update existing
                await supabaseAdmin
                    .from('bot_instructions')
                    .update({ instructions: config.systemPrompt, updated_at: new Date().toISOString() })
                    .eq('id', existing.id)
                    .eq('user_id', userId);
                console.log('[SetupService] Updated bot_instructions');
            } else {
                // Insert new with user_id
                await supabaseAdmin
                    .from('bot_instructions')
                    .insert({
                        user_id: userId,
                        instructions: config.systemPrompt
                    });
                console.log('[SetupService] Created bot_instructions');
            }
        }

        // Add rules to bot_rules table with user_id
        // First delete existing rules to prevent duplicates on re-run
        if (config.rules && Array.isArray(config.rules)) {
            // Delete existing rules for this user first
            const { error: deleteError } = await supabaseAdmin
                .from('bot_rules')
                .delete()
                .eq('user_id', userId);

            if (deleteError) {
                console.error('[SetupService] Error deleting existing rules:', deleteError);
                // Continue anyway - insertion may still work if rules didn't exist
            } else {
                console.log('[SetupService] Cleared existing rules for user');
            }

            const rulesToInsert = config.rules.map((rule: string, index: number) => ({
                user_id: userId,
                rule: rule,
                enabled: true,
                priority: index + 1,
                category: 'general'
            }));

            const { error: rulesError } = await supabaseAdmin.from('bot_rules').insert(rulesToInsert);
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
