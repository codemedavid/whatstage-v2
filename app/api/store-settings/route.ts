
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch current store settings
export async function GET(req: Request) {
    try {
        const { data, error } = await supabase
            .from('store_settings')
            .select('*')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned, which is fine for first time
            console.error('Error fetching store settings:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Return null if no settings found (client will interpret this as setup needed)
        return NextResponse.json(data || null);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create or Update store settings
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { storeName, storeType, setupCompleted, id } = body;

        if (!storeName || !storeType) {
            return NextResponse.json({ error: 'Store Name and Type are required' }, { status: 400 });
        }

        const payload = {
            store_name: storeName,
            store_type: storeType,
            setup_completed: setupCompleted ?? true,
        };

        let query;
        if (id) {
            // Update existing
            query = supabase
                .from('store_settings')
                .update(payload)
                .eq('id', id);
        } else {
            // Check if one exists first to prevent duplicates in single-tenant enforcement
            const { data: existing } = await supabase
                .from('store_settings')
                .select('id')
                .single();

            if (existing) {
                query = supabase
                    .from('store_settings')
                    .update(payload)
                    .eq('id', existing.id);
            } else {
                // Insert new
                query = supabase
                    .from('store_settings')
                    .insert(payload);
            }
        }

        const { data, error } = await query.select().single();

        if (error) {
            console.error('Error saving store settings:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        revalidatePath('/');
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
