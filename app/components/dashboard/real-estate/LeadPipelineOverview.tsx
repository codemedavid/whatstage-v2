"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { RealEstateMetrics } from "@/app/lib/dashboardData";

interface LeadPipelineOverviewProps {
    pipeline?: RealEstateMetrics['pipeline'];
    isLoading?: boolean;
}

export default function LeadPipelineOverview({ pipeline, isLoading = false }: LeadPipelineOverviewProps) {
    const dataMap = pipeline || { new: 0, contacted: 0, viewing: 0, negotiating: 0, closed: 0 };

    // Branded Palette: Teal, Blue, Indigo, Slate
    const data = [
        { name: 'New Leads', value: dataMap.new, color: '#0EA5E9' },       // Sky Blue (Fresh)
        { name: 'Contacted', value: dataMap.contacted, color: '#6366F1' }, // Indigo (Active)
        { name: 'Viewings', value: dataMap.viewing, color: '#8B5CF6' },    // Violet (Engaged)
        { name: 'Negotiation', value: dataMap.negotiating, color: '#F59E0B' }, // Amber (Action Needed)
        { name: 'Closed', value: dataMap.closed, color: '#10B981' },       // Emerald (Success)
    ];

    const total = data.reduce((sum, item) => sum + item.value, 0);
    const hasData = total > 0;

    return (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">Lead Pipeline</h3>
                <p className="text-sm text-gray-500">Breakdown of active leads by status</p>
            </div>

            <div className="flex-1 min-h-[250px] relative">
                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    {isLoading ? (
                        <span className="inline-block w-12 h-8 bg-gray-100 rounded animate-pulse"></span>
                    ) : (
                        <>
                            <span className="text-3xl font-bold text-gray-900">{total}</span>
                            <span className="text-sm text-gray-500">Total Active</span>
                        </>
                    )}
                </div>

                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={110}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-gray-400">
                            <div className="w-32 h-32 mx-auto mb-4 rounded-full border-8 border-gray-50"></div>
                            <p className="text-sm">No leads yet</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6 space-y-3">
                {data.map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm font-medium text-gray-600">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${hasData ? (item.value / total) * 100 : 0}%`, backgroundColor: item.color }}
                                />
                            </div>
                            <span className="text-sm font-bold text-gray-900 w-8 text-right">{item.value}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
