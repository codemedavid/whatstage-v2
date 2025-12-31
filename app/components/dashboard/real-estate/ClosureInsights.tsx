"use client";

import { AlertCircle, Clock, DollarSign, MessageSquareX, UserX, ChevronRight, HelpCircle, CheckCircle } from "lucide-react";
import { LeadInsight } from "@/app/lib/dashboardData";

interface ClosureInsightsCardProps {
    insights?: LeadInsight[];
}

export default function ClosureInsightsCard({ insights }: ClosureInsightsCardProps) {
    const data = insights || [];

    const getIcon = (reason: string) => {
        const r = reason.toLowerCase();
        if (r.includes('response')) return <Clock className="w-4 h-4 text-amber-600" />;
        if (r.includes('stalled')) return <UserX className="w-4 h-4 text-slate-500" />;
        if (r.includes('attention')) return <AlertCircle className="w-4 h-4 text-red-600" />;
        if (r.includes('no-show')) return <MessageSquareX className="w-4 h-4 text-red-500" />;
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
    };

    const getStyle = (reason: string) => {
        const r = reason.toLowerCase();
        // Use subtler backgrounds and more defined borders
        if (r.includes('response')) return { bg: "bg-amber-50", text: "text-amber-900", border: "border-amber-100", badge: "bg-amber-100 text-amber-800" };
        if (r.includes('stalled')) return { bg: "bg-slate-50", text: "text-slate-900", border: "border-slate-100", badge: "bg-slate-200 text-slate-700" };
        if (r.includes('attention')) return { bg: "bg-red-50", text: "text-red-900", border: "border-red-100", badge: "bg-red-100 text-red-800" };
        return { bg: "bg-blue-50", text: "text-blue-900", border: "border-blue-100", badge: "bg-blue-100 text-blue-800" };
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Why Haven&apos;t They Closed?</h3>
                    <p className="text-sm text-gray-500">Bottlenecks in your pipeline</p>
                </div>
                <button className="p-2 hover:bg-gray-50 rounded-full text-gray-400 transition-colors">
                    <HelpCircle size={18} />
                </button>
            </div>

            <div className="flex-1 space-y-3">
                {data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                        <div className="p-4 bg-teal-50 rounded-full mb-4">
                            <CheckCircle className="w-8 h-8 text-teal-600" />
                        </div>
                        <h4 className="font-medium text-gray-900 mb-1">All Clear!</h4>
                        <p className="text-sm text-gray-500">No major bottlenecks detected</p>
                    </div>
                ) : (
                    data.map((item, index) => {
                        const style = getStyle(item.reason);
                        return (
                            <div
                                key={index}
                                className="group flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg border ${style.border} ${style.bg} bg-opacity-50`}>
                                        {getIcon(item.reason)}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900">{item.reason}</h4>
                                        <p className="text-xs text-gray-500">{item.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${style.badge}`}>
                                        {item.count}
                                    </span>
                                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500" />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {data.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                    <button className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-xl transition-colors shadow-sm hover:shadow">
                        View All Stalled Leads
                    </button>
                </div>
            )}
        </div>
    );
}
