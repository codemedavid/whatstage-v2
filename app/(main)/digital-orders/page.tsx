import { getDigitalProductOrders } from '@/app/lib/digitalOrderService';
import DigitalOrdersClient from './DigitalOrdersClient';

export const dynamic = 'force-dynamic';

export default async function DigitalOrdersPage() {
    // Fetch orders on the server
    let orders: Awaited<ReturnType<typeof getDigitalProductOrders>> = [];

    try {
        orders = await getDigitalProductOrders();
    } catch (error) {
        console.error('Failed to fetch digital orders:', error);
    }

    return <DigitalOrdersClient initialOrders={orders} />;
}
