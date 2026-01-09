/**
 * Test specific user's bot configuration
 * 
 * Usage: npm run test:user -- USER_ID
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUser(userId: string) {
    console.log('='.repeat(60));
    console.log(`TESTING USER: ${userId}`);
    console.log('='.repeat(60));

    // 1. Bot Settings
    console.log('\n--- Bot Settings ---');
    const { data: settings } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (settings) {
        console.log(`✅ Bot Name: ${settings.bot_name}`);
        console.log(`✅ Tone: ${settings.bot_tone}`);
        console.log(`✅ Primary Goal: ${settings.primary_goal}`);
        console.log(`✅ AI Model: ${settings.ai_model || 'default'}`);
    } else {
        console.log('❌ No settings found');
    }

    // 2. Bot Rules
    console.log('\n--- Bot Rules ---');
    const { data: rules } = await supabase
        .from('bot_rules')
        .select('rule, enabled, priority')
        .eq('user_id', userId)
        .eq('enabled', true)
        .order('priority');

    if (rules && rules.length > 0) {
        console.log(`✅ Found ${rules.length} enabled rules:`);
        rules.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.rule}`);
        });
    } else {
        console.log('❌ No rules found - BOT WON\'T FOLLOW ANY CUSTOM RULES!');
    }

    // 3. Bot Instructions
    console.log('\n--- Bot Instructions ---');
    const { data: instr } = await supabase
        .from('bot_instructions')
        .select('instructions')
        .eq('user_id', userId)
        .limit(1)
        .single();

    if (instr?.instructions) {
        console.log(`✅ Instructions (${instr.instructions.length} chars):`);
        console.log(`   "${instr.instructions.substring(0, 200)}..."`);
    } else {
        console.log('❌ No instructions found');
    }

    // 4. Documents (RAG Knowledge)
    console.log('\n--- Knowledge Base (RAG Documents) ---');
    const { data: docs, count } = await supabase
        .from('documents')
        .select('id, content', { count: 'exact' })
        .eq('user_id', userId)
        .limit(5);

    if (docs && docs.length > 0) {
        console.log(`✅ Found ${count || docs.length} documents:`);
        docs.forEach((d, i) => {
            console.log(`   ${i + 1}. "${d.content.substring(0, 80)}..."`);
        });
    } else {
        console.log('❌ No documents found - BOT WON\'T HAVE KNOWLEDGE CONTEXT!');
    }

    // 5. Connected Pages
    console.log('\n--- Connected Facebook Pages ---');
    const { data: pages } = await supabase
        .from('connected_pages')
        .select('page_id, page_name, is_active')
        .eq('user_id', userId);

    if (pages && pages.length > 0) {
        console.log(`✅ Connected pages:`);
        pages.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.page_name} (${p.page_id}) - Active: ${p.is_active}`);
        });
    } else {
        console.log('❌ No connected pages - WEBHOOK CAN\'T MAP TO THIS USER!');
    }

    // 6. Payment Methods
    console.log('\n--- Payment Methods ---');
    const { data: payments } = await supabase
        .from('payment_methods')
        .select('name, account_name, is_active')
        .eq('user_id', userId)
        .eq('is_active', true);

    if (payments && payments.length > 0) {
        console.log(`✅ ${payments.length} payment methods:`);
        payments.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name} - ${p.account_name || 'No account name'}`);
        });
    } else {
        console.log('⚠️  No payment methods (optional)');
    }

    console.log('\n' + '='.repeat(60));
}

// Get user ID from command line
const userId = process.argv[2];
if (!userId) {
    console.log('Usage: npm run test:user -- USER_ID');
    console.log('Example: npm run test:user -- 92e77d87-5ab3-4331-9a54-7e05fa534b24');
    process.exit(1);
}

testUser(userId).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
