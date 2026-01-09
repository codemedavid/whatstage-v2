import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron job to send follow-up messages to inactive leads
 * 
 * Now properly supports multi-tenancy:
 * - Fetches all users with follow-ups enabled
 * - Processes each user's leads separately for data isolation
 */
export async function GET(req: Request) {
    try {
        // Verify cron secret to prevent unauthorized access
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Only check auth if CRON_SECRET is set (production)
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            console.log('[FollowUpCron] Unauthorized request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[FollowUpCron] Starting multi-user follow-up check...');

        // Get all users with follow-up enabled
        const { data: usersWithFollowUp, error: settingsError } = await supabaseAdmin
            .from('follow_up_settings')
            .select('user_id, is_enabled')
            .eq('is_enabled', true);

        if (settingsError) {
            console.error('[FollowUpCron] Error fetching follow-up settings:', settingsError);
            return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
        }

        if (!usersWithFollowUp || usersWithFollowUp.length === 0) {
            console.log('[FollowUpCron] No users have follow-ups enabled.');
            return NextResponse.json({
                processed: 0,
                message: 'No users have auto follow-ups enabled.'
            });
        }

        console.log(`[FollowUpCron] Found ${usersWithFollowUp.length} users with follow-ups enabled`);

        let totalProcessed = 0;
        let totalSuccess = 0;
        let totalFailed = 0;

        // Process each user separately for proper data isolation
        for (const userSetting of usersWithFollowUp) {
            const userId = userSetting.user_id;

            if (!userId) {
                console.warn('[FollowUpCron] Skipping follow-up setting with null user_id');
                continue;
            }

            try {
                // Import the service functions dynamically to get user-scoped versions
                const { getLeadsNeedingFollowUpForUser, sendFollowUpForUser } = await import('@/app/lib/followUpService');

                // Get leads that need follow-up for this specific user
                const leads = await getLeadsNeedingFollowUpForUser(userId, 10);

                if (leads.length === 0) {
                    console.log(`[FollowUpCron] No leads need follow-up for user ${userId.substring(0, 8)}...`);
                    continue;
                }

                console.log(`[FollowUpCron] Found ${leads.length} leads to follow up for user ${userId.substring(0, 8)}...`);

                // Process each lead
                for (const lead of leads) {
                    try {
                        const success = await sendFollowUpForUser(lead, userId);
                        if (success) {
                            totalSuccess++;
                        } else {
                            totalFailed++;
                        }
                        totalProcessed++;
                    } catch (error) {
                        console.error(`[FollowUpCron] Error processing lead ${lead.id}:`, error);
                        totalFailed++;
                        totalProcessed++;
                    }
                }
            } catch (userError) {
                console.error(`[FollowUpCron] Error processing user ${userId.substring(0, 8)}...:`, userError);
            }
        }

        console.log(`[FollowUpCron] Complete: ${totalSuccess} sent, ${totalFailed} failed across ${usersWithFollowUp.length} users`);

        return NextResponse.json({
            processed: totalProcessed,
            success: totalSuccess,
            failed: totalFailed,
            usersProcessed: usersWithFollowUp.length,
        });
    } catch (error) {
        console.error('[FollowUpCron] Cron error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

