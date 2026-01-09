/**
 * Test Bot Chat Simulation
 * 
 * Simulates a chat with the bot for a specific user to verify
 * rules, knowledge, and instructions are being applied.
 * 
 * Usage: npm run test:chat -- USER_ID "Your test message"
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import OpenAI from 'openai';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface BotConfig {
    settings: any;
    rules: string[];
    instructions: string;
    documents: string[];
}

async function getUserBotConfig(userId: string): Promise<BotConfig> {
    // Get settings
    const { data: settings } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

    // Get rules
    const { data: rulesData } = await supabase
        .from('bot_rules')
        .select('rule')
        .eq('user_id', userId)
        .eq('enabled', true)
        .order('priority');
    const rules = rulesData?.map(r => r.rule) || [];

    // Get instructions
    const { data: instrData } = await supabase
        .from('bot_instructions')
        .select('instructions')
        .eq('user_id', userId)
        .limit(1)
        .single();
    const instructions = instrData?.instructions || '';

    // Get documents
    const { data: docsData } = await supabase
        .from('documents')
        .select('content')
        .eq('user_id', userId)
        .limit(5);
    const documents = docsData?.map(d => d.content) || [];

    return { settings, rules, instructions, documents };
}

function buildSystemPrompt(config: BotConfig): string {
    const { settings, rules, instructions, documents } = config;

    let prompt = `You are ${settings?.bot_name || 'Assistant'}. Your style: ${settings?.bot_tone || 'helpful and professional'}.

`;

    if (rules.length > 0) {
        prompt += `RULES:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n`;
    }

    if (instructions) {
        prompt += `INSTRUCTIONS:\n${instructions}\n\n`;
    }

    if (documents.length > 0) {
        prompt += `KNOWLEDGE BASE:\n${documents.join('\n\n')}\n\n`;
    }

    prompt += `
IMPORTANT:
- Follow the rules above strictly
- Use the knowledge base to answer questions
- Stay in character
`;

    return prompt;
}

async function simulateChat(userId: string, userMessage: string) {
    console.log('='.repeat(60));
    console.log('BOT CHAT SIMULATION');
    console.log('='.repeat(60));
    console.log(`User ID: ${userId}`);
    console.log(`Message: "${userMessage}"`);
    console.log('='.repeat(60));

    // Get user's bot configuration
    console.log('\n📦 Loading bot configuration...');
    const config = await getUserBotConfig(userId);

    if (!config.settings) {
        console.error('❌ No bot settings found for this user!');
        return;
    }

    console.log(`✅ Bot Name: ${config.settings.bot_name}`);
    console.log(`✅ Tone: ${config.settings.bot_tone}`);
    console.log(`✅ Rules: ${config.rules.length}`);
    console.log(`✅ Documents: ${config.documents.length}`);
    console.log(`✅ AI Model: ${config.settings.ai_model}`);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(config);
    console.log('\n📝 System Prompt Preview:');
    console.log('-'.repeat(40));
    console.log(systemPrompt.substring(0, 500) + '...');
    console.log('-'.repeat(40));

    // Create AI client
    const aiModel = config.settings.ai_model || 'qwen/qwen3-235b-a22b';
    console.log(`\n🤖 Calling AI (${aiModel})...`);

    try {
        const client = new OpenAI({
            baseURL: 'https://integrate.api.nvidia.com/v1',
            apiKey: NVIDIA_API_KEY,
        });

        const completion = await client.chat.completions.create({
            model: aiModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.3,
            max_tokens: 1024,
        });

        const response = completion.choices[0]?.message?.content || '';

        console.log('\n' + '='.repeat(60));
        console.log('🤖 BOT RESPONSE:');
        console.log('='.repeat(60));
        console.log(response);
        console.log('='.repeat(60));

        // Analyze if rules were followed
        console.log('\n📊 RULE COMPLIANCE CHECK:');

        // Check for Taglish (if rule exists)
        const hasTaflishRule = config.rules.some(r => r.toLowerCase().includes('taglish'));
        if (hasTaflishRule) {
            const hasTagalog = /\b(po|opo|naman|lang|yung|ano|sige|oo|hindi|gusto|kasi|ba|nga|pala|mo|ko|ako|sa|ang|ng|mga|na|para|din|rin|talaga|paano|bakit)\b/i.test(response);
            console.log(`   ${hasTagalog ? '✅' : '⚠️'} Taglish usage: ${hasTagalog ? 'Detected' : 'Not detected'}`);
        }

        // Check for question-based opening (if rule exists)
        const hasQuestionRule = config.rules.some(r => r.toLowerCase().includes('question') && r.toLowerCase().includes('start'));
        if (hasQuestionRule) {
            const endsWithQuestion = response.includes('?');
            console.log(`   ${endsWithQuestion ? '✅' : '⚠️'} Contains question: ${endsWithQuestion ? 'Yes' : 'No'}`);
        }

        console.log('\n✅ Simulation complete!');

    } catch (error: any) {
        console.error('❌ AI Error:', error.message);
    }
}

// Main
const userId = process.argv[2];
const message = process.argv.slice(3).join(' ') || 'Hello, I want to know more about your products';

if (!userId) {
    console.log('Usage: npm run test:chat -- USER_ID "Your message here"');
    console.log('Example: npm run test:chat -- 18f1466e-9442-4975-8135-c0a5da99ca84 "Hi, what do you sell?"');
    process.exit(1);
}

simulateChat(userId, message).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
