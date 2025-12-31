import { NextResponse } from 'next/server';
import {
    getDigitalProductOrders,
    updateDigitalOrderStatus,
    deleteDigitalOrder
} from '@/app/lib/digitalOrderService';

/**
 * GET /api/digital-orders
 * Fetch all digital product purchases with product and customer details
 */
export async function GET() {
    try {
        const orders = await getDigitalProductOrders();
        return NextResponse.json(orders);
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

        const updated = await updateDigitalOrderStatus(id, status);
        return NextResponse.json(updated);
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
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Purchase ID is required' },
                { status: 400 }
            );
        }

        await deleteDigitalOrder(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in DELETE /api/digital-orders:', error);
        return NextResponse.json(
            { error: 'Failed to delete digital order' },
            { status: 500 }
        );
    }
}
