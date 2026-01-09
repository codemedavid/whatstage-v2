import { NextRequest, NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { id: leadId } = await params;

        if (!leadId) {
            return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        // 1. Fetch Basic Lead Info (with user_id filter via RLS + explicit check)
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select(`
                *,
                pipeline_stages (
                    id,
                    name,
                    color
                )
            `)
            .eq('id', leadId)
            .eq('user_id', userId)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // 2. Fetch Appointments (filter by user_id)
        const { data: appointments, error: apptError } = await supabase
            .from('appointments')
            .select('*')
            .eq('sender_psid', lead.sender_id)
            .eq('user_id', userId)
            .order('appointment_date', { ascending: false });

        console.log('Fetching details for lead:', leadId);

        // 3. Fetch All Orders (Cart + History) - filter by user_id
        const { data: allLeads } = await supabase
            .from('leads')
            .select('id')
            .eq('sender_id', lead.sender_id)
            .eq('user_id', userId);

        const allLeadIds = allLeads?.map(l => l.id) || [leadId];

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                id,
                total_amount,
                status,
                created_at,
                order_items (
                    id,
                    name:product_name,
                    quantity,
                    price:unit_price,
                    variations
                )
            `)
            .in('lead_id', allLeadIds)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (ordersError) {
            console.error('Error fetching orders:', ordersError);
        } else {
            console.log(`Orders found for sender ${lead.sender_id}:`, orders?.length || 0);
        }

        // 4. Fetch Digital Product Purchases (filter by user_id)
        const { data: digitalOrders, error: digitalOrdersError } = await supabase
            .from('digital_product_purchases')
            .select(`
                id,
                amount_paid,
                status,
                purchase_date,
                created_at,
                digital_product:digital_products (
                    id,
                    title,
                    price,
                    currency,
                    thumbnail_url
                )
            `)
            .eq('facebook_psid', lead.sender_id)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (digitalOrdersError) {
            console.error('Error fetching digital orders:', digitalOrdersError);
        } else {
            console.log(`Digital orders found for sender ${lead.sender_id}:`, digitalOrders?.length || 0);
        }

        // 5. Fetch Lead Activity (Stage History) - filter by user_id
        const { data: activity, error: activityError } = await supabase
            .from('lead_stage_history')
            .select(`
                *,
                from_stage: from_stage_id (name),
                to_stage: to_stage_id (name)
            `)
            .eq('lead_id', leadId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        return NextResponse.json({
            lead: {
                ...lead,
                stage: lead.pipeline_stages
            },
            appointments: appointments || [],
            orders: orders || [],
            digital_orders: digitalOrders || [],
            activity: activity || []
        });

    } catch (error) {
        console.error('Error fetching lead details:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
