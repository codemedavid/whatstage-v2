/**
 * Bot Test Script
 * 
 * Tests the chatbot's RAG, bot rules, and user-specific configurations
 * to ensure each user has isolated bot behavior.
 * 
 * Run with: npm run test:bot
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials. Check .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test results tracking
let passed = 0;
let failed = 0;

function log(message: string) {
    console.log(message);
}

function pass(testName: string, details?: string) {
    passed++;
    console.log(`✅ PASS: ${testName}`);
    if (details) console.log(`   ${details}`);
}

function fail(testName: string, reason: string) {
    failed++;
    console.error(`❌ FAIL: ${testName}`);
    console.error(`   Reason: ${reason}`);
}

// ============================================================================
// TEST 1: Fetch User Bot Settings
// ============================================================================
async function testUserBotSettings(userId: string) {
    log('\n--- Test 1: User Bot Settings ---');

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            // Check if it's "no rows" error
            if (error.code === 'PGRST116') {
                fail('User Bot Settings', `No bot_settings found for user ${userId}. User may not have settings configured.`);
                return null;
            }
            fail('User Bot Settings', `Database error: ${error.message}`);
            return null;
        }

        if (data) {
            pass('User Bot Settings', `Found settings: bot_name="${data.bot_name}", primary_goal="${data.primary_goal}"`);
            return data;
        } else {
            fail('User Bot Settings', 'No settings returned');
            return null;
        }
    } catch (err: any) {
        fail('User Bot Settings', `Exception: ${err.message}`);
        return null;
    }
}

// ============================================================================
// TEST 2: Fetch User Bot Rules
// ============================================================================
async function testUserBotRules(userId: string) {
    log('\n--- Test 2: User Bot Rules ---');

    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule, priority, enabled')
            .eq('user_id', userId)
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            fail('User Bot Rules', `Database error: ${error.message}`);
            return [];
        }

        if (rules && rules.length > 0) {
            pass('User Bot Rules', `Found ${rules.length} enabled rules`);
            rules.forEach((r, i) => {
                log(`   Rule ${i + 1}: "${r.rule.substring(0, 60)}..."`);
            });
            return rules;
        } else {
            fail('User Bot Rules', `No enabled rules found for user ${userId}. This may be why the bot isn't following rules!`);
            return [];
        }
    } catch (err: any) {
        fail('User Bot Rules', `Exception: ${err.message}`);
        return [];
    }
}

// ============================================================================
// TEST 3: Fetch User Bot Instructions
// ============================================================================
async function testUserBotInstructions(userId: string) {
    log('\n--- Test 3: User Bot Instructions ---');

    try {
        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .eq('user_id', userId)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                fail('User Bot Instructions', `No instructions found for user ${userId}.`);
                return '';
            }
            fail('User Bot Instructions', `Database error: ${error.message}`);
            return '';
        }

        if (data && data.instructions) {
            pass('User Bot Instructions', `Found instructions (${data.instructions.length} chars)`);
            log(`   Preview: "${data.instructions.substring(0, 100)}..."`);
            return data.instructions;
        } else {
            fail('User Bot Instructions', 'No instructions content');
            return '';
        }
    } catch (err: any) {
        fail('User Bot Instructions', `Exception: ${err.message}`);
        return '';
    }
}

// ============================================================================
// TEST 4: Fetch User Payment Methods
// ============================================================================
async function testUserPaymentMethods(userId: string) {
    log('\n--- Test 4: User Payment Methods ---');

    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('name, account_name, account_number, is_active')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) {
            fail('User Payment Methods', `Database error: ${error.message}`);
            return [];
        }

        if (data && data.length > 0) {
            pass('User Payment Methods', `Found ${data.length} active payment methods`);
            data.forEach((pm, i) => {
                log(`   ${i + 1}. ${pm.name} - ${pm.account_name || 'No account name'}`);
            });
            return data;
        } else {
            log('   ⚠️  No payment methods found (optional feature)');
            return [];
        }
    } catch (err: any) {
        fail('User Payment Methods', `Exception: ${err.message}`);
        return [];
    }
}

// ============================================================================
// TEST 5: RAG Document Search (Knowledge Base)
// ============================================================================
async function testRAGSearch(userId: string) {
    log('\n--- Test 5: RAG Knowledge Base ---');

    try {
        // First check if user has any documents
        const { data: docs, error } = await supabase
            .from('documents')
            .select('id, content, category_id')
            .eq('user_id', userId)
            .limit(5);

        if (error) {
            fail('RAG Knowledge Base', `Database error: ${error.message}`);
            return false;
        }

        if (docs && docs.length > 0) {
            pass('RAG Knowledge Base', `Found ${docs.length} documents for user`);
            docs.forEach((doc, i) => {
                log(`   Doc ${i + 1}: "${doc.content.substring(0, 80)}..."`);
            });
            return true;
        } else {
            fail('RAG Knowledge Base', `No documents found for user ${userId}. The bot won't have knowledge base context!`);
            return false;
        }
    } catch (err: any) {
        fail('RAG Knowledge Base', `Exception: ${err.message}`);
        return false;
    }
}

// ============================================================================
// TEST 6: Check Connected Pages (Facebook Integration)
// ============================================================================
async function testConnectedPages(userId: string) {
    log('\n--- Test 6: Connected Facebook Pages ---');

    try {
        const { data: pages, error } = await supabase
            .from('connected_pages')
            .select('page_id, page_name, is_active, user_id')
            .eq('user_id', userId);

        if (error) {
            fail('Connected Pages', `Database error: ${error.message}`);
            return [];
        }

        if (pages && pages.length > 0) {
            pass('Connected Pages', `Found ${pages.length} connected pages`);
            pages.forEach((page, i) => {
                log(`   ${i + 1}. ${page.page_name} (ID: ${page.page_id}) - Active: ${page.is_active}`);
            });
            return pages;
        } else {
            fail('Connected Pages', `No connected pages for user ${userId}. The webhook won't know which user to use!`);
            return [];
        }
    } catch (err: any) {
        fail('Connected Pages', `Exception: ${err.message}`);
        return [];
    }
}

// ============================================================================
// TEST 7: Verify user_id Column Exists on Tables
// ============================================================================
async function testUserIdColumns() {
    log('\n--- Test 7: User ID Columns Check ---');

    const tables = ['bot_settings', 'bot_rules', 'bot_instructions', 'documents', 'connected_pages', 'payment_methods'];
    let allGood = true;

    for (const table of tables) {
        try {
            // Try to query with user_id filter - if column doesn't exist, it will error
            const { error } = await supabase
                .from(table)
                .select('*')
                .eq('user_id', '00000000-0000-0000-0000-000000000000')
                .limit(0);

            if (error && error.message.includes('user_id')) {
                fail(`Column Check: ${table}`, `user_id column may not exist: ${error.message}`);
                allGood = false;
            } else {
                log(`   ✓ ${table} has user_id column`);
            }
        } catch (err: any) {
            fail(`Column Check: ${table}`, `Exception: ${err.message}`);
            allGood = false;
        }
    }

    if (allGood) {
        pass('User ID Columns', 'All required tables have user_id column');
    }
    return allGood;
}

// ============================================================================
// TEST 8: List All Users with Bot Configuration
// ============================================================================
async function listUsersWithBotConfig() {
    log('\n--- Available Users with Bot Configuration ---');

    try {
        // Get users from bot_settings
        const { data: settings, error } = await supabase
            .from('bot_settings')
            .select('user_id, bot_name, primary_goal')
            .not('user_id', 'is', null);

        if (error) {
            console.error('Error fetching users:', error.message);
            return [];
        }

        if (settings && settings.length > 0) {
            log(`Found ${settings.length} users with bot_settings:`);
            settings.forEach((s, i) => {
                log(`   ${i + 1}. User ID: ${s.user_id} | Bot: "${s.bot_name}" | Goal: ${s.primary_goal}`);
            });
            return settings;
        } else {
            log('⚠️  No users found with bot_settings.user_id configured!');
            log('   This is likely the root cause - users need user_id set on their bot_settings rows.');
            return [];
        }
    } catch (err: any) {
        console.error('Exception listing users:', err.message);
        return [];
    }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runTests() {
    console.log('='.repeat(60));
    console.log('BOT CONFIGURATION TEST SUITE');
    console.log('='.repeat(60));
    console.log(`Supabase URL: ${supabaseUrl}`);
    console.log(`Time: ${new Date().toISOString()}`);

    // First, check database structure
    await testUserIdColumns();

    // List available users
    const users = await listUsersWithBotConfig();

    if (users.length === 0) {
        console.log('\n' + '='.repeat(60));
        console.log('⚠️  NO USERS CONFIGURED');
        console.log('='.repeat(60));
        console.log('The bot_settings table has no rows with user_id set.');
        console.log('This means the user-specific bot configuration is not working.');
        console.log('\nTo fix this:');
        console.log('1. Find your user ID from auth.users table');
        console.log('2. Update bot_settings: UPDATE bot_settings SET user_id = \'YOUR_USER_ID\'');
        console.log('3. Update bot_rules: UPDATE bot_rules SET user_id = \'YOUR_USER_ID\'');
        console.log('4. Update bot_instructions: UPDATE bot_instructions SET user_id = \'YOUR_USER_ID\'');
        console.log('5. Update connected_pages: UPDATE connected_pages SET user_id = \'YOUR_USER_ID\'');
        return;
    }

    // Test the first available user
    const testUserId = users[0].user_id;
    console.log(`\n>> Testing user: ${testUserId}`);

    await testUserBotSettings(testUserId);
    await testUserBotRules(testUserId);
    await testUserBotInstructions(testUserId);
    await testUserPaymentMethods(testUserId);
    await testRAGSearch(testUserId);
    await testConnectedPages(testUserId);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(60));

    if (failed > 0) {
        console.log('\n⚠️  DIAGNOSIS:');
        console.log('If bot_rules test failed, the bot won\'t follow user-specific rules.');
        console.log('If connected_pages test failed, the webhook can\'t map page_id to user_id.');
        console.log('If RAG test failed, the bot won\'t have knowledge base context.');
        console.log('\nCheck that all tables have user_id properly set for your user.');
    }

    process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
