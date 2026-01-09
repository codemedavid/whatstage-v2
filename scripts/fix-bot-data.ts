/**
 * Bot Data Diagnostic & Fix Script
 * 
 * This script finds orphaned data (rules, instructions, documents)
 * without user_id and helps associate them with the correct user.
 * 
 * Run with: npm run fix:bot-data
 * 
 * SAFEGUARDS:
 * - Validates targetUserId is a valid UUID format
 * - Verifies the user exists in bot_settings before proceeding
 * - Shows preview of all records that will be affected
 * - Requires explicit confirmation (--yes flag or interactive prompt)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import * as readline from 'readline';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials. Check .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// UUID validation regex (standard UUID v4 format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID
 */
function isValidUUID(id: string): boolean {
    return UUID_REGEX.test(id);
}

/**
 * Prompt user for confirmation interactively
 */
async function promptConfirmation(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${message} (yes/no): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

/**
 * Verify that a user exists in the database
 */
async function verifyUserExists(userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('bot_settings')
        .select('id, bot_name')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        return false;
    }

    console.log(`✓ Found user in bot_settings: ${data.bot_name || 'Unnamed'}`);
    return true;
}

/**
 * Get count of orphaned records in a table
 */
async function getOrphanedCount(tableName: string): Promise<number> {
    const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .is('user_id', null);

    if (error) {
        console.error(`Error counting ${tableName}:`, error.message);
        return 0;
    }

    return count || 0;
}

// ============================================================================
// DIAGNOSTIC QUERIES
// ============================================================================

async function diagnoseOrphanedData() {
    console.log('='.repeat(60));
    console.log('BOT DATA DIAGNOSTIC');
    console.log('='.repeat(60));

    // 1. Check orphaned bot_rules (no user_id)
    console.log('\n--- Orphaned Bot Rules (no user_id) ---');
    const { data: orphanRules, error: rulesError } = await supabase
        .from('bot_rules')
        .select('id, rule, enabled, priority')
        .is('user_id', null);

    if (rulesError) {
        console.error('Error:', rulesError.message);
    } else if (orphanRules && orphanRules.length > 0) {
        console.log(`⚠️  Found ${orphanRules.length} rules WITHOUT user_id:`);
        orphanRules.forEach((r, i) => {
            console.log(`   ${i + 1}. [${r.enabled ? 'ON' : 'OFF'}] ${r.rule.substring(0, 60)}...`);
        });
    } else {
        console.log('   ✓ No orphaned rules');
    }

    // 2. Check orphaned bot_instructions (no user_id)
    console.log('\n--- Orphaned Bot Instructions (no user_id) ---');
    const { data: orphanInstructions, error: instrError } = await supabase
        .from('bot_instructions')
        .select('id, instructions')
        .is('user_id', null);

    if (instrError) {
        console.error('Error:', instrError.message);
    } else if (orphanInstructions && orphanInstructions.length > 0) {
        console.log(`⚠️  Found ${orphanInstructions.length} instructions WITHOUT user_id:`);
        orphanInstructions.forEach((i, idx) => {
            console.log(`   ${idx + 1}. "${i.instructions?.substring(0, 80)}..."`);
        });
    } else {
        console.log('   ✓ No orphaned instructions');
    }

    // 3. Check orphaned documents (no user_id)
    console.log('\n--- Orphaned Documents (no user_id) ---');
    const { data: orphanDocs, error: docsError } = await supabase
        .from('documents')
        .select('id, content, category_id')
        .is('user_id', null)
        .limit(10);

    if (docsError) {
        console.error('Error:', docsError.message);
    } else if (orphanDocs && orphanDocs.length > 0) {
        console.log(`⚠️  Found ${orphanDocs.length}+ documents WITHOUT user_id:`);
        orphanDocs.forEach((d, i) => {
            console.log(`   ${i + 1}. "${d.content.substring(0, 60)}..."`);
        });
    } else {
        console.log('   ✓ No orphaned documents');
    }

    // 4. Check connected pages
    console.log('\n--- Connected Facebook Pages ---');
    const { data: allPages, error: pagesError } = await supabase
        .from('connected_pages')
        .select('page_id, page_name, user_id, is_active');

    if (pagesError) {
        console.error('Error:', pagesError.message);
    } else if (allPages && allPages.length > 0) {
        console.log(`Found ${allPages.length} connected pages:`);
        allPages.forEach((p, i) => {
            const userStatus = p.user_id ? `User: ${p.user_id}` : '⚠️  NO USER_ID';
            console.log(`   ${i + 1}. ${p.page_name} (${p.page_id}) - ${userStatus}`);
        });
    } else {
        console.log('   No connected pages found');
    }

    // 5. List all users from auth (if accessible)
    console.log('\n--- Users with Bot Settings ---');
    const { data: usersWithSettings, error: usersError } = await supabase
        .from('bot_settings')
        .select('user_id, bot_name, primary_goal');

    if (usersError) {
        console.error('Error:', usersError.message);
    } else if (usersWithSettings) {
        console.log(`Found ${usersWithSettings.length} bot_settings rows:`);
        usersWithSettings.forEach((u, i) => {
            const userStatus = u.user_id ? `User: ${u.user_id}` : '⚠️  NO USER_ID (global settings)';
            console.log(`   ${i + 1}. ${u.bot_name} (${u.primary_goal}) - ${userStatus}`);
        });
    }

    return { orphanRules, orphanInstructions, orphanDocs, allPages };
}

