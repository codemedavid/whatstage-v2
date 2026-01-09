import { Metadata } from 'next';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import PropertyDetailClient from './PropertyDetailClient';
import { Building } from 'lucide-react';
import Link from 'next/link';

interface Property {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    status: 'for_sale' | 'for_rent' | 'sold' | 'rented';
    image_url: string | null;
    is_active: boolean;
    property_type: string | null;
    year_built: number | null;
    lot_area: number | null;
    garage_spaces: number | null;
    down_payment: number | null;
    monthly_amortization: number | null;
    payment_terms: string | null;
}

// Fetch property data (public access allowed for active properties)
async function getProperty(id: string): Promise<Property | null> {
    const { data, error } = await supabaseAdmin
        .from('properties')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

    if (error || !data) {
        return null;
    }

    return data as Property;
}

// Fetch related properties from the same owner
async function getRelatedProperties(propertyId: string, userId: string): Promise<Property[]> {
    const { data, error } = await supabaseAdmin
        .from('properties')
        .select('*')
        .neq('id', propertyId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(3);

    if (error || !data) {
        return [];
    }

    return data as Property[];
}

// Fetch connected Facebook page for the property owner
async function getFacebookPageId(userId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('connected_pages')
        .select('page_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single();

    if (error || !data) {
        return null;
    }

    return data.page_id;
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const property = await getProperty(id);

    if (!property) {
        return {
            title: 'Property Not Found',
        };
    }

    const formatPrice = (price: number | null) => {
        if (price === null) return 'Price on Request';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
    };

    const description = property.description ||
        `${property.title} - ${formatPrice(property.price)}${property.bedrooms ? ` | ${property.bedrooms} BR` : ''}${property.bathrooms ? ` | ${property.bathrooms} Bath` : ''}`;

    return {
        title: property.title,
        description,
        openGraph: {
            title: property.title,
            description,
            images: property.image_url ? [property.image_url] : [],
        },
    };
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch property first
    const property = await getProperty(id);

    if (!property) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center flex-col">
                <Building className="text-gray-300 mb-4" size={64} />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Property not found</h2>
                <Link href="/store" className="mt-4 px-6 py-2 bg-emerald-500 text-white rounded-full">
                    Back to Listings
                </Link>
            </div>
        );
    }

    // Fetch related properties and Facebook page for the property owner in parallel
    const [relatedProperties, facebookPageId] = await Promise.all([
        getRelatedProperties(property.id, property.user_id),
        getFacebookPageId(property.user_id),
    ]);

    return (
        <PropertyDetailClient
            property={property}
            relatedProperties={relatedProperties}
            facebookPageId={facebookPageId}
        />
    );
}

