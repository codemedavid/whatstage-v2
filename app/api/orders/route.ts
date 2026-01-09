import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

// GET /api/orders - Fetch all orders for the current user
export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                leads (
                    name,
                    email,
                    phone
                ),
                order_items (
                    *
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching orders:', error);
            return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in GET /api/orders:', error);
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}

// PATCH /api/orders - Update order status
export async function PATCH(request: Request) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, status, payment_status, is_cod } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing order ID' }, { status: 400 });
        }

        const supabase = await createClient();

        // Build update object
        const updateData: Record<string, unknown> = {};
        if (status) updateData.status = status;
        if (payment_status !== undefined) updateData.payment_status = payment_status;
        if (is_cod !== undefined) updateData.is_cod = is_cod;
        updateData.updated_at = new Date().toISOString();

        if (Object.keys(updateData).length === 1) { // Only updated_at
            return NextResponse.json({ error: 'No update fields provided' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .maybeSingle();

        if (error) {
            console.error('Error updating order:', error);
            return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
        }

        if (!data) {
            console.error('Order not found or not owned by user:', id);
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in PATCH /api/orders:', error);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
}

// DELETE /api/orders - Delete an order
export async function DELETE(request: Request) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing order ID' }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('orders')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .select();

        if (error) {
            console.error('Error deleting order:', error);
            return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
        }

        if (!data || data.length === 0) {
            console.error('Order not found or not owned by user:', id);
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in DELETE /api/orders:', error);
        return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
    }
}
