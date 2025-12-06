import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { is_published } = await req.json();

        const { data, error } = await supabase
            .from('workflows')
            .update({ is_published })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error publishing workflow:', error);
        return NextResponse.json({ error: 'Failed to publish workflow' }, { status: 500 });
    }
}