// ============================================================================
// FIX FUNCTION - Associate orphaned data with a user
// ============================================================================

interface AffectedCounts {
    bot_rules: number;
    bot_instructions: number;
    documents: number;
    connected_pages: number;
    payment_methods: number;
    // Additional tables for conversation context isolation
    conversation_summaries: number;
    conversations: number;
    leads: number;
}

async function previewAffectedRecords(): Promise<AffectedCounts> {
    console.log('\n--- Preview: Records that will be updated ---');

    const counts: AffectedCounts = {
        bot_rules: await getOrphanedCount('bot_rules'),
        bot_instructions: await getOrphanedCount('bot_instructions'),
        documents: await getOrphanedCount('documents'),
        connected_pages: await getOrphanedCount('connected_pages'),
        payment_methods: await getOrphanedCount('payment_methods'),
        // Additional tables for conversation context isolation
        conversation_summaries: await getOrphanedCount('conversation_summaries'),
        conversations: await getOrphanedCount('conversations'),
        leads: await getOrphanedCount('leads'),
    };

    console.log(`   bot_rules:              ${counts.bot_rules} records`);
    console.log(`   bot_instructions:       ${counts.bot_instructions} records`);
    console.log(`   documents:              ${counts.documents} records`);
    console.log(`   connected_pages:        ${counts.connected_pages} records`);
    console.log(`   payment_methods:        ${counts.payment_methods} records`);
    console.log(`   conversation_summaries: ${counts.conversation_summaries} records`);
    console.log(`   conversations:          ${counts.conversations} records`);
    console.log(`   leads:                  ${counts.leads} records`);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`   ─────────────────────────────`);
    console.log(`   TOTAL:                  ${total} records`);

    return counts;
}

