"use client";

import { Calendar, MapPin, MoreVertical, Phone } from "lucide-react";
import { Viewing } from "@/app/lib/dashboardData";

interface UpcomingViewingsProps {
    viewings?: Viewing[];
}

export default function UpcomingViewings({ viewings }: UpcomingViewingsProps) {
    const data = viewings || [];

    const parseTimeDisplay = (timeStr: string) => {
        const parts = timeStr.split(', ');
        const dayLabel = parts[0] || '';
        const timeValue = parts[1] || '';

        let hour = parseInt(timeValue.split(':')[0] || '0', 10);
        const period = hour >= 12 ? 'PM' : 'AM';
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;

        return { dayLabel, hour: `${hour}:${timeValue.split(':')[1] || '00'}`, period };
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Upcoming Viewings</h3>
                    <p className="text-sm text-gray-500">Today & Tomorrow</p>
                </div>
                <button className="text-sm text-teal-600 font-medium hover:text-teal-700">See Calendar</button>
            </div>

            <div className="space-y-4">
                {data.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Calendar className="w-6 h-6 text-gray-300" />
                        </div>
                        <p className="text-sm">No upcoming viewings scheduled</p>
                    </div>
                ) : (
                    data.map((viewing) => {
                        const { dayLabel, hour, period } = parseTimeDisplay(viewing.time);
                        return (
                            <div key={viewing.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors group">
                                {/* Date Box */}
                                <div className="flex sm:flex-col items-center justify-center p-3 bg-white rounded-lg shadow-sm border border-gray-100 min-w-[70px]">
                                    <span className={`text-xs font-bold uppercase ${dayLabel === 'Today' ? 'text-teal-600' : 'text-gray-500'}`}>{dayLabel}</span>
                                    <span className="text-lg font-bold text-gray-900 mt-0.5">{hour}</span>
                                    <span className="text-[10px] text-gray-500 font-medium">{period}</span>
                                </div>

                                {/* Details */}
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 mb-1">{viewing.propertyTitle}</h4>
                                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                                        <MapPin size={14} className="text-gray-400" />
                                        <span className="truncate">Property Viewing</span>
                                    </div>

                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 border-dashed">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                                                {viewing.leadName.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-sm font-medium text-gray-700">{viewing.leadName}</span>
                                        </div>

                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Message Lead">
                                                <Phone size={16} />
                                            </button>
                                            <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            <button className="w-full mt-4 py-2 text-sm text-gray-500 font-medium hover:text-gray-900 transition-colors border border-dashed border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50">
                + Schedule New Viewing
            </button>
        </div>
    );
}
