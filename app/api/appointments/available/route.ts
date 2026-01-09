import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserIdFromPageId } from '@/app/lib/supabaseAdmin';

interface AppointmentSettings {
    business_hours_start: string;
    business_hours_end: string;
    slot_duration_minutes: number;
    days_available: number[];
    booking_lead_time_hours: number;
    max_advance_booking_days: number;
    buffer_between_slots_minutes: number;
}

interface TimeSlot {
    start_time: string;
    end_time: string;
    available: boolean;
}

// Default settings if none exist in database
const defaultSettings: AppointmentSettings = {
    business_hours_start: '09:00:00',
    business_hours_end: '17:00:00',
    slot_duration_minutes: 60,
    days_available: [1, 2, 3, 4, 5],
    booking_lead_time_hours: 24,
    max_advance_booking_days: 30,
    buffer_between_slots_minutes: 0,
};

// Helper function to parse time string to minutes since midnight
function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// Helper function to convert minutes to time string
function minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
}

// GET - Get available time slots for a specific date
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const pageId = searchParams.get('pageId');

        if (!dateParam) {
            return NextResponse.json({ error: 'Date parameter is required (YYYY-MM-DD)' }, { status: 400 });
        }

        if (!pageId) {
            return NextResponse.json({ error: 'pageId parameter is required' }, { status: 400 });
        }

        // Resolve user_id from pageId
        const userId = await getUserIdFromPageId(pageId);
        if (!userId) {
            return NextResponse.json({ error: 'Invalid pageId - page not found or inactive' }, { status: 400 });
        }

        // Validate date format
        const requestedDate = new Date(dateParam);
        if (isNaN(requestedDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
        }

        // Get appointment settings for this specific user
        const { data: settingsData, error: settingsError } = await supabaseAdmin
            .from('appointment_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Use default settings if none exist for this user
        const settings: AppointmentSettings = (settingsError || !settingsData) ? defaultSettings : settingsData;

        // Check if the date is a disabled date for this user
        const { data: disabledDate } = await supabaseAdmin
            .from('appointment_disabled_dates')
            .select('id')
            .eq('user_id', userId)
            .eq('disabled_date', dateParam)
            .limit(1);

        if (disabledDate && disabledDate.length > 0) {
            return NextResponse.json({
                date: dateParam,
                available: false,
                reason: 'This date is not available for booking',
                slots: []
            });
        }

        // Check if the day of week is available
        const dayOfWeek = requestedDate.getDay();
        if (!settings.days_available.includes(dayOfWeek)) {
            return NextResponse.json({
                date: dateParam,
                available: false,
                reason: 'Appointments are not available on this day',
                slots: []
            });
        }

        // Check if the date is within booking window
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const leadTimeMs = settings.booking_lead_time_hours * 60 * 60 * 1000;
        const minBookingDate = new Date(now.getTime() + leadTimeMs);
        const maxBookingDate = new Date(today.getTime() + settings.max_advance_booking_days * 24 * 60 * 60 * 1000);

        if (requestedDate < today) {
            return NextResponse.json({
                date: dateParam,
                available: false,
                reason: 'Cannot book appointments in the past',
                slots: []
            });
        }

        if (requestedDate > maxBookingDate) {
            return NextResponse.json({
                date: dateParam,
                available: false,
                reason: `Appointments can only be booked up to ${settings.max_advance_booking_days} days in advance`,
                slots: []
            });
        }

        // Get existing appointments for this date and user
        const { data: existingAppointments, error: appointmentsError } = await supabaseAdmin
            .from('appointments')
            .select('start_time, end_time')
            .eq('user_id', userId)
            .eq('appointment_date', dateParam)
            .neq('status', 'cancelled');

        if (appointmentsError) {
            console.error('Error fetching appointments:', appointmentsError);
            return NextResponse.json({ error: 'Failed to check existing appointments' }, { status: 500 });
        }

        // Generate all possible time slots
        const startMinutes = timeToMinutes(settings.business_hours_start);
        const endMinutes = timeToMinutes(settings.business_hours_end);
        const slotDuration = settings.slot_duration_minutes;
        const buffer = settings.buffer_between_slots_minutes;

        const slots: TimeSlot[] = [];
        const bookedSlots = new Set(existingAppointments?.map(a => a.start_time) || []);

        for (let time = startMinutes; time + slotDuration <= endMinutes; time += slotDuration + buffer) {
            const slotStart = minutesToTime(time);
            const slotEnd = minutesToTime(time + slotDuration);

            // Check if this slot is in the past (for today)
            let isAvailable = !bookedSlots.has(slotStart);

            // Compare using the dateParam string directly (already in YYYY-MM-DD format)
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            if (dateParam === todayStr) {
                // Parse the slot time and compare with current time + lead time
                const [slotHours, slotMinutes] = slotStart.split(':').map(Number);
                const slotDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotHours, slotMinutes);
                if (slotDateTime < minBookingDate) {
                    isAvailable = false;
                }
            }

            slots.push({
                start_time: slotStart,
                end_time: slotEnd,
                available: isAvailable
            });
        }

        return NextResponse.json({
            date: dateParam,
            available: true,
            settings: {
                slot_duration_minutes: settings.slot_duration_minutes,
                business_hours_start: settings.business_hours_start,
                business_hours_end: settings.business_hours_end
            },
            slots
        });
    } catch (error) {
        console.error('Available slots GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
