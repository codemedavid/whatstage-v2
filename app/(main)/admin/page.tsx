import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AdminClient from './AdminClient';
import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { redirect } from 'next/navigation';

async function checkAdminAccess(): Promise<boolean> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return false;
        }

        const { data: adminUser } = await supabaseAdmin
            .from('admin_users')
            .select('id')
            .eq('user_id', user.id)
            .single();

        return !!adminUser;
    } catch {
        return false;
    }
}

export default async function AdminPage() {
    const isAdmin = await checkAdminAccess();

    if (!isAdmin) {
        redirect('/');
    }

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin mr-2" size={24} />
                <span>Loading admin dashboard...</span>
            </div>
        }>
            <AdminClient />
        </Suspense>
    );
}
