'use client';

import {
    LayoutGrid,
    FileText,
    Settings,
    Users,
    HelpCircle,
    LogOut,
    Database,
    Bot,
    Kanban
} from 'lucide-react';

import Link from 'next/link';

export default function Sidebar() {
    return (
        <div className="w-16 bg-[#1C1C1C] h-screen flex flex-col items-center py-6 text-gray-400 border-r border-gray-800 flex-shrink-0">
            <div className="mb-8">
                <Link href="/">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold cursor-pointer">
                        A
                    </div>
                </Link>
            </div>

            <nav className="flex-1 flex flex-col gap-6 w-full items-center">
                <Link href="/" className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Dashboard">
                    <LayoutGrid size={20} />
                </Link>
                <Link href="/pipeline" className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Pipeline">
                    <Kanban size={20} />
                </Link>
                <Link href="/settings" className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Settings">
                    <Settings size={20} />
                </Link>
            </nav>

            <div className="flex flex-col gap-6 w-full items-center mt-auto">
                {/* Bottom icons removed as per request */}
            </div>
        </div>
    );
}
