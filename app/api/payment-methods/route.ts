import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

// GET - List all payment methods (optionally filtered by category)
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
            .from('payment_methods')
            .select('*')
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
            console.error('Error fetching payment methods:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create new payment method
export async function POST(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await req.json();
        const { categoryId, name, accountName, accountNumber, qrCodeUrl, instructions, displayOrder } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('payment_methods')
            .insert({
                user_id: userId,
                category_id: categoryId || null,
                name,
                account_name: accountName || null,
                account_number: accountNumber || null,
                qr_code_url: qrCodeUrl || null,
                instructions: instructions || null,
                display_order: displayOrder || 0,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating payment method:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update payment method
export async function PATCH(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await req.json();
        const { id, name, accountName, accountNumber, qrCodeUrl, instructions, isActive, displayOrder } = body;

        if (!id) {
            return NextResponse.json({ error: 'Payment method ID is required' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (accountName !== undefined) updates.account_name = accountName;
        if (accountNumber !== undefined) updates.account_number = accountNumber;
        if (qrCodeUrl !== undefined) updates.qr_code_url = qrCodeUrl;
        if (instructions !== undefined) updates.instructions = instructions;
        if (isActive !== undefined) updates.is_active = isActive;
        if (displayOrder !== undefined) updates.display_order = displayOrder;

        const { data, error } = await supabase
            .from('payment_methods')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating payment method:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete payment method
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
            return NextResponse.json({ error: 'Payment method ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('payment_methods')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error deleting payment method:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
