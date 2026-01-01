import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { startOrRefreshTakeover } from '@/app/lib/humanTakeoverService';
import {
    sendProductCards,
    sendPropertyCards,
    sendDigitalProductCards,
    sendAppointmentCard,
    sendPaymentMethodCards,
} from '@/app/api/webhook/facebookClient';
import {
    getProducts,
    getProperties,
    getDigitalProducts,
    getPaymentMethods,
    getProductById,
    getPropertyById,
    getDigitalProductById,
} from '@/app/api/webhook/data';

export type CardType = 'products' | 'properties' | 'digital_products' | 'booking' | 'payment_methods';

/**
 * POST /api/leads/send-card
 * Send an interactive card to a customer during human takeover
 * 
 * Body: {
 *   senderId: string;          // Customer's Messenger PSID
 *   cardType: CardType;        // Type of card to send
 *   productId?: string;        // Optional: specific product ID
 *   propertyId?: string;       // Optional: specific property ID
 *   digitalProductId?: string; // Optional: specific digital product ID
 * }
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { senderId, cardType, productId, propertyId, digitalProductId } = body;

        if (!senderId || !cardType) {
            return NextResponse.json(
                { error: 'senderId and cardType are required' },
                { status: 400 }
            );
        }

        // Validate cardType
        const validCardTypes: CardType[] = ['products', 'properties', 'digital_products', 'booking', 'payment_methods'];
        if (!validCardTypes.includes(cardType)) {
            return NextResponse.json(
                { error: `Invalid cardType. Must be one of: ${validCardTypes.join(', ')}` },
                { status: 400 }
            );
        }

        // Fetch lead to get page_id
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, sender_id, page_id')
            .eq('sender_id', senderId)
            .single();

        if (leadError || !lead) {
            console.error('[SendCard] Lead not found:', leadError);
            return NextResponse.json(
                { error: 'Lead not found' },
                { status: 404 }
            );
        }

        // Start/refresh human takeover before sending the card
        console.log('[SendCard] Starting human takeover for:', senderId);
        await startOrRefreshTakeover(senderId);

        let success = false;
        let cardDescription = '';

        switch (cardType) {
            case 'products':
                if (productId) {
                    // Send specific product
                    const { product } = await getProductById(productId);
                    if (product) {
                        success = await sendProductCards(senderId, [product], lead.page_id);
                        cardDescription = `Product: ${product.name}`;
                    } else {
                        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
                    }
                } else {
                    // Send all products
                    const products = await getProducts();
                    if (products.length > 0) {
                        success = await sendProductCards(senderId, products, lead.page_id);
                        cardDescription = `${products.length} products`;
                    } else {
                        return NextResponse.json({ error: 'No active products available' }, { status: 404 });
                    }
                }
                break;

            case 'properties':
                if (propertyId) {
                    // Send specific property
                    const property = await getPropertyById(propertyId);
                    if (property) {
                        success = await sendPropertyCards(senderId, [property], lead.page_id);
                        cardDescription = `Property: ${property.title}`;
                    } else {
                        return NextResponse.json({ error: 'Property not found' }, { status: 404 });
                    }
                } else {
                    // Send all properties
                    const properties = await getProperties();
                    if (properties.length > 0) {
                        success = await sendPropertyCards(senderId, properties, lead.page_id);
                        cardDescription = `${properties.length} properties`;
                    } else {
                        return NextResponse.json({ error: 'No active properties available' }, { status: 404 });
                    }
                }
                break;

            case 'digital_products':
                if (digitalProductId) {
                    // Send specific digital product
                    const digitalProduct = await getDigitalProductById(digitalProductId);
                    if (digitalProduct) {
                        success = await sendDigitalProductCards(senderId, [digitalProduct], lead.page_id);
                        cardDescription = `Digital Product: ${digitalProduct.title}`;
                    } else {
                        return NextResponse.json({ error: 'Digital product not found' }, { status: 404 });
                    }
                } else {
                    // Send all digital products
                    const digitalProducts = await getDigitalProducts();
                    if (digitalProducts.length > 0) {
                        success = await sendDigitalProductCards(senderId, digitalProducts, lead.page_id);
                        cardDescription = `${digitalProducts.length} digital products`;
                    } else {
                        return NextResponse.json({ error: 'No active digital products available' }, { status: 404 });
                    }
                }
                break;

            case 'booking':
                success = await sendAppointmentCard(senderId, lead.page_id);
                cardDescription = 'Appointment booking card';
                break;

            case 'payment_methods':
                const paymentMethods = await getPaymentMethods();
                if (paymentMethods.length > 0) {
                    success = await sendPaymentMethodCards(senderId, paymentMethods, lead.page_id);
                    cardDescription = `${paymentMethods.length} payment methods`;
                } else {
                    return NextResponse.json({ error: 'No active payment methods available' }, { status: 404 });
                }
                break;
        }

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to send card to Messenger' },
                { status: 500 }
            );
        }

        // Optionally log this action in conversations table
        await supabase
            .from('conversations')
            .insert({
                sender_id: senderId,
                role: 'assistant',
                content: `[Agent sent ${cardDescription}]`,
            });

        console.log(`[SendCard] ✅ Sent ${cardType} card to ${senderId}`);

        return NextResponse.json({
            success: true,
            message: `Card sent: ${cardDescription}`,
            cardType,
            takeoverActive: true,
        });

    } catch (error) {
        console.error('[SendCard] Error:', error);
        return NextResponse.json(
            { error: 'Failed to send card' },
            { status: 500 }
        );
    }
}
