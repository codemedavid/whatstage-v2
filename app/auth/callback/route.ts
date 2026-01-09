import { createClient } from '@/app/lib/supabaseServer';
import { NextResponse } from 'next/server';

/**
 * GET /auth/callback
 * Handles the OAuth/email confirmation callback from Supabase
 * This is where users land after clicking the email confirmation link
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.user) {
            // Check if this is a new user (just confirmed email) and initialize them
            // We can tell by checking if they have any pipeline stages yet
            const { data: stages } = await supabase
                .from('pipeline_stages')
                .select('id')
                .eq('user_id', data.user.id)
                .limit(1);

            if (!stages || stages.length === 0) {
                // New user - initialize their data with retry logic
                console.log(`[Auth/Callback] New user detected, initializing: ${data.user.id}`);

                const MAX_RETRIES = 3;
                const BACKOFF_MS = [500, 1000, 2000];
                let initSuccess = false;

                for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                    try {
                        const response = await fetch(`${origin}/api/auth/initialize`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: data.user.id }),
                        });

                        if (response.ok) {
                            initSuccess = true;
                            console.log(`[Auth/Callback] Initialization succeeded on attempt ${attempt + 1}`);
                            break;
                        } else {
                            console.error(`[Auth/Callback] Initialization attempt ${attempt + 1} failed with status ${response.status}`);
                        }
                    } catch (err) {
                        console.error(`[Auth/Callback] Initialization attempt ${attempt + 1} error:`, err);
                    }

                    // Wait before retrying (unless last attempt)
                    if (attempt < MAX_RETRIES - 1) {
                        await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt]));
                    }
                }

                if (!initSuccess) {
                    console.error('[Auth/Callback] All initialization attempts failed, redirecting to error page');
                    return NextResponse.redirect(`${origin}/login?error=initialization_failed`);
                }
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    // Return to login with error if something went wrong
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
