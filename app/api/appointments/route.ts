import { NextRequest, NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';
import { supabaseAdmin, getUserIdFromPageId } from '@/app/lib/supabaseAdmin';

// GET - List appointments (optionally filter by sender_psid or date)
export async function GET(request: NextRequest) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const senderPsid = searchParams.get('sender_psid');
        const date = searchParams.get('date');
        const status = searchParams.get('status');

        let query = supabase
            .from('appointments')
            .select('*, properties(title, address)')
            .eq('user_id', userId)
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (senderPsid) {
            query = query.eq('sender_psid', senderPsid);
        }

        if (date) {
            query = query.eq('appointment_date', date);
        }

        if (status) {
            query = query.eq('status', status);
        } else {
            // By default, exclude cancelled appointments
            query = query.neq('status', 'cancelled');
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching appointments:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Appointments GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Create a new appointment
// Supports both authenticated requests (from dashboard) and public requests (from booking page with page_id)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            sender_psid,
            customer_name,
            customer_email,
            customer_phone,
            appointment_date,
            start_time,
            end_time,
            notes,
            page_id,
            property_id
        } = body;

        // Try authenticated user first, then fall back to page_id resolution
        let userId = await getCurrentUserId();

        if (!userId && page_id) {
            // Public booking - resolve from page_id
            userId = await getUserIdFromPageId(page_id);
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized - missing authentication or valid page_id' }, { status: 401 });
        }

        // Validate required fields
        if (!appointment_date || !start_time || !end_time) {
            return NextResponse.json(
                { error: 'Missing required fields: appointment_date, start_time, end_time' },
                { status: 400 }
            );
        }

        // If sender_psid is not provided, generate a placeholder one for non-messenger bookings
        const actualPsid = sender_psid || `web_booking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Check if the slot is available for this user
        const { data: existingAppointments, error: checkError } = await supabaseAdmin
            .from('appointments')
            .select('id')
            .eq('user_id', userId)
            .eq('appointment_date', appointment_date)
            .eq('start_time', start_time)
            .neq('status', 'cancelled')
            .limit(1);

        if (checkError) {
            console.error('Error checking slot availability:', checkError);
            return NextResponse.json({ error: checkError.message }, { status: 500 });
        }

        if (existingAppointments && existingAppointments.length > 0) {
            return NextResponse.json(
                { error: 'This time slot is no longer available' },
                { status: 409 }
            );
        }

        // Fetch Facebook Profile Name from Leads table (captured during initial contact)
        let facebookName = null;
        if (sender_psid) {
            try {
                const { data: lead } = await supabaseAdmin
                    .from('leads')
                    .select('name')
                    .eq('sender_id', sender_psid)
                    .eq('user_id', userId)
                    .single();

                if (lead && lead.name) {
                    facebookName = lead.name;
                }
            } catch (err) {
                console.error('Error fetching name from leads table:', err);
            }
        }

        const { data, error } = await supabaseAdmin
            .from('appointments')
            .insert([{
                user_id: userId,
                sender_psid: actualPsid,
                customer_name: customer_name || facebookName,
                facebook_name: facebookName,
                customer_email,
                customer_phone,
                appointment_date,
                start_time,
                end_time,
                notes,
                page_id,
                property_id,
                status: 'confirmed'
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating appointment:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Track appointment booking activity and update pipeline
        try {
            const { trackActivity } = await import('@/app/lib/activityTrackingService');
            const { moveLeadToAppointmentStage } = await import('@/app/lib/pipelineService');
            const { generateConversationSummary } = await import('@/app/lib/chatService');

            // Track the activity
            await trackActivity(actualPsid, 'appointment_booked', data.id, 'Appointment', {
                appointment_date,
                start_time,
                end_time,
                customer_name: customer_name || facebookName,
            });

            // Move lead to "Appointment Scheduled" stage
            await moveLeadToAppointmentStage(actualPsid, {
                appointmentId: data.id,
                appointmentDate: appointment_date,
                startTime: start_time,
            }, userId);

            // Trigger appointment-based workflows
            const { triggerWorkflowsForAppointment } = await import('@/app/lib/workflowEngine');
            await triggerWorkflowsForAppointment(data.id, actualPsid, appointment_date, start_time, userId);

            // Trigger milestone summary generation (fire and forget)
            generateConversationSummary(actualPsid).catch(err => {
                console.error('[MilestoneSummary] Error generating post-appointment summary:', err);
            });
        } catch (activityError) {
            console.error('Error tracking appointment activity:', activityError);
            // Don't fail the booking if activity tracking fails
        }

        // Send confirmation to Messenger
        console.log('Messenger confirmation check:', { page_id, sender_psid, hasPageId: !!page_id, hasSenderPsid: !!sender_psid });
        if (page_id && sender_psid) {
            // Import dynamically to avoid circular dependencies
            const { callSendAPI } = await import('../webhook/facebookClient');

            // Parse date string and format with GMT+8 timezone (Asia/Manila)
            const [year, month, day] = appointment_date.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day, 12, 0, 0);

            const formattedDate = dateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                timeZone: 'Asia/Manila'
            });

            // Format time (HH:mm:ss -> h:mm AM/PM)
            const [hours, minutes] = start_time.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            const formattedTime = `${displayHour}:${minutes} ${ampm}`;

            // Build confirmation message - include property info if this is a tripping
            let confirmationMessage = `✅ Appointment Confirmed!\n\n`;

            if (property_id) {
                // Fetch property details for the confirmation message
                const { data: propertyData } = await supabaseAdmin
                    .from('properties')
                    .select('title, address')
                    .eq('id', property_id)
                    .eq('user_id', userId)
                    .single();

                if (propertyData) {
                    confirmationMessage += `🏠 Property Viewing: ${propertyData.title}\n`;
                    if (propertyData.address) {
                        confirmationMessage += `📍 ${propertyData.address}\n`;
                    }
                    confirmationMessage += `\n`;
                }
            }

            confirmationMessage += `📅 ${formattedDate} at ${formattedTime}\n\nSee you then!`;

            await callSendAPI(sender_psid, {
                text: confirmationMessage
            }, page_id);
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Appointments POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Cancel an appointment
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const reason = searchParams.get('reason');

        if (!id) {
            return NextResponse.json({ error: 'Appointment ID is required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('appointments')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_reason: reason || 'User cancelled'
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error cancelling appointment:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Appointments DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
