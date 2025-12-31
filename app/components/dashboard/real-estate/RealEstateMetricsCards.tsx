"use client";

import { ArrowUpRight, ArrowDownRight, Users, Home, Calendar, Clock, Minus } from "lucide-react";
import { RealEstateMetrics } from "@/app/lib/dashboardData";

interface RealEstateMetricsCardsProps {
    metrics?: RealEstateMetrics;
    isLoading?: boolean;
}

export default function RealEstateMetricsCards({ metrics, isLoading = false }: RealEstateMetricsCardsProps) {
    const data = metrics;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Leads Today Card - Featured Brand Card (Teal Gradient) */}
            <div className="bg-gradient-to-br from-teal-600 to-teal-700 text-white p-6 rounded-2xl shadow-lg ring-1 ring-teal-500/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    {data && (
                        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${data.leads.growth >= 0 ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80'
                            }`}>
                            {data.leads.growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {Math.abs(data.leads.growth)}%
                        </div>
                    )}
                </div>
                <div className="space-y-1">
                    <h3 className="text-teal-100 text-sm font-medium">Leads Today</h3>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-3xl font-bold tracking-tight">
                            {isLoading ? (
                                <span className="inline-block w-8 h-8 bg-white/20 rounded animate-pulse"></span>
                            ) : (
                                data?.leads.today ?? 0
                            )}
                        </h2>
                        <span className="text-xs text-teal-200">
                            {isLoading ? "..." : `+${data?.leads.week ?? 0} this week`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Active Listings Card - Clean White */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-gray-50 rounded-xl">
                        <Home className="w-5 h-5 text-gray-600" />
                    </div>
                </div>
                <div className="space-y-1">
                    <h3 className="text-gray-500 text-sm font-medium">Active Listings</h3>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {isLoading ? (
                                <span className="inline-block w-8 h-7 bg-gray-100 rounded animate-pulse"></span>
                            ) : (
                                data?.activeListings ?? 0
                            )}
                        </h2>
                        <span className="text-xs text-gray-400">
                            {isLoading ? "..." : `${data?.propertiesUnderContract ?? 0} under contract`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Scheduled Viewings Card - Clean White with Teal/Action Accent */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-gray-50 rounded-xl">
                        <Calendar className="w-5 h-5 text-gray-600" />
                    </div>
                </div>
                <div className="space-y-1">
                    <h3 className="text-gray-500 text-sm font-medium">Scheduled Viewings</h3>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {isLoading ? (
                                <span className="inline-block w-8 h-7 bg-gray-100 rounded animate-pulse"></span>
                            ) : (
                                data?.viewings.scheduled ?? 0
                            )}
                        </h2>
                        {(data?.viewings.pending ?? 0) > 0 && (
                            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                                {data?.viewings.pending} pending
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Leads This Month - Clean White */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-gray-50 rounded-xl">
                        <Clock className="w-5 h-5 text-gray-600" />
                    </div>
                </div>
                <div className="space-y-1">
                    <h3 className="text-gray-500 text-sm font-medium">Leads This Month</h3>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {isLoading ? (
                                <span className="inline-block w-8 h-7 bg-gray-100 rounded animate-pulse"></span>
                            ) : (
                                data?.leads.month ?? 0
                            )}
                        </h2>
                    </div>
                </div>
            </div>
        </div>
    );
}
