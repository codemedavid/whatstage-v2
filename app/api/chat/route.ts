import { NextResponse } from 'next/server';
import { getBotResponse } from '@/app/lib/chatService';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { message, sessionId } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Get authenticated user to use their bot configuration
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                },
            }
        );
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || null;

        // Use provided sessionId or generate a web session identifier
        const senderId = sessionId || `web_${Date.now()}`;

        // Pass userId so bot uses user-specific rules, instructions, and knowledge
        const reply = await getBotResponse(message, senderId, undefined, userId);

        return NextResponse.json({
            reply,
            sessionId: senderId,
            userId: userId ? true : false // Don't expose actual userId, just indicate auth status
        });
    } catch (error) {
        console.error('[/api/chat] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
