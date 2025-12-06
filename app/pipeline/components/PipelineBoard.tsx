'use client';

import { useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import StageColumn from './StageColumn';

export default function PipelineBoard() {
    const [stages, setStages] = useState([
        { id: '1', title: 'New Leads', count: 0 },
        { id: '2', title: 'Contacted', count: 0 },
        { id: '3', title: 'Qualified', count: 0 },
        { id: '4', title: 'Proposal', count: 0 },
    ]);
    const [isAddingStage, setIsAddingStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');

    const handleAddStage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStageName.trim()) return;

        setStages([
            ...stages,
            { id: Date.now().toString(), title: newStageName, count: 0 }
        ]);
        setNewStageName('');
        setIsAddingStage(false);
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="h-20 border-b border-gray-100 flex items-center justify-between px-8 bg-white flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pipeline</h1>
                    <div className="h-6 w-[1px] bg-gray-200"></div>
                    <span className="text-sm font-medium text-gray-500">All Deals</span>
                </div>

                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                        <Settings2 size={16} />
                        View Settings
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg transition-colors shadow-lg shadow-gray-200">
                        <Plus size={16} />
                        New Deal
                    </button>
                </div>
            </div>

            {/* Board Area */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="h-full flex p-6 gap-6 min-w-max">
                    {stages.map((stage) => (
                        <StageColumn
                            key={stage.id}
                            title={stage.title}
                            count={stage.count}
                        />
                    ))}

                    {/* Add Stage Button/Form */}
                    <div className="min-w-[320px] h-full">
                        {isAddingStage ? (
                            <form onSubmit={handleAddStage} className="bg-gray-50 p-4 rounded-xl border-2 border-primary/10">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Stage Name"
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium mb-3 focus:outline-none focus:ring-2 focus:ring-black/5"
                                    value={newStageName}
                                    onChange={(e) => setNewStageName(e.target.value)}
                                />
                                <div className="flex items-center gap-2">
                                    <button
                                        type="submit"
                                        className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded-md hover:bg-gray-800 transition-colors"
                                    >
                                        Add Stage
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingStage(false)}
                                        className="px-3 py-1.5 text-gray-500 text-xs font-bold hover:text-gray-900 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button
                                onClick={() => setIsAddingStage(true)}
                                className="w-full h-[60px] flex items-center justify-center gap-2 border-2 border-dashed border-gray-100 hover:border-gray-300 rounded-xl text-gray-400 hover:text-gray-600 transition-all font-medium"
                            >
                                <Plus size={20} />
                                Add Stage
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
