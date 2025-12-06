import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { data, error } = await supabase
            .from('workflows')
            .select('*')
            .eq('id', params.id)
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching workflow:', error);
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { error } = await supabase
            .from('workflows')
            .delete()
            .eq('id', params.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting workflow:', error);
        return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
    }
}
