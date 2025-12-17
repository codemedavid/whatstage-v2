import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getLeadEntities } from '@/app/lib/entityTrackingService';
import { getLatestConversationSummary } from '@/app/lib/chatService';

interface MessageWithImportance {
    id: string;
    role: string;
    content: string;
    importance_score: number;
    created_at: string;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leadId } = await params;

        if (!leadId) {
            return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        // Get the lead's sender_id
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('sender_id, name')
            .eq('id', leadId)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        const senderId = lead.sender_id;

        // Fetch all memory components in parallel
        const [entities, summary, importantMessages, recentActivities] = await Promise.all([
            // 1. Structured entities
            getLeadEntities(senderId),

            // 2. Latest conversation summary
            getLatestConversationSummary(senderId),

            // 3. High-importance messages (score >= 2)
            supabase
                .from('conversations')
                .select('id, role, content, importance_score, created_at')
                .eq('sender_id', senderId)
                .gte('importance_score', 2)
                .order('created_at', { ascending: false })
                .limit(10),

            // 4. Recent activities
            supabase
                .from('lead_activities')
                .select('*')
                .eq('sender_id', senderId)
                .order('created_at', { ascending: false })
                .limit(10)
        ]);

        // Format important messages
        const formattedMessages: MessageWithImportance[] = (importantMessages.data || []).map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            importance_score: msg.importance_score || 1,
            created_at: msg.created_at
        }));

        // Group entities by type for display
        const groupedEntities: Record<string, Array<{ key: string; value: string; confidence: number }>> = {};
        for (const entity of entities) {
            if (!groupedEntities[entity.entity_type]) {
                groupedEntities[entity.entity_type] = [];
            }
            groupedEntities[entity.entity_type].push({
                key: entity.entity_key,
                value: entity.entity_value,
                confidence: entity.confidence
            });
        }

        return NextResponse.json({
            leadName: lead.name,
            entities: groupedEntities,
            entityCount: entities.length,
            summary: summary || null,
            importantMessages: formattedMessages,
            activityHighlights: recentActivities.data || []
        });

    } catch (error) {
        console.error('Error fetching lead memory:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
