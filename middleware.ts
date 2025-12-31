import { type NextRequest } from 'next/server';
import { updateSession } from '@/app/lib/supabaseMiddleware';

export async function middleware(request: NextRequest) {
    return await updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api/upload (file upload route - avoid body parsing issues)
         * - api/media (media upload route - avoid body parsing issues)
         * - Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|api/upload|api/media|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
