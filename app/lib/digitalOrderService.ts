import { createClient } from './supabaseClient';
import { trackActivity } from './activityTrackingService';

export interface DigitalProductPurchase {
    id: string;
    digital_product_id: string;
    lead_id: string | null;
    form_submission_id: string | null;
    facebook_psid: string | null;
    purchase_date: string;
    access_expires_at: string | null;
    status: 'active' | 'expired' | 'cancelled' | 'pending';
    amount_paid: number | null;
    payment_method: string | null;
    payment_reference: string | null;
    created_at: string;
    updated_at: string;
    // Joined data
    digital_product?: {
        id: string;
        title: string;
        price: number | null;
        currency: string;
        thumbnail_url: string | null;
        payment_type: string;
    };
    lead?: {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        sender_id: string | null;
        profile_pic: string | null;
    };
    form_submission?: {
        id: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        submitted_data: Record<string, any>;
        created_at: string;
        form?: {
            id: string;
            title: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            settings?: Record<string, any>;
            fields?: Array<{
                id: string;
                label: string;
                field_type: string;
                display_order: number;
            }>;
        };
    };
}

/**
 * Fetch all digital product purchases with product and customer details
 */
export async function getDigitalProductOrders(): Promise<DigitalProductPurchase[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('digital_product_purchases')
        .select(`
            *,
            digital_product:digital_products (
                id,
                title,
                price,
                currency,
                thumbnail_url,
                payment_type
            ),
            lead:leads (
                id,
                name,
                email,
                phone,
                sender_id,
                profile_pic
            ),
            form_submission:form_submissions (
                id,
                submitted_data,
                created_at,
                form:forms (
                    id,
                    title,
                    settings,
                    fields:form_fields (
                        id,
                        label,
                        field_type,
                        display_order
                    )
                )
            )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching digital product orders:', error);
        throw error;
    }

    return data as DigitalProductPurchase[];
}

/**
 * Get a single digital product purchase by ID
 */
export async function getDigitalProductOrder(purchaseId: string): Promise<DigitalProductPurchase | null> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('digital_product_purchases')
        .select(`
            *,
            digital_product:digital_products (
                id,
                title,
                price,
                currency,
                thumbnail_url,
                payment_type
            ),
            lead:leads (
                id,
                name,
                email,
                phone,
                sender_id,
                profile_pic
            ),
            form_submission:form_submissions (
                id,
                submitted_data,
                created_at,
                form:forms (
                    id,
                    title,
                    settings,
                    fields:form_fields (
                        id,
                        label,
                        field_type,
                        display_order
                    )
                )
            )
        `)
        .eq('id', purchaseId)
        .single();

    if (error) {
        console.error('Error fetching digital product order:', error);
        return null;
    }

    return data as DigitalProductPurchase;
}

/**
 * Update purchase status
 */
export async function updateDigitalOrderStatus(purchaseId: string, status: string) {
    const supabase = createClient();

    // Validate status
    const validStatuses = ['active', 'expired', 'cancelled', 'pending'];
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
    }

    // Fetch purchase with lead info for activity tracking
    const { data: purchaseWithLead, error: fetchError } = await supabase
        .from('digital_product_purchases')
        .select(`
            id,
            lead_id,
            amount_paid,
            digital_product_id,
            lead:leads (
                sender_id
            ),
            digital_product:digital_products (
                title
            )
        `)
        .eq('id', purchaseId)
        .single();

    if (fetchError) {
        console.error('Error fetching purchase for status update:', fetchError);
    }

    // Update the status
    const { data, error } = await supabase
        .from('digital_product_purchases')
        .update({ status })
        .eq('id', purchaseId)
        .select()
        .single();

    if (error) {
        console.error('Error updating digital order status:', error);
        throw error;
    }

    // Track activity if status becomes active (completed purchase)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadData = purchaseWithLead?.lead as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productData = purchaseWithLead?.digital_product as any;
    const senderId = leadData?.sender_id;

    if (senderId && status === 'active') {
        console.log(`[DigitalOrderService] Tracking digital_purchase_completed for sender ${senderId}`);
        trackActivity(
            senderId,
            'digital_purchase_completed',
            purchaseId,
            productData?.title || 'Digital Product',
            {
                purchase_id: purchaseId,
                product_id: purchaseWithLead?.digital_product_id,
                status: status,
                amount_paid: purchaseWithLead?.amount_paid
            }
        ).catch(err => {
            console.error('[DigitalOrderService] Error tracking activity:', err);
        });
    }

    return data;
}

/**
 * Delete a digital product purchase
 */
export async function deleteDigitalOrder(purchaseId: string) {
    const supabase = createClient();

    const { error } = await supabase
        .from('digital_product_purchases')
        .delete()
        .eq('id', purchaseId);

    if (error) {
        console.error('Error deleting digital order:', error);
        throw error;
    }

    return true;
}

/**
 * Get purchases for a specific lead
 */
export async function getDigitalOrdersByLead(leadId: string): Promise<DigitalProductPurchase[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('digital_product_purchases')
        .select(`
            *,
            digital_product:digital_products (
                id,
                title,
                price,
                currency,
                thumbnail_url,
                payment_type
            )
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching digital orders by lead:', error);
        throw error;
    }

    return data as DigitalProductPurchase[];
}

/**
 * Get purchases for a specific digital product
 */
export async function getDigitalOrdersByProduct(productId: string): Promise<DigitalProductPurchase[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('digital_product_purchases')
        .select(`
            *,
            lead:leads (
                id,
                name,
                email,
                phone,
                sender_id,
                profile_pic
            )
        `)
        .eq('digital_product_id', productId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching digital orders by product:', error);
        throw error;
    }

    return data as DigitalProductPurchase[];
}
