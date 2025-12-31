import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// POST: Add media to a digital product
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: digital_product_id } = await params;
        const body = await request.json();
        const { media_type, media_url, thumbnail_url } = body;

        if (!media_type || !media_url) {
            return NextResponse.json(
                { error: 'media_type and media_url are required' },
                { status: 400 }
            );
        }

        if (!['image', 'video'].includes(media_type)) {
            return NextResponse.json(
                { error: 'media_type must be "image" or "video"' },
                { status: 400 }
            );
        }

        // Verify product exists
        const { data: product } = await supabase
            .from('digital_products')
            .select('id')
            .eq('id', digital_product_id)
            .single();

        if (!product) {
            return NextResponse.json({ error: 'Digital product not found' }, { status: 404 });
        }

        // Get current max display_order
        const { data: existingMedia } = await supabase
            .from('digital_product_media')
            .select('display_order')
            .eq('digital_product_id', digital_product_id)
            .order('display_order', { ascending: false })
            .limit(1);

        const nextOrder = existingMedia && existingMedia.length > 0
            ? existingMedia[0].display_order + 1
            : 0;

        // Insert new media
        const { data: newMedia, error } = await supabase
            .from('digital_product_media')
            .insert({
                digital_product_id,
                media_type,
                media_url,
                thumbnail_url: thumbnail_url || null,
                display_order: nextOrder
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding media:', error);
            return NextResponse.json({ error: 'Failed to add media' }, { status: 500 });
        }

        return NextResponse.json(newMedia, { status: 201 });
    } catch (error) {
        console.error('Error adding media:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE: Remove media from a digital product
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: digital_product_id } = await params;
        const { searchParams } = new URL(request.url);
        const media_id = searchParams.get('media_id');

        if (!media_id) {
            return NextResponse.json(
                { error: 'media_id query parameter is required' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('digital_product_media')
            .delete()
            .eq('id', media_id)
            .eq('digital_product_id', digital_product_id);

        if (error) {
            console.error('Error deleting media:', error);
            return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting media:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT: Reorder media
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: digital_product_id } = await params;
        const body = await request.json();
        const { media_order } = body; // Array of media IDs in desired order

        if (!Array.isArray(media_order)) {
            return NextResponse.json(
                { error: 'media_order must be an array of media IDs' },
                { status: 400 }
            );
        }

        // Update display_order for each media item
        for (let i = 0; i < media_order.length; i++) {
            await supabase
                .from('digital_product_media')
                .update({ display_order: i })
                .eq('id', media_order[i])
                .eq('digital_product_id', digital_product_id);
        }

        // Fetch updated media
        const { data: updatedMedia } = await supabase
            .from('digital_product_media')
            .select('*')
            .eq('digital_product_id', digital_product_id)
            .order('display_order');

        return NextResponse.json(updatedMedia);
    } catch (error) {
        console.error('Error reordering media:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
