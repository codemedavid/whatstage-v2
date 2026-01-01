import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET: List all digital products with their media
export async function GET() {
    try {
        const { data: products, error } = await supabase
            .from('digital_products')
            .select(`
                *,
                category:product_categories(id, name, color),
                checkout_form:forms(id, title),
                media:digital_product_media(id, media_type, media_url, thumbnail_url, display_order)
            `)
            .order('display_order', { ascending: true });

        if (error) {
            console.error('Error fetching digital products:', error);
            return NextResponse.json({ error: 'Failed to fetch digital products' }, { status: 500 });
        }

        // Sort media by display_order for each product
        const productsWithSortedMedia = products?.map(product => ({
            ...product,
            media: product.media?.sort((a: any, b: any) => a.display_order - b.display_order) || []
        }));

        return NextResponse.json(productsWithSortedMedia || []);
    } catch (error) {
        console.error('Error fetching digital products:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Create a new digital product
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            title,
            description,
            short_description,
            price,
            currency = 'PHP',
            category_id,
            checkout_form_id,
            is_active = true,
            display_order = 0,
            access_type = 'instant',
            access_duration_days,
            creator_name,
            notification_title,
            notification_greeting,
            notification_button_text,
            notification_button_url,
            media = [] // Array of { media_type, media_url, thumbnail_url }
        } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Create the digital product
        const { data: product, error: productError } = await supabase
            .from('digital_products')
            .insert({
                title,
                description,
                short_description,
                price: price ? parseFloat(price) : null,
                currency,
                category_id: category_id || null,
                checkout_form_id: checkout_form_id || null,
                is_active,
                display_order,
                access_type,
                access_duration_days: access_duration_days || null,
                creator_name: creator_name || null,
                notification_title: notification_title || null,
                notification_greeting: notification_greeting || null,
                notification_button_text: notification_button_text || null,
                notification_button_url: notification_button_url || null
            })
            .select()
            .single();

        if (productError) {
            console.error('Error creating digital product:', productError);
            return NextResponse.json({ error: 'Failed to create digital product' }, { status: 500 });
        }

        // Insert media if provided
        if (media.length > 0) {
            const mediaRecords = media.map((m: any, index: number) => ({
                digital_product_id: product.id,
                media_type: m.media_type,
                media_url: m.media_url,
                thumbnail_url: m.thumbnail_url || null,
                display_order: index
            }));

            const { error: mediaError } = await supabase
                .from('digital_product_media')
                .insert(mediaRecords);

            if (mediaError) {
                console.error('Error inserting media:', mediaError);
                // Don't fail the request, just log the error
            }
        }

        // Fetch the complete product with relations
        const { data: completeProduct } = await supabase
            .from('digital_products')
            .select(`
                *,
                category:product_categories(id, name, color),
                checkout_form:forms(id, title),
                media:digital_product_media(id, media_type, media_url, thumbnail_url, display_order)
            `)
            .eq('id', product.id)
            .single();

        return NextResponse.json(completeProduct, { status: 201 });
    } catch (error) {
        console.error('Error creating digital product:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
