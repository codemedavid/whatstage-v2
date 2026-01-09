import { supabase } from './supabase';
import { supabaseAdmin } from './supabaseAdmin';

// Cache configuration - now keyed by userId for multi-tenancy
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 1000; // Limit cache size to prevent unbounded growth

/** Simple LRU cache with max entries and TTL-based eviction */
class LRUCache<T> {
    private cache = new Map<string, { value: T; timestamp: number }>();
    private maxEntries: number;
    private ttlMs: number;

    constructor(maxEntries: number, ttlMs: number) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        const now = Date.now();
        // Check if expired
        if (now - entry.timestamp >= this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        // Move to end (most recently used) by re-inserting
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }

    set(key: string, value: T): void {
        // Delete existing to update position
        this.cache.delete(key);

        // Evict oldest entries if at capacity
        while (this.cache.size >= this.maxEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            } else {
                break;
            }
        }

        this.cache.set(key, { value, timestamp: Date.now() });
    }

    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    /** Remove all expired entries */
    prune(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp >= this.ttlMs) {
                this.cache.delete(key);
            }
        }
    }
}

// Bounded LRU cache for catalog context by user
const catalogCacheByUser = new LRUCache<{ context: string; timestamp: number }>(MAX_CACHE_ENTRIES, CACHE_DURATION_MS);

// Periodic cleanup timer to prune stale entries (every 10 minutes)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        catalogCacheByUser.prune();
    }, 10 * 60 * 1000);
}

interface ProductWithVariations {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    is_active: boolean;
    category: { id: string; name: string; color: string } | null;
    variations?: {
        id: string;
        value: string;
        price: number;
        variation_type: { id: string; name: string } | null;
    }[];
}

interface Property {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    status: string;
    property_type: string | null;
    year_built: number | null;
    lot_area: number | null;
    garage_spaces: number | null;
    down_payment: number | null;
    monthly_amortization: number | null;
    payment_terms: string | null;
    is_active: boolean;
}

interface PaymentMethod {
    id: string;
    name: string;
    account_name: string | null;
    account_number: string | null;
    instructions: string | null;
    is_active: boolean;
}

interface DigitalProduct {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    price: number | null;
    is_active: boolean;
    payment_type: 'one_time' | 'monthly' | null;
    billing_interval_months: number | null;
}

/**
 * Fetch products with their variations and format as text context
 * @param userId - Optional user ID to filter products for a specific user
 */
