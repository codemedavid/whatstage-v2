import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    try {
        // 1. Get Store Settings
        const { data: storeSettings } = await supabase
            .from('store_settings')
            .select('store_name, store_type, setup_completed')
            .single();

        const store = {
            isSetup: !!storeSettings?.setup_completed,
            name: storeSettings?.store_name || null,
            type: storeSettings?.store_type as 'ecommerce' | 'real_estate' | null
        };

        // 2. Get Bot Settings for primary goal
        const { data: botSettings } = await supabase
            .from('bot_settings')
            .select('primary_goal')
            .single();

        const goalType = (botSettings?.primary_goal || 'lead_generation') as
            'lead_generation' | 'appointment_booking' | 'tripping' | 'purchase';

        // 2b. Get valid stages to filter phantom leads
        const { data: validStages } = await supabase
            .from('pipeline_stages')
            .select('id');
        const validStageIds = validStages?.map(s => s.id) || [];

        // 3. Get total leads count
        const { count: totalLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .in('current_stage_id', validStageIds);

        // 4. Calculate goal reached based on goal type
        let reachedCount = 0;

        if (goalType === 'lead_generation') {
            // Leads with phone OR email AND valid stage
            const { count } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .or('phone.not.is.null,email.not.is.null')
                .in('current_stage_id', validStageIds);
            reachedCount = count || 0;
        } else if (goalType === 'appointment_booking') {
            // Leads with confirmed/pending appointment
            const { count } = await supabase
                .from('appointments')
                .select('sender_psid', { count: 'exact', head: true })
                .in('status', ['confirmed', 'pending']);
            reachedCount = count || 0;
        } else if (goalType === 'purchase') {
            // Leads with confirmed+ orders
            const { count } = await supabase
                .from('orders')
                .select('lead_id', { count: 'exact', head: true })
                .in('status', ['confirmed', 'processing', 'shipped', 'delivered']);
            reachedCount = count || 0;
        } else if (goalType === 'tripping') {
            // Leads in Qualified or later stages
            const { data: stages } = await supabase
                .from('pipeline_stages')
                .select('id, display_order')
                .gte('display_order', 2); // Qualified is display_order 2

            if (stages && stages.length > 0) {
                const stageIds = stages.map(s => s.id);
                const { count } = await supabase
                    .from('leads')
                    .select('*', { count: 'exact', head: true })
                    .in('current_stage_id', stageIds);
                reachedCount = count || 0;
            }
        }

        const total = totalLeads || 0;
        const percentage = total > 0 ? Math.round((reachedCount / total) * 100) : 0;

        // 5. Get Pipeline Health - Positive stages
        // We include Qualified, Negotiating, Won, and Appointment related stages
        const { data: positiveStages } = await supabase
            .from('pipeline_stages')
            .select('id, name')
            .in('name', ['Qualified', 'Negotiating', 'Won', 'Appointment Booked', 'Appointment Scheduled']);

        const positiveStageIds = positiveStages?.map(s => s.id) || [];

        let qualifiedCount = 0;
        let previousQualifiedCount = 0;

        if (positiveStageIds.length > 0) {
            // Current positive leads
            const { count: currentCount } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .in('current_stage_id', positiveStageIds);
            qualifiedCount = currentCount || 0;

            // Previous period (last 7 days comparison)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { count: prevCount } = await supabase
                .from('lead_stage_history')
                .select('*', { count: 'exact', head: true })
                .in('to_stage_id', positiveStageIds)
                .lt('created_at', sevenDaysAgo.toISOString());
            previousQualifiedCount = prevCount || 0;
        }

        // Calculate trend
        let trend: 'up' | 'down' | 'stable' = 'stable';
        let trendPercentage = 0;

        if (previousQualifiedCount > 0) {
            const diff = qualifiedCount - previousQualifiedCount;
            trendPercentage = Math.round((diff / previousQualifiedCount) * 100);
            trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
        } else if (qualifiedCount > 0) {
            trend = 'up';
            trendPercentage = 100;
        }

        return NextResponse.json({
            store,
            goal: {
                type: goalType,
                reached: reachedCount,
                total,
                percentage
            },
            pipeline: {
                qualifiedCount,
                trend,
                trendPercentage: Math.abs(trendPercentage),
                percentage: total > 0 ? Math.round((qualifiedCount / total) * 100) : 0
            }
        }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0'
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
