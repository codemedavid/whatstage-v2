
import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - List all properties
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const activeOnly = searchParams.get('activeOnly') === 'true';

        let query = supabase
            .from('properties')
            .select('*')
            .order('created_at', { ascending: false });

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching properties:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create new property
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            title, description, price, currency, address,
            bedrooms, bathrooms, sqft, status, imageUrl, imageUrls, isActive,
            // New fields
            propertyType, yearBuilt, lotArea, garageSpaces,
            downPayment, monthlyAmortization, paymentTerms
        } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Handle image URLs - support both single and multiple
        const finalImageUrls = imageUrls || (imageUrl ? [imageUrl] : []);
        const primaryImage = finalImageUrls.length > 0 ? finalImageUrls[0] : null;

        const { data, error } = await supabase
            .from('properties')
            .insert({
                title,
                description: description || null,
                price: price || null,
                currency: currency || 'PHP',
                address: address || null,
                bedrooms: bedrooms || null,
                bathrooms: bathrooms || null,
                sqft: sqft || null,
                status: status || 'for_sale',
                image_url: primaryImage,
                image_urls: finalImageUrls,
                is_active: isActive ?? true,
                // Map camelCase to snake_case
                property_type: propertyType || null,
                year_built: yearBuilt || null,
                lot_area: lotArea || null,
                garage_spaces: garageSpaces || null,
                down_payment: downPayment || null,
                monthly_amortization: monthlyAmortization || null,
                payment_terms: paymentTerms || null,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating property:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update property
export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
        }

        // Map camelCase to snake_case for DB
        const dbUpdates: any = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.price !== undefined) dbUpdates.price = updates.price;
        if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
        if (updates.address !== undefined) dbUpdates.address = updates.address;
        if (updates.bedrooms !== undefined) dbUpdates.bedrooms = updates.bedrooms;
        if (updates.bathrooms !== undefined) dbUpdates.bathrooms = updates.bathrooms;
        if (updates.sqft !== undefined) dbUpdates.sqft = updates.sqft;
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

        // Handle image URLs - support both single and multiple
        if (updates.imageUrls !== undefined) {
            dbUpdates.image_urls = updates.imageUrls;
            dbUpdates.image_url = updates.imageUrls.length > 0 ? updates.imageUrls[0] : null;
        } else if (updates.imageUrl !== undefined) {
            dbUpdates.image_url = updates.imageUrl;
        }

        // New fields mapping
        if (updates.propertyType !== undefined) dbUpdates.property_type = updates.propertyType;
        if (updates.yearBuilt !== undefined) dbUpdates.year_built = updates.yearBuilt;
        if (updates.lotArea !== undefined) dbUpdates.lot_area = updates.lotArea;
        if (updates.garageSpaces !== undefined) dbUpdates.garage_spaces = updates.garageSpaces;
        if (updates.downPayment !== undefined) dbUpdates.down_payment = updates.downPayment;
        if (updates.monthlyAmortization !== undefined) dbUpdates.monthly_amortization = updates.monthlyAmortization;
        if (updates.paymentTerms !== undefined) dbUpdates.payment_terms = updates.paymentTerms;


        const { data, error } = await supabase
            .from('properties')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating property:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete property
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('properties')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting property:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
