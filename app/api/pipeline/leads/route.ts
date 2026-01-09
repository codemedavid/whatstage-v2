import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';
import { waitUntil } from '@vercel/functions';

// GET - Fetch all leads with their stages
export async function GET() {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        // First, get all stages for this user
        const { data: stages, error: stagesError } = await supabase
            .from('pipeline_stages')
            .select('*')
            .eq('user_id', userId)
            .order('display_order', { ascending: true });

        if (stagesError) {
            console.error('Error fetching stages:', stagesError);
            return NextResponse.json({ error: 'Failed to fetch stages' }, { status: 500 });
        }

        // Then, get all leads for this user
        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select('*')
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false });

        if (leadsError) {
            console.error('Error fetching leads:', leadsError);
            return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
        }

        // Group leads by stage
        const stagesWithLeads = stages?.map(stage => ({
            ...stage,
            leads: leads?.filter(lead => lead.current_stage_id === stage.id) || [],
        })) || [];

        return NextResponse.json({ stages: stagesWithLeads }, {
            headers: {
                'Cache-Control': 'private, s-maxage=10, stale-while-revalidate=30',
            },
        });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update a lead's stage (manual override)
export async function PATCH(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { leadId, stageId, reason } = await req.json();

        if (!leadId || !stageId) {
            return NextResponse.json({ error: 'Lead ID and Stage ID are required' }, { status: 400 });
        }

        // Get current stage for history (ensure lead belongs to user)
        const { data: lead } = await supabase
            .from('leads')
            .select('current_stage_id, sender_id')
            .eq('id', leadId)
            .eq('user_id', userId)
            .single();

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        const stageChanged = lead?.current_stage_id !== stageId;

        // Record stage change history
        if (stageChanged) {
            await supabase
                .from('lead_stage_history')
                .insert({
                    user_id: userId,
                    lead_id: leadId,
                    from_stage_id: lead?.current_stage_id,
                    to_stage_id: stageId,
                    reason: reason || 'Manual update',
                    changed_by: 'user',
                });
        }

        // Update lead
        const { data, error } = await supabase
            .from('leads')
            .update({ current_stage_id: stageId })
            .eq('id', leadId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating lead:', error);
            return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
        }

        // Trigger workflows for this stage if stage changed
        if (stageChanged && lead?.sender_id) {
            console.log(`Lead ${leadId} moved to stage ${stageId}, triggering workflows...`);
            const { triggerWorkflowsForStage } = await import('@/app/lib/workflowEngine');

            // Use waitUntil to keep the serverless function alive while workflow executes
            waitUntil(
                triggerWorkflowsForStage(stageId, leadId).catch(err => {
                    console.error('Error triggering workflows:', err);
                })
            );
        }

        return NextResponse.json({ lead: data });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
