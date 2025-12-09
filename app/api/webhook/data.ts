import { supabase } from '@/app/lib/supabase';

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
export async function getProducts(): Promise<Product[]> {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .limit(10); // Limit to 10 for carousel

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
export async function getProperties(): Promise<Property[]> {
    try {
        const { data, error } = await supabase
            .from('properties')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(10); // Limit to 10 for carousel

        if (error || !data) {
            console.log('No properties found or error:', error);
            return [];
        }

        return data; // Supabase returns generic types, casting happens at consumption or strictly here if needed
    } catch (error) {
        console.error('Error fetching properties:', error);
        return [];
    }
}


// Fetch active payment methods from database
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

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
