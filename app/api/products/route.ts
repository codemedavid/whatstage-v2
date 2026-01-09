import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

// GET - List all products (optionally filtered by category)
export async function GET(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { searchParams } = new URL(req.url);
        const categoryId = searchParams.get('categoryId');
        const activeOnly = searchParams.get('activeOnly') === 'true';

        let query = supabase
            .from('products')
            .select(`
                *,
                category:product_categories(id, name, color)
            `)
            .eq('user_id', userId)
            .order('display_order', { ascending: true });

        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching products:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create new product
export async function POST(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await req.json();
        const { name, description, price, imageUrl, categoryId, displayOrder } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('products')
            .insert({
                user_id: userId,
                name,
                description: description || null,
                price: price || null,
                currency: 'PHP',
                image_url: imageUrl || null,
                category_id: categoryId || null,
                display_order: displayOrder || 0,
                is_active: true,
            })
            .select(`
                *,
                category:product_categories(id, name, color)
            `)
            .single();

        if (error) {
            console.error('Error creating product:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update product
export async function PATCH(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await req.json();
        const { id, name, description, price, imageUrl, categoryId, isActive, displayOrder } = body;

        if (!id) {
            return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (price !== undefined) updates.price = price;
        if (imageUrl !== undefined) updates.image_url = imageUrl;
        if (categoryId !== undefined) updates.category_id = categoryId;
        if (isActive !== undefined) updates.is_active = isActive;
        if (displayOrder !== undefined) updates.display_order = displayOrder;

        const { data, error } = await supabase
            .from('products')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select(`
                *,
                category:product_categories(id, name, color)
            `)
            .single();

        if (error) {
            console.error('Error updating product:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete product
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
            return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error deleting product:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
