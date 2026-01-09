import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

export async function POST() {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            console.error('[Setup/Complete] Unauthorized - no userId');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[Setup/Complete] Completing setup for user:', userId);

        const supabase = await createClient();

        // Get the settings for this user
        const { data: settings, error: fetchError } = await supabase
            .from('bot_settings')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (fetchError || !settings) {
            console.error('[Setup/Complete] Settings not found for user:', userId, fetchError);

            // If settings don't exist, create them with setup completed
            const { data: newSettings, error: insertError } = await supabase
                .from('bot_settings')
                .insert({
                    user_id: userId,
                    bot_name: 'Assistant',
                    bot_tone: 'helpful and professional',
                    is_setup_completed: true,
                    setup_step: 5,
                })
                .select('id')
                .single();

            if (insertError) {
                console.error('[Setup/Complete] Failed to create settings:', insertError);
                return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 });
            }

            console.log('[Setup/Complete] Created new settings with setup completed:', newSettings?.id);
            return NextResponse.json({ success: true });
        }

        const { error } = await supabase
            .from('bot_settings')
            .update({
                is_setup_completed: true,
                setup_step: 5 // Ensure max step
            })
            .eq('id', settings.id)
            .eq('user_id', userId);

        if (error) {
            console.error('[Setup/Complete] Error updating setup:', error);
            return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 });
        }

        console.log('[Setup/Complete] Successfully completed setup for user:', userId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Setup/Complete] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
