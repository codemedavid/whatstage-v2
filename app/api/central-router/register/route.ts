import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

/**
 * Tenant Registration API for Central Router
 * 
 * - POST: Register a new tenant (page_id is OPTIONAL - customer links later)
 * - PUT: Link a Facebook Page ID to an existing tenant (called by customer instance)
 * - GET: List all registered tenants
 * - DELETE: Deactivate a tenant route
 */

// GET: List all registered tenants
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('tenant_routes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ tenants: data });
    } catch (error) {
        console.error('[Register] Error listing tenants:', error);
        return NextResponse.json({ error: 'Failed to list tenants' }, { status: 500 });
    }
}

// POST: Register a new tenant (page_id is optional)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { page_id, tenant_name, destination_url, secret_key } = body;

        // Validation - only tenant_name and destination_url are required
        if (!tenant_name || !destination_url) {
            return NextResponse.json(
                { error: 'Missing required fields: tenant_name, destination_url' },
                { status: 400 }
            );
        }

        // Validate URL format
        try {
            new URL(destination_url);
        } catch {
            return NextResponse.json(
                { error: 'Invalid destination_url format' },
                { status: 400 }
            );
        }

        // Insert new tenant (page_id can be null)
        const { data, error } = await supabase
            .from('tenant_routes')
            .upsert(
                {
                    page_id: page_id || null,  // Optional
                    tenant_name,
                    destination_url,
                    secret_key: secret_key || null,
                    is_active: true,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'destination_url' }  // Upsert by destination URL
            )
            .select()
            .single();

        if (error) throw error;

        console.log(`[Register] Tenant registered: ${tenant_name} -> ${destination_url}`);

        return NextResponse.json({
            success: true,
            message: `Tenant "${tenant_name}" registered successfully`,
            tenant: data,
        });

    } catch (error) {
        console.error('[Register] Error registering tenant:', error);
        return NextResponse.json({ error: 'Failed to register tenant' }, { status: 500 });
    }
}

// PUT: Link a Facebook Page ID to an existing tenant (called by customer instance after OAuth)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { page_id, destination_url } = body;

        // Validation
        if (!page_id || !destination_url) {
            return NextResponse.json(
                { error: 'Missing required fields: page_id, destination_url' },
                { status: 400 }
            );
        }

        // Find tenant by destination_url and update with page_id
        const { data, error } = await supabase
            .from('tenant_routes')
            .update({
                page_id,
                is_active: true,
                updated_at: new Date().toISOString()
            })
            .eq('destination_url', destination_url)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json(
                    { error: 'Tenant not found. Please register first.' },
                    { status: 404 }
                );
            }
            throw error;
        }

        console.log(`[Register] Page linked: ${page_id} -> ${destination_url}`);

        return NextResponse.json({
            success: true,
            message: `Page ID "${page_id}" linked to tenant "${data.tenant_name}"`,
            tenant: data,
        });

    } catch (error) {
        console.error('[Register] Error linking page:', error);
        return NextResponse.json({ error: 'Failed to link page' }, { status: 500 });
    }
}

// DELETE: Deactivate a tenant route (by page_id OR by id)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const pageId = searchParams.get('page_id');
        const tenantId = searchParams.get('id');

        if (!pageId && !tenantId) {
            return NextResponse.json(
                { error: 'Missing page_id or id query parameter' },
                { status: 400 }
            );
        }

        let query = supabase
            .from('tenant_routes')
            .update({ is_active: false, updated_at: new Date().toISOString() });

        if (pageId) {
            query = query.eq('page_id', pageId);
        } else if (tenantId) {
            query = query.eq('id', tenantId);
        }

        const { error } = await query;

        if (error) throw error;

        console.log(`[Register] Tenant deactivated: ${pageId || tenantId}`);

        return NextResponse.json({
            success: true,
            message: `Route has been deactivated`,
        });

    } catch (error) {
        console.error('[Register] Error deactivating tenant:', error);
        return NextResponse.json({ error: 'Failed to deactivate tenant' }, { status: 500 });
    }
}
