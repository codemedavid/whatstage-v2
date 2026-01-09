import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

// Payment method type
export interface PaymentMethod {
    id: string;
    name: string;
    account_name: string | null;
    account_number: string | null;
    qr_code_url: string | null;
    instructions: string | null;
    is_active: boolean;
}

// Product type
export interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    image_url: string | null;
    is_active: boolean;
}

export interface Property {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    image_url: string | null;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    status: string;
    is_active: boolean;
}

// Fetch active products from database
// userId parameter is used to filter products for a specific user
export async function getProducts(userId?: string): Promise<Product[]> {
    try {
        let query = supabaseAdmin
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .limit(10); // Limit to 10 for carousel

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error || !data) {
            console.log('No products found or error:', error);
            return [];
        }

        return data;
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

// Fetch active properties from database
export async function getProperties(userId?: string): Promise<Property[]> {
    try {
        let query = supabaseAdmin
            .from('properties')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(10); // Limit to 10 for carousel

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error || !data) {
            console.log('No properties found or error:', error);
            return [];
        }

        return data;
    } catch (error) {
        console.error('Error fetching properties:', error);
        return [];
    }
}


// Fetch active payment methods from database
export async function getPaymentMethods(userId?: string): Promise<PaymentMethod[]> {
    try {
        let query = supabaseAdmin
            .from('payment_methods')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error || !data) {
            console.log('No payment methods found or error:', error);
            return [];
        }

        return data;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return [];
    }
}

// Fetch a single product by ID with its variations count
export async function getProductById(productId: string, userId?: string): Promise<{ product: Product | null; hasVariations: boolean }> {
    try {
        let query = supabaseAdmin
            .from('products')
            .select('*')
            .eq('id', productId);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: product, error: productError } = await query.single();

        if (productError || !product) {
            return { product: null, hasVariations: false };
        }

        // Check if product has variations
        let variationsQuery = supabaseAdmin
            .from('product_variations')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', productId);

        const { count, error: variationsError } = await variationsQuery;

        if (variationsError) {
            console.error('Error checking variations:', variationsError);
            return { product, hasVariations: false };
        }

        return { product, hasVariations: (count || 0) > 0 };
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        return { product: null, hasVariations: false };
    }
}

// Fetch a single property by ID
export async function getPropertyById(propertyId: string, userId?: string): Promise<Property | null> {
    try {
        let query = supabaseAdmin
            .from('properties')
            .select('*')
            .eq('id', propertyId);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: property, error } = await query.single();

        if (error || !property) {
            console.log('Property not found:', propertyId, error);
            return null;
        }

        return property;
    } catch (error) {
        console.error('Error fetching property by ID:', error);
        return null;
    }
}

// Digital Product type
export interface DigitalProduct {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    price: number | null;
    thumbnail_url: string | null;
    is_active: boolean;
    payment_type: 'one_time' | 'monthly' | null;
    billing_interval_months: number | null;
}

// Fetch active digital products from database
export async function getDigitalProducts(userId?: string): Promise<DigitalProduct[]> {
    try {
        let query = supabaseAdmin
            .from('digital_products')
            .select(`
                id,
                title,
                description,
                short_description,
                price,
                thumbnail_url,
                is_active,
                payment_type,
                billing_interval_months,
                media:digital_product_media(media_url, thumbnail_url)
            `)
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .limit(10); // Limit to 10 for carousel

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error || !data) {
            console.log('No digital products found or error:', error);
            return [];
        }

        // Use dedicated thumbnail_url from digital_products, fallback to first media item
        return data.map(product => ({
            ...product,
            thumbnail_url: product.thumbnail_url || product.media?.[0]?.thumbnail_url || product.media?.[0]?.media_url || null,
        }));
    } catch (error) {
        console.error('Error fetching digital products:', error);
        return [];
    }
}

// Fetch a single digital product by ID
export async function getDigitalProductById(productId: string, userId?: string): Promise<DigitalProduct | null> {
    try {
        let query = supabaseAdmin
            .from('digital_products')
            .select(`
                id,
                title,
                description,
                short_description,
                price,
                thumbnail_url,
                is_active,
                payment_type,
                billing_interval_months,
                media:digital_product_media(media_url, thumbnail_url)
            `)
            .eq('id', productId);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: product, error } = await query.single();

        if (error || !product) {
            console.log('Digital product not found:', productId, error);
            return null;
        }

        // Use dedicated thumbnail_url from digital_products, fallback to first media item
        return {
            ...product,
            thumbnail_url: product.thumbnail_url || product.media?.[0]?.thumbnail_url || product.media?.[0]?.media_url || null,
        };
    } catch (error) {
        console.error('Error fetching digital product by ID:', error);
        return null;
    }
}
