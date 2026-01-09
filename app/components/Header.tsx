'use client';

import { Bell } from 'lucide-react';

export default function Header() {
    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                Tanaw AI
            </div>

            <div className="flex items-center gap-4">
                <button className="p-2 text-gray-500 hover:text-gray-700 relative">
                    <Bell size={20} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>
                <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden border border-gray-200">
                    {/* Placeholder for user avatar */}
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500"></div>
                </div>
            </div>
        </header >
    );
}
