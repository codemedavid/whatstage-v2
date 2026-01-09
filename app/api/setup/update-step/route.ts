import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';
import { createHash } from 'crypto';

/**
 * Anonymize a user ID for safe logging
 * Uses SHA-256 hash and returns only first 8 characters
 */
function anonymizeUserId(userId: string): string {
    return createHash('sha256').update(userId).digest('hex').substring(0, 8) + '...';
}

export async function POST(req: Request) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await req.json();
        const { step, data } = body;

        // Get the settings ID for this user
        const { data: settings, error: fetchError } = await supabase
            .from('bot_settings')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (fetchError || !settings) {
            console.error('Settings not found for user:', anonymizeUserId(userId), fetchError);
            return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
        }

        const updates: Record<string, unknown> = {
            setup_step: step,
            updated_at: new Date().toISOString(),
        };

        // Map step data to columns
        if (step === 1 && data) {
            // Business Info
            if (data.businessName) updates.business_name = data.businessName;
            if (data.businessDescription) updates.business_description = data.businessDescription;
        }

        if (step === 4 && data) {
            // Bot Goal - map to primary_goal column
            if (data.botGoal) {
                // Map display names to database values
                const goalMapping: Record<string, string> = {
                    'Lead Generation': 'lead_generation',
                    'Appointment Booking': 'appointment_booking',
                    'Tripping': 'tripping',
                    'Purchase': 'purchase',
                };
                updates.primary_goal = goalMapping[data.botGoal] || 'lead_generation';
            }
        }

        const { error } = await supabase
            .from('bot_settings')
            .update(updates)
            .eq('id', settings.id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error updating setup step:', error);
            return NextResponse.json({ error: 'Failed to update step' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error in setup update:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
