import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserIdFromPageId } from '@/app/lib/supabaseAdmin';
import { sendCancellationConfirmation } from '@/app/api/webhook/facebookClient';

// POST - Request appointment cancellation (sends confirmation to Messenger)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { appointment_id, sender_psid, page_id } = body;

        if (!appointment_id) {
            return NextResponse.json(
                { error: 'Appointment ID is required' },
                { status: 400 }
            );
        }

        if (!page_id) {
            return NextResponse.json(
                { error: 'Page ID is required' },
                { status: 400 }
            );
        }

        // Resolve user_id from page_id
        const userId = await getUserIdFromPageId(page_id);
        if (!userId) {
            return NextResponse.json(
                { error: 'Invalid page ID - page not found or inactive' },
                { status: 400 }
            );
        }

        // Fetch the appointment details - must belong to resolved user
        const { data: appointment, error: fetchError } = await supabaseAdmin
            .from('appointments')
            .select('*')
            .eq('id', appointment_id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !appointment) {
            return NextResponse.json(
                { error: 'Appointment not found' },
                { status: 404 }
            );
        }

        // Verify the sender_psid matches the appointment owner
        if (appointment.sender_psid !== sender_psid) {
            return NextResponse.json(
                { error: 'Unauthorized: This appointment does not belong to you' },
                { status: 403 }
            );
        }

        // Check if appointment is already cancelled
        if (appointment.status === 'cancelled') {
            return NextResponse.json(
                { error: 'Appointment is already cancelled' },
                { status: 400 }
            );
        }

        // Format the date and time for the message
        const [year, month, day] = appointment.appointment_date.split('-').map(Number);
        const aptDate = new Date(year, month - 1, day);
        const formattedDate = aptDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });

        // Format time (HH:mm:ss -> h:mm AM/PM)
        const [hours, minutes] = appointment.start_time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        const formattedTime = `${displayHour}:${minutes} ${ampm}`;

        // Send confirmation request to Messenger
        const sent = await sendCancellationConfirmation(
            sender_psid,
            appointment_id,
            formattedDate,
            formattedTime,
            page_id
        );

        if (!sent) {
            return NextResponse.json(
                { error: 'Failed to send confirmation to Messenger. Please try again.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Confirmation request sent to Messenger. Please check your messages.',
            appointment_id
        });

    } catch (error) {
        console.error('Cancel request error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

