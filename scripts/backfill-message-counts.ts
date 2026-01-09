/**
 * Script to backfill message_count for all leads
 * 
 * Run with: npx ts-node scripts/backfill-message-counts.ts
 * Or: npx tsx scripts/backfill-message-counts.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function backfillMessageCounts() {
    console.log('Starting message count backfill...\n');

    // Get all leads
    const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id, sender_id, user_id, name, message_count');

    if (leadsError) {
        console.error('Error fetching leads:', leadsError);
        process.exit(1);
    }

    console.log(`Found ${leads?.length || 0} leads to process\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const lead of leads || []) {
        try {
            // Count messages for this lead's sender_id (filtered by user_id if present)
            let countQuery = supabaseAdmin
                .from('conversations')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', lead.sender_id)
                .eq('role', 'user'); // Only count user messages

            if (lead.user_id) {
                countQuery = countQuery.eq('user_id', lead.user_id);
            }

            const { count, error: countError } = await countQuery;

            if (countError) {
                console.error(`Error counting messages for lead ${lead.id}:`, countError);
                errors++;
                continue;
            }

            const actualCount = count || 0;

            // Only update if different
            if (lead.message_count !== actualCount) {
                const { error: updateError } = await supabaseAdmin
                    .from('leads')
                    .update({ message_count: actualCount })
                    .eq('id', lead.id);

                if (updateError) {
                    console.error(`Error updating lead ${lead.id}:`, updateError);
                    errors++;
                } else {
                    console.log(`✓ ${lead.name || lead.sender_id}: ${lead.message_count} → ${actualCount}`);
                    updated++;
                }
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`Error processing lead ${lead.id}:`, err);
            errors++;
        }
    }

    console.log('\n--- Summary ---');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already correct): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log('Done!');
}

backfillMessageCounts();
