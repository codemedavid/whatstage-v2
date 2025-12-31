import { NextResponse } from 'next/server';
import { addDocument } from '@/app/lib/rag';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    const { data, error } = await supabase
        .from('documents')
        .select('id, content, metadata, folder_id, category_id')
        .order('id', { ascending: false })
        .limit(50);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedData = data.map((item: any) => ({
        id: item.id,
        text: item.content,
        createdAt: new Date().toISOString(),
        folderId: item.folder_id || undefined,
        categoryId: item.category_id || undefined,
    }));

    return NextResponse.json(mappedData);
}

// POST - Create a new document
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, categoryId } = body;

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        const success = await addDocument(text, { categoryId });

        if (!success) {
            return NextResponse.json({ error: 'Failed to process document' }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update existing document content
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, text, categoryId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // Update the document content and optionally the category
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = { content: text };
        if (categoryId !== undefined) updates.category_id = categoryId || null;

        const { error } = await supabase
            .from('documents')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating document:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update document's folder or category assignment
export async function PATCH(req: Request) {
    try {
        const { id, folderId, categoryId } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        // Build update object with provided fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {};
        if (folderId !== undefined) updates.folder_id = folderId || null;
        if (categoryId !== undefined) updates.category_id = categoryId || null;

        const { error } = await supabase
            .from('documents')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating document:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
