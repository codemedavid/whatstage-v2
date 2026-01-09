import { NextResponse } from 'next/server';
import { addDocument } from '@/app/lib/rag';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

export async function GET() {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('documents')
            .select('id, content, metadata, folder_id, category_id, created_at')
            .eq('user_id', userId)
            .order('id', { ascending: false })
            .limit(50);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const mappedData = data.map((item) => ({
            id: item.id,
            text: item.content,
            createdAt: item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
            folderId: item.folder_id || undefined,
            categoryId: item.category_id || undefined,
        }));

        return NextResponse.json(mappedData);
    } catch (error) {
        console.error('Error fetching documents:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create a new document
export async function POST(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { text, categoryId } = body;

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // Pass userId to addDocument so it can be stored
        const success = await addDocument(text, { categoryId, userId });

        if (!success) {
            return NextResponse.json({ error: 'Failed to process document' }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error('Error creating document:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update existing document content
export async function PUT(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await req.json();
        const { id, text, categoryId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // Update the document content and optionally the category
        const updates: Record<string, unknown> = { content: text };
        if (categoryId !== undefined) updates.category_id = categoryId || null;

        const { error } = await supabase
            .from('documents')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId);

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
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { id, folderId, categoryId } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        // Build update object with provided fields
        const updates: Record<string, unknown> = {};
        if (folderId !== undefined) updates.folder_id = folderId || null;
        if (categoryId !== undefined) updates.category_id = categoryId || null;

        const { error } = await supabase
            .from('documents')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId);

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
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting document:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
