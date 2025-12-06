import { MoreHorizontal, Plus } from "lucide-react";

interface StageByProps {
    title: string;
    count?: number;
}

export default function StageColumn({ title, count = 0 }: StageByProps) {
    return (
        <div className="min-w-[320px] flex flex-col h-full bg-gray-50/50 rounded-xl p-2 group">
            <div className="flex items-center justify-between p-3 mb-2">
                <div className="flex items-center gap-3">
                    <h3 className="font-bold text-gray-900 tracking-tight">{title}</h3>
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {count}
                    </span>
                </div>
                <button className="p-1 text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-1 space-y-3">
                {/* Placeholder for dropped items */}
                <div className="h-full min-h-[100px] border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center text-gray-300 text-sm font-medium hover:border-gray-200 transition-colors cursor-pointer">
                    Drop leads here
                </div>
            </div>

            <button className="mt-2 flex items-center justify-center gap-2 p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-lg transition-all text-sm font-medium border border-transparent hover:border-gray-200 hover:shadow-sm">
                <Plus size={16} />
                Add Lead
            </button>
        </div>
    );
}