async function fixOrphanedData(targetUserId: string, skipConfirmation: boolean = false) {
    console.log('\n' + '='.repeat(60));
    console.log(`FIXING ORPHANED DATA`);
    console.log(`Target User ID: ${targetUserId}`);
    console.log('='.repeat(60));

    // SAFEGUARD 1: Validate UUID format
    if (!isValidUUID(targetUserId)) {
        console.error('\n❌ VALIDATION ERROR: Invalid UUID format');
        console.error(`   Provided: "${targetUserId}"`);
        console.error('   Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        process.exit(1);
    }
    console.log('✓ UUID format validated');

    // SAFEGUARD 2: Verify user exists
    const userExists = await verifyUserExists(targetUserId);
    if (!userExists) {
        console.error('\n❌ VALIDATION ERROR: User not found');
        console.error(`   No bot_settings record found for user_id: ${targetUserId}`);
        console.error('   Please verify the user ID is correct.');
        process.exit(1);
    }

    // SAFEGUARD 3: Preview affected records
    const counts = await previewAffectedRecords();
    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

    if (totalRecords === 0) {
        console.log('\n✓ No orphaned records to fix. All data already has user_id assigned.');
        return;
    }

    // SAFEGUARD 4: Require confirmation
    if (!skipConfirmation) {
        console.log('\n⚠️  WARNING: This operation will update the above records.');
        console.log('   This action cannot be easily undone.');

        const confirmed = await promptConfirmation('\nDo you want to proceed?');
        if (!confirmed) {
            console.log('\n❌ Operation cancelled by user.');
            process.exit(0);
        }
    } else {
        console.log('\n✓ Confirmation skipped (--yes flag provided)');
    }

    console.log('\n--- Performing Updates ---');

    // 1. Fix bot_rules
    if (counts.bot_rules > 0) {
        const { data: updatedRules, error: rulesErr } = await supabase
            .from('bot_rules')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (rulesErr) {
            console.error('❌ Error updating rules:', rulesErr.message);
        } else {
            console.log(`✅ Updated ${updatedRules?.length || 0} bot_rules with user_id`);
        }
    }

    // 2. Fix bot_instructions
    if (counts.bot_instructions > 0) {
        const { data: updatedInstr, error: instrErr } = await supabase
            .from('bot_instructions')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (instrErr) {
            console.error('❌ Error updating instructions:', instrErr.message);
        } else {
            console.log(`✅ Updated ${updatedInstr?.length || 0} bot_instructions with user_id`);
        }
    }

    // 3. Fix documents
    if (counts.documents > 0) {
        const { data: updatedDocs, error: docsErr } = await supabase
            .from('documents')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (docsErr) {
            console.error('❌ Error updating documents:', docsErr.message);
        } else {
            console.log(`✅ Updated ${updatedDocs?.length || 0} documents with user_id`);
        }
    }

    // 4. Fix connected_pages
    if (counts.connected_pages > 0) {
        const { data: updatedPages, error: pagesErr } = await supabase
            .from('connected_pages')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (pagesErr) {
            console.error('❌ Error updating connected_pages:', pagesErr.message);
        } else {
            console.log(`✅ Updated ${updatedPages?.length || 0} connected_pages with user_id`);
        }
    }

    // 5. Fix payment_methods
    if (counts.payment_methods > 0) {
        const { data: updatedPM, error: pmErr } = await supabase
            .from('payment_methods')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (pmErr) {
            console.error('❌ Error updating payment_methods:', pmErr.message);
        } else {
            console.log(`✅ Updated ${updatedPM?.length || 0} payment_methods with user_id`);
        }
    }

    // 6. Fix conversation_summaries
    if (counts.conversation_summaries > 0) {
        const { data: updatedSummaries, error: summErr } = await supabase
            .from('conversation_summaries')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (summErr) {
            console.error('❌ Error updating conversation_summaries:', summErr.message);
        } else {
            console.log(`✅ Updated ${updatedSummaries?.length || 0} conversation_summaries with user_id`);
        }
    }

    // 7. Fix conversations
    if (counts.conversations > 0) {
        const { data: updatedConvs, error: convErr } = await supabase
            .from('conversations')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (convErr) {
            console.error('❌ Error updating conversations:', convErr.message);
        } else {
            console.log(`✅ Updated ${updatedConvs?.length || 0} conversations with user_id`);
        }
    }

    // 8. Fix leads
    if (counts.leads > 0) {
        const { data: updatedLeads, error: leadErr } = await supabase
            .from('leads')
            .update({ user_id: targetUserId })
            .is('user_id', null)
            .select('id');

        if (leadErr) {
            console.error('❌ Error updating leads:', leadErr.message);
        } else {
            console.log(`✅ Updated ${updatedLeads?.length || 0} leads with user_id`);
        }
    }

    console.log('\n✅ Fix complete! Run "npm run test:bot" again to verify.');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const args = process.argv.slice(2);

    // First run diagnosis
    const diagnosis = await diagnoseOrphanedData();

    // Check if --fix flag was passed with a user ID
    const fixIndex = args.indexOf('--fix');
    const yesFlag = args.includes('--yes') || args.includes('-y');

    if (fixIndex !== -1 && args[fixIndex + 1]) {
        const targetUserId = args[fixIndex + 1];
        console.log('\n🔧 Fix mode enabled!');
        await fixOrphanedData(targetUserId, yesFlag);
    } else if (fixIndex !== -1) {
        console.log('\n❌ Please provide a user ID: npm run fix:bot-data -- --fix YOUR_USER_ID');
    } else {
        console.log('\n' + '='.repeat(60));
        console.log('HOW TO FIX');
        console.log('='.repeat(60));
        console.log('To associate orphaned data with a user, run:');
        console.log('');
        console.log('  npm run fix:bot-data -- --fix YOUR_USER_ID');
        console.log('');
        console.log('Options:');
        console.log('  --yes, -y    Skip confirmation prompt');
        console.log('');
        console.log('Example:');
        console.log('  npm run fix:bot-data -- --fix 8b8eb327-d6bd-46de-a68a-1bd6de260b2b');
        console.log('  npm run fix:bot-data -- --fix 8b8eb327-d6bd-46de-a68a-1bd6de260b2b --yes');
        console.log('');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
