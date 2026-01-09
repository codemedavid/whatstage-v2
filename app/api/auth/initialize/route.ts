import { NextResponse } from 'next/server';
import { initializeNewUser } from '@/app/lib/supabaseAdmin';

/**
 * POST /api/auth/initialize
 * Initialize default data for a new user after signup
 * 
 * This creates:
 * - Default pipeline stages (New Lead, Interested, Qualified, Negotiating, Won, Lost)
 * - Default bot settings
 * - Default knowledge categories
 * - Default follow-up settings
 * - Default appointment settings
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId } = body;

        if (!userId) {
            return NextResponse.json(
                { error: 'userId is required' },
                { status: 400 }
            );
        }

        console.log(`[Auth/Initialize] Initializing new user: ${userId}`);

        const success = await initializeNewUser(userId);

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to initialize user data' },
                { status: 500 }
            );
        }

        console.log(`[Auth/Initialize] Successfully initialized user: ${userId}`);

        return NextResponse.json({
            success: true,
            message: 'User initialized with default data'
        });

    } catch (error) {
        console.error('[Auth/Initialize] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
