import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

/**
 * GET /api/conversations?senderId=xxx&limit=50
 * Fetch conversation history for a sender
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const senderId = searchParams.get('senderId');
        const limit = parseInt(searchParams.get('limit') || '50');

        if (!senderId) {
            return NextResponse.json(
                { error: 'senderId is required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('conversations')
            .select('id, role, content, created_at')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('[Conversations API] Error:', error);
            return NextResponse.json(
                { error: 'Failed to fetch conversations' },
                { status: 500 }
            );
        }

        return NextResponse.json(data || []);

    } catch (error) {
        console.error('[Conversations API] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
