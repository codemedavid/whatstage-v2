import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

// GET - Fetch all bot rules
export async function GET() {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('*')
            .eq('user_id', userId)
            .order('priority', { ascending: true });

        if (error) {
            console.error('Error fetching rules:', error);
            return NextResponse.json({ rules: [] });
        }

        return NextResponse.json({ rules: rules || [] });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ rules: [] });
    }
}

// POST - Create a new bot rule
export async function POST(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { rule, category, priority } = await req.json();

        if (!rule) {
            return NextResponse.json({ error: 'Rule text is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('bot_rules')
            .insert({
                user_id: userId,
                rule,
                category: category || 'general',
                priority: priority || 0,
                enabled: true,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating rule:', error);
            return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rule: data });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
    }
}

// DELETE - Delete a bot rule
export async function DELETE(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('bot_rules')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error deleting rule:', error);
            return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
    }
}

// PATCH - Update a bot rule
export async function PATCH(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { id, rule, category, priority, enabled } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (rule !== undefined) updates.rule = rule;
        if (category !== undefined) updates.category = category;
        if (priority !== undefined) updates.priority = priority;
        if (enabled !== undefined) updates.enabled = enabled;

        const { data, error } = await supabase
            .from('bot_rules')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating rule:', error);
            return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rule: data });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
    }
}
