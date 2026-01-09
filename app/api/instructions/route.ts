import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

// GET - Fetch bot instructions
export async function GET() {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .eq('user_id', userId)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching instructions:', error);
            return NextResponse.json({ instructions: '' });
        }

        return NextResponse.json({ instructions: data?.instructions || '' });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ instructions: '' });
    }
}

// POST - Update bot instructions
export async function POST(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { instructions } = await req.json();

        if (!instructions) {
            return NextResponse.json({ error: 'Instructions are required' }, { status: 400 });
        }

        // Check if instructions exist for this user
        const { data: existing } = await supabase
            .from('bot_instructions')
            .select('id')
            .eq('user_id', userId)
            .limit(1)
            .single();

        if (existing) {
            // Update existing
            const { error } = await supabase
                .from('bot_instructions')
                .update({ instructions, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .eq('user_id', userId);

            if (error) {
                console.error('Error updating instructions:', error);
                return NextResponse.json({ error: 'Failed to update instructions' }, { status: 500 });
            }
        } else {
            // Insert new
            const { error } = await supabase
                .from('bot_instructions')
                .insert({ user_id: userId, instructions });

            if (error) {
                console.error('Error creating instructions:', error);
                return NextResponse.json({ error: 'Failed to create instructions' }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to save instructions' }, { status: 500 });
    }
}
