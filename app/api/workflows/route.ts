import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET /api/workflows - List all workflows
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('workflows')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error fetching workflows:', error);
        return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
    }
}

// POST /api/workflows - Create new workflow
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, trigger_stage_id, workflow_data } = body;

        const { data, error } = await supabase
            .from('workflows')
            .insert({
                name,
                trigger_stage_id,
                workflow_data,
                is_published: false,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating workflow:', error);
        return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
    }
}

// PUT /api/workflows - Update workflow
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, name, trigger_stage_id, workflow_data } = body;

        const { data, error } = await supabase
            .from('workflows')
            .update({
                name,
                trigger_stage_id,
                workflow_data,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating workflow:', error);
        return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }
}
