"use client";

import DashboardHero from './DashboardHero';

export default function DashboardShell({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col h-full bg-[var(--background)] overflow-y-auto">
            <div className="p-8 pb-32"> {/* Extra padding bottom for scroll */}
                <DashboardHero />

                <div className="bg-white rounded-[32px] p-8 min-h-[500px] shadow-sm">
                    {children}
                </div>
            </div>
        </div>
    );
}
