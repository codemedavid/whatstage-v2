import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

/**
 * GET /api/digital-orders
 * Fetch all digital product purchases for the current user with product and customer details
 */
export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('digital_product_purchases')
            .select(`
                *,
                digital_products (
                    id,
                    title,
                    description,
                    price
                ),
                leads (
                    name,
                    email,
                    phone,
                    sender_id
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching digital orders:', error);
            return NextResponse.json(
                { error: 'Failed to fetch digital orders' },
                { status: 500 }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in GET /api/digital-orders:', error);
        return NextResponse.json(
            { error: 'Failed to fetch digital orders' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/digital-orders
 * Update a digital product purchase status
 * Body: { id: string, status: 'active' | 'expired' | 'cancelled' | 'pending' }
 */
export async function PATCH(request: Request) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, status } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Purchase ID is required' },
                { status: 400 }
            );
        }

        if (!status) {
            return NextResponse.json(
                { error: 'Status is required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('digital_product_purchases')
            .update({
                status,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .maybeSingle();

        if (error) {
            console.error('Error updating digital order:', error);
            return NextResponse.json(
                { error: 'Failed to update digital order' },
                { status: 500 }
            );
        }

        if (!data) {
            console.error('Digital order not found or not owned by user:', id);
            return NextResponse.json(
                { error: 'Digital order not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/digital-orders:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update digital order' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/digital-orders?id=<purchaseId>
 * Delete a digital product purchase
 */
export async function DELETE(request: Request) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Purchase ID is required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('digital_product_purchases')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .select();

        if (error) {
            console.error('Error deleting digital order:', error);
            return NextResponse.json(
                { error: 'Failed to delete digital order' },
                { status: 500 }
            );
        }

        if (!data || data.length === 0) {
            console.error('Digital order not found or not owned by user:', id);
            return NextResponse.json(
                { error: 'Digital order not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in DELETE /api/digital-orders:', error);
        return NextResponse.json(
            { error: 'Failed to delete digital order' },
            { status: 500 }
        );
    }
}
