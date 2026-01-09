import { Suspense } from 'react';
import { supabaseAdmin, getUserIdFromPageId } from '@/app/lib/supabaseAdmin';
import { Loader2 } from 'lucide-react';
import BookingPageClient from './BookingPageClient';

interface AppointmentSettings {
    business_hours_start: string;
    business_hours_end: string;
    slot_duration_minutes: number;
    days_available: number[];
    booking_lead_time_hours: number;
    max_advance_booking_days: number;
    buffer_between_slots_minutes: number;
    is_active: boolean;
}

interface Appointment {
    id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: string;
    customer_name?: string;
    notes?: string;
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
    is_active: true,
};

// Fetch appointment settings on the server for a specific user (cached for 5 minutes)
async function getAppointmentSettings(userId: string): Promise<AppointmentSettings> {
    if (!userId) return defaultSettings;

    try {
        const { data, error } = await supabaseAdmin
            .from('appointment_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return defaultSettings;
        }

        return data as AppointmentSettings;
    } catch (error) {
        console.error('Failed to fetch appointment settings:', error);
        return defaultSettings;
    }
}

// Fetch existing appointments for a customer filtered by user
async function getExistingAppointments(senderPsid: string, userId: string): Promise<Appointment[]> {
    if (!senderPsid || !userId) return [];

    try {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabaseAdmin
            .from('appointments')
            .select('id, appointment_date, start_time, end_time, status, customer_name, notes')
            .eq('user_id', userId)
            .eq('sender_psid', senderPsid)
            .gte('appointment_date', today)
            .neq('status', 'cancelled')
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Failed to fetch existing appointments:', error);
            return [];
        }

        return (data || []) as Appointment[];
    } catch (error) {
        console.error('Failed to fetch existing appointments:', error);
        return [];
    }
}

// Server component to wrap the data fetching
async function BookingPageContent({ senderPsid, pageId, propertyId, bookingType, userId }: { senderPsid: string; pageId: string; propertyId?: string; bookingType?: string; userId: string | null }) {
    // If no valid userId, show error
    if (!userId) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Loader2 className="text-red-500" size={40} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Unavailable</h1>
                    <p className="text-gray-600 mb-6">
                        This booking link appears to be invalid or the page is no longer connected.
                        Please contact the business directly for assistance.
                    </p>
                </div>
            </div>
        );
    }

    // Parallel fetch for settings and existing appointments
    const [settings, existingAppointments] = await Promise.all([
        getAppointmentSettings(userId),
        getExistingAppointments(senderPsid, userId),
    ]);

    let property = null;
    if (propertyId && userId) {
        const { data } = await supabaseAdmin
            .from('properties')
            .select('id, title, address, image_url, price')
            .eq('id', propertyId)
            .eq('user_id', userId)
            .single();
        property = data;
    }

    return (
        <BookingPageClient
            initialSettings={settings}
            initialAppointments={existingAppointments}
            senderPsid={senderPsid}
            pageId={pageId}
            property={property}
            bookingType={bookingType}
        />
    );
}

export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ psid?: string; pageId?: string; propertyId?: string; type?: string }>;
}) {
    const params = await searchParams;
    const senderPsid = params.psid || '';
    const pageId = params.pageId || '';
    const propertyId = params.propertyId;
    const bookingType = params.type;

    // Resolve user_id from pageId via connected_pages table
    const userId = pageId ? await getUserIdFromPageId(pageId) : null;

    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                    <div className="text-center">
                        <Loader2 className="animate-spin mx-auto mb-4 text-emerald-500" size={40} />
                        <p className="text-gray-500">Loading booking calendar...</p>
                    </div>
                </div>
            }
        >
            <BookingPageContent
                senderPsid={senderPsid}
                pageId={pageId}
                propertyId={propertyId}
                bookingType={bookingType}
                userId={userId}
            />
        </Suspense>
    );
}