async function getProductContext(userId?: string): Promise<string> {
    try {
        // Use supabaseAdmin with user filter when userId provided
        const dbClient = userId ? supabaseAdmin : supabase;
        let query = dbClient
            .from('products')
            .select(`
                id, name, description, price, currency, image_url, is_active,
                category:product_categories(id, name, color)
            `)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        // Fetch products with category
        const { data: products, error: productsError } = await query;

        if (productsError || !products || products.length === 0) {
            console.log('[ProductRAG] No products found');
            return '';
        }

        // Fetch all variations for these products
        const productIds = products.map(p => p.id);
        const { data: variations, error: variationsError } = await supabase
            .from('product_variations')
            .select(`
                id, product_id, value, price, is_active,
                variation_type:product_variation_types(id, name)
            `)
            .in('product_id', productIds)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (variationsError) {
            console.error('[ProductRAG] Error fetching variations:', variationsError);
        }

        // Group variations by product
        const variationsByProduct: Record<string, typeof variations> = {};
        if (variations) {
            for (const v of variations) {
                const pid = v.product_id;
                if (!variationsByProduct[pid]) {
                    variationsByProduct[pid] = [];
                }
                variationsByProduct[pid].push(v);
            }
        }

        // Build formatted text
        let context = 'PRODUCT CATALOG:\n';
        context += 'NOTE: Use [RECOMMEND_PRODUCT:id] with the product_id to show a specific product card.\n';

        products.forEach((product, index: number) => {
            const priceStr = product.price
                ? `₱${product.price.toLocaleString('en-PH')}`
                : 'Price varies';

            context += `\n${index + 1}. ${product.name} - ${priceStr}`;
            context += `\n   product_id: ${product.id}`;  // Add ID for AI to use

            const category = Array.isArray(product.category) ? product.category[0] : product.category;
            if (category?.name) {
                context += `\n   Category: ${category.name}`;
            }

            if (product.description) {
                context += `\n   Description: ${product.description}`;
            }

            // Add variations
            const productVariations = variationsByProduct[product.id];
            if (productVariations && productVariations.length > 0) {
                context += `\n   Available Options:`;

                // Group by variation type
                const byType: Record<string, { value: string; price: number }[]> = {};
                for (const v of productVariations) {
                    const varType = Array.isArray(v.variation_type) ? v.variation_type[0] : v.variation_type;
                    const typeName = varType?.name || 'Option';
                    if (!byType[typeName]) {
                        byType[typeName] = [];
                    }
                    byType[typeName].push({ value: v.value, price: v.price });
                }

                for (const [typeName, options] of Object.entries(byType)) {
                    const optionsStr = options
                        .map(o => `${o.value}: ₱${o.price.toLocaleString('en-PH')}`)
                        .join(', ');
                    context += `\n   - ${typeName}: ${optionsStr}`;
                }
            }
        });

        console.log(`[ProductRAG] Built context for ${products.length} products`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building product context:', error);
        return '';
    }
}

/**
 * Fetch properties and format as text context
 * @param userId - Optional user ID to filter properties for a specific user
 */
async function getPropertyContext(userId?: string): Promise<string> {
    try {
        const dbClient = userId ? supabaseAdmin : supabase;
        let query = dbClient
            .from('properties')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: properties, error } = await query;

        if (error || !properties || properties.length === 0) {
            console.log('[ProductRAG] No properties found');
            return '';
        }

        let context = 'PROPERTY LISTINGS:\n';
        context += 'NOTE: Use [RECOMMEND_PROPERTY:id] with the property_id to show a specific property card.\n';

        properties.forEach((prop: Property, index: number) => {
            const priceStr = prop.price
                ? `₱${prop.price.toLocaleString('en-PH')}`
                : 'Price on request';

            context += `\n${index + 1}. ${prop.title} - ${priceStr}`;
            context += `\n   property_id: ${prop.id}`;  // Add ID for AI to use

            if (prop.property_type) {
                context += `\n   Type: ${prop.property_type}`;
            }

            if (prop.address) {
                context += `\n   Location: ${prop.address}`;
            }

            // Build details string
            const details: string[] = [];
            if (prop.bedrooms) details.push(`${prop.bedrooms} Bedroom${prop.bedrooms > 1 ? 's' : ''}`);
            if (prop.bathrooms) details.push(`${prop.bathrooms} Bathroom${prop.bathrooms > 1 ? 's' : ''}`);
            if (prop.sqft) details.push(`${prop.sqft.toLocaleString()} sqm`);
            if (prop.lot_area) details.push(`Lot: ${prop.lot_area.toLocaleString()} sqm`);
            if (prop.garage_spaces) details.push(`${prop.garage_spaces} Garage`);
            if (prop.year_built) details.push(`Built: ${prop.year_built}`);

            if (details.length > 0) {
                context += `\n   Details: ${details.join(', ')}`;
            }

            if (prop.status) {
                const statusDisplay = prop.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                context += `\n   Status: ${statusDisplay}`;
            }

            // Payment terms
            if (prop.down_payment || prop.monthly_amortization) {
                context += `\n   Payment Terms:`;
                if (prop.down_payment) {
                    context += ` Down Payment: ₱${prop.down_payment.toLocaleString('en-PH')}`;
                }
                if (prop.monthly_amortization) {
                    context += ` Monthly: ₱${prop.monthly_amortization.toLocaleString('en-PH')}`;
                }
                if (prop.payment_terms) {
                    context += ` (${prop.payment_terms})`;
                }
            }

            if (prop.description) {
                // Truncate long descriptions
                const desc = prop.description.length > 150
                    ? prop.description.substring(0, 150) + '...'
                    : prop.description;
                context += `\n   About: ${desc}`;
            }
        });

        console.log(`[ProductRAG] Built context for ${properties.length} properties`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building property context:', error);
        return '';
    }
}

/**
 * Fetch payment methods and format as text context
 */
async function getPaymentMethodContext(userId?: string): Promise<string> {
    try {
        const dbClient = userId ? supabaseAdmin : supabase;
        let query = dbClient
            .from('payment_methods')
            .select('id, name, account_name, account_number, instructions, is_active')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: methods, error } = await query;

        if (error || !methods || methods.length === 0) {
            console.log('[ProductRAG] No payment methods found');
            return '';
        }

        let context = 'PAYMENT METHODS:\n';

        methods.forEach((pm: PaymentMethod, index: number) => {
            context += `\n${index + 1}. ${pm.name}`;
            if (pm.account_name) {
                context += `\n   Account Name: ${pm.account_name}`;
            }
            if (pm.account_number) {
                context += `\n   Account/Number: ${pm.account_number}`;
            }
            if (pm.instructions) {
                context += `\n   Instructions: ${pm.instructions}`;
            }
        });

        console.log(`[ProductRAG] Built context for ${methods.length} payment methods`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building payment method context:', error);
        return '';
    }
}

/**
 * Fetch digital products and format as text context
 */
async function getDigitalProductContext(userId?: string): Promise<string> {
    try {
        const dbClient = userId ? supabaseAdmin : supabase;
        let query = dbClient
            .from('digital_products')
            .select('id, title, description, short_description, price, is_active, payment_type, billing_interval_months')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: products, error } = await query;

        if (error || !products || products.length === 0) {
            console.log('[ProductRAG] No digital products found');
            return '';
        }

        let context = 'DIGITAL PRODUCT CATALOG:\n';
        context += 'NOTE: Use [RECOMMEND_DIGITAL_PRODUCT:id] with the digital_product_id to show a specific digital product card.\n';

        products.forEach((product: DigitalProduct, index: number) => {
            let priceStr = product.price
                ? `₱${product.price.toLocaleString('en-PH')}`
                : 'Price on request';

            // Add payment type indicator
            if (product.payment_type === 'monthly') {
                const interval = product.billing_interval_months || 1;
                priceStr += interval === 1 ? '/month' : `/every ${interval} months`;
            } else if (product.payment_type === 'one_time') {
                priceStr += ' (one-time)';
            }

            context += `\n${index + 1}. ${product.title} - ${priceStr}`;
            context += `\n   digital_product_id: ${product.id}`;  // Add ID for AI to use

            if (product.short_description) {
                context += `\n   Summary: ${product.short_description}`;
            }

            if (product.description) {
                // Truncate long descriptions
                const desc = product.description.length > 150
                    ? product.description.substring(0, 150) + '...'
                    : product.description;
                context += `\n   About: ${desc}`;
            }
        });

        console.log(`[ProductRAG] Built context for ${products.length} digital products`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building digital product context:', error);
        return '';
    }
}

/**
 * Get combined catalog context for AI with caching
 * Includes products, properties, and payment methods
 * @param userId - Optional user ID to get context for a specific user
 */
export async function getCatalogContext(userId?: string): Promise<string> {
    const cacheKey = userId || 'global';

    // Check cache for this specific user (LRU cache handles TTL internally)
    const cached = catalogCacheByUser.get(cacheKey);
    if (cached) {
        // console.log(`[ProductRAG] Using cached catalog context for ${cacheKey}`);
        return cached.context;
    }

    console.log(`[ProductRAG] Building fresh catalog context for ${cacheKey}...`);

    // Fetch all contexts in parallel with userId
    const [productContext, propertyContext, paymentContext, digitalProductContext] = await Promise.all([
        getProductContext(userId),
        getPropertyContext(userId),
        getPaymentMethodContext(userId),
        getDigitalProductContext(userId),
    ]);

    // Combine contexts
    const parts: string[] = [];

    if (productContext) {
        parts.push(productContext);
    }

    if (propertyContext) {
        parts.push(propertyContext);
    }

    if (digitalProductContext) {
        parts.push(digitalProductContext);
    }

    if (paymentContext) {
        parts.push(paymentContext);
    }

    if (parts.length === 0) {
        return '';
    }

    const combinedContext = parts.join('\n\n');

    // Cache the result for this user (LRU cache handles timestamp internally)
    catalogCacheByUser.set(cacheKey, {
        context: combinedContext,
        timestamp: Date.now()
    });

    console.log(`[ProductRAG] Catalog context built user:${cacheKey} (${combinedContext.length} chars)`);
    return combinedContext;
}

/**
 * Invalidate the catalog cache (call when products/properties are updated)
 * @param userId - Optional user ID to only invalidate that user's cache
 */
export function invalidateCatalogCache(userId?: string): void {
    if (userId) {
        catalogCacheByUser.delete(userId);
        console.log(`[ProductRAG] Cache invalidated for user: ${userId}`);
    } else {
        catalogCacheByUser.clear();
        console.log('[ProductRAG] All cache invalidated');
    }
}
