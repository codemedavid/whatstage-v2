import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch all folders
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('document_folders')
            .select('id, name, created_at')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching folders:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Map to the format expected by the frontend
        const folders = data.map((folder: any) => ({
            id: folder.id,
            name: folder.name,
            isOpen: true,
        }));

        return NextResponse.json(folders);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create a new folder
export async function POST(req: Request) {
    try {
        const { name } = await req.json();

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('document_folders')
            .insert({ name: name.trim() })
            .select()
            .single();

        if (error) {
            console.error('Error creating folder:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            id: data.id,
            name: data.name,
            isOpen: true,
        }, { status: 201 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete a folder
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('document_folders')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting folder:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
