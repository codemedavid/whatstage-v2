'use server';

import { NextResponse } from 'next/server';
import { getRealEstateMetrics } from '@/app/lib/dashboardData';

export async function GET() {
    try {
        const metrics = await getRealEstateMetrics();
        return NextResponse.json(metrics);
    } catch (error) {
        console.error('Error fetching real estate metrics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch real estate metrics' },
            { status: 500 }
        );
    }
}
