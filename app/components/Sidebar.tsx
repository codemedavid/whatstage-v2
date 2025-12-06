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
                <Link href="/" className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <LayoutGrid size={20} />
                </Link>
                <Link href="/pipeline" className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <Kanban size={20} />
                </Link>
                <button className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <Database size={20} />
                </button>
                <Link href="/settings" className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <Settings size={20} />
                </Link>
                <button className="p-2 text-teal-400 bg-teal-400/10 rounded-lg transition-colors">
                    <FileText size={20} />
                </button>
                <button className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <Users size={20} />
                </button>
                <button className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <Bot size={20} />
                </button>
            </nav>

            <div className="flex flex-col gap-6 w-full items-center mt-auto">
                <button className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <HelpCircle size={20} />
                </button>
                <button className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <LogOut size={20} />
                </button>
            </div>
        </div>
    );
}
