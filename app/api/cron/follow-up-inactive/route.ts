import { NextResponse } from 'next/server';
import { getLeadsNeedingFollowUp, sendFollowUp } from '@/app/lib/followUpService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron job to send follow-up messages to inactive leads
 * Runs every minute via Vercel cron
 * 
 * The ML-based timing ensures we contact leads at optimal times:
 * - Respects active hours (configurable, default 8am-9pm)
 * - Learns from response patterns to optimize timing
 * - Increases intervals progressively for unresponsive leads
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

        console.log('[FollowUpCron] Starting follow-up check...');

        // Get leads that need follow-up right now
        const leads = await getLeadsNeedingFollowUp(10);

        if (leads.length === 0) {
            console.log('[FollowUpCron] No leads need follow-up');
            return NextResponse.json({ processed: 0, message: 'No leads need follow-up' });
        }

        console.log(`[FollowUpCron] Found ${leads.length} leads to follow up`);

        let successCount = 0;
        let failCount = 0;

        // Process each lead
        for (const lead of leads) {
            try {
                const success = await sendFollowUp(lead);
                if (success) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error(`[FollowUpCron] Error processing lead ${lead.id}:`, error);
                failCount++;
            }
        }

        console.log(`[FollowUpCron] Complete: ${successCount} sent, ${failCount} failed`);

        return NextResponse.json({
            processed: leads.length,
            success: successCount,
            failed: failCount,
        });
    } catch (error) {
        console.error('[FollowUpCron] Cron error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
