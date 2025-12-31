import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET: Get a single digital product by ID
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: product, error } = await supabase
            .from('digital_products')
            .select(`
                *,
                category:product_categories(id, name, color),
                checkout_form:forms(id, title, description, settings),
                media:digital_product_media(id, media_type, media_url, thumbnail_url, display_order)
            `)
            .eq('id', id)
            .single();

        if (error || !product) {
            return NextResponse.json({ error: 'Digital product not found' }, { status: 404 });
        }

        // Sort media by display_order
        product.media = product.media?.sort((a: any, b: any) => a.display_order - b.display_order) || [];

        return NextResponse.json(product);
    } catch (error) {
        console.error('Error fetching digital product:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT: Update a digital product
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const {
            title,
            description,
            short_description,
            price,
            currency,
            category_id,
            checkout_form_id,
            is_active,
            display_order,
            access_type,
            access_duration_days,
            payment_type,
            billing_interval,
            thumbnail_url,
            creator_name,
            media // Optional: if provided, replace all media
        } = body;

        // Build update object with only provided fields
        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (short_description !== undefined) updateData.short_description = short_description;
        if (price !== undefined) updateData.price = price ? parseFloat(price) : null;
        if (currency !== undefined) updateData.currency = currency;
        if (category_id !== undefined) updateData.category_id = category_id || null;
        if (checkout_form_id !== undefined) updateData.checkout_form_id = checkout_form_id || null;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (display_order !== undefined) updateData.display_order = display_order;
        if (access_type !== undefined) updateData.access_type = access_type;
        if (access_duration_days !== undefined) updateData.access_duration_days = access_duration_days || null;
        if (payment_type !== undefined) updateData.payment_type = payment_type;
        if (billing_interval !== undefined) updateData.billing_interval = billing_interval;
        if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
        if (creator_name !== undefined) updateData.creator_name = creator_name || null;

        const { error: updateError } = await supabase
            .from('digital_products')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            console.error('Error updating digital product:', updateError);
            return NextResponse.json({ error: 'Failed to update digital product' }, { status: 500 });
        }

        // If media array is provided, replace all media
        if (media !== undefined) {
            // Delete existing media
            await supabase
                .from('digital_product_media')
                .delete()
                .eq('digital_product_id', id);

            // Insert new media
            if (media.length > 0) {
                const mediaRecords = media.map((m: any, index: number) => ({
                    digital_product_id: id,
                    media_type: m.media_type,
                    media_url: m.media_url,
                    thumbnail_url: m.thumbnail_url || null,
                    display_order: index
                }));

                await supabase
                    .from('digital_product_media')
                    .insert(mediaRecords);
            }
        }

        // Fetch and return updated product
        const { data: updatedProduct } = await supabase
            .from('digital_products')
            .select(`
                *,
                category:product_categories(id, name, color),
                checkout_form:forms(id, title),
                media:digital_product_media(id, media_type, media_url, thumbnail_url, display_order)
            `)
            .eq('id', id)
            .single();

        return NextResponse.json(updatedProduct);
    } catch (error) {
        console.error('Error updating digital product:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE: Delete a digital product
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Media will be cascade deleted due to foreign key constraint
        const { error } = await supabase
            .from('digital_products')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting digital product:', error);
            return NextResponse.json({ error: 'Failed to delete digital product' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting digital product:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
