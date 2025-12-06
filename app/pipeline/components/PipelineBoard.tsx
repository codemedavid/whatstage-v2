'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Settings2, RefreshCw } from 'lucide-react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import StageColumn from './StageColumn';

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    message_count: number;
    last_message_at: string | null;
    ai_classification_reason: string | null;
}

interface Stage {
    id: string;
    name: string;
    display_order: number;
    color: string;
    leads: Lead[];
}

export default function PipelineBoard() {
    const [stages, setStages] = useState<Stage[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddingStage, setIsAddingStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/pipeline/leads');
            const data = await res.json();
            if (data.stages) {
                setStages(data.stages);
            }
        } catch (error) {
            console.error('Error fetching pipeline data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        // Poll for updates every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleAddStage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStageName.trim()) return;

        try {
            const res = await fetch('/api/pipeline/stages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newStageName }),
            });

            if (res.ok) {
                setNewStageName('');
                setIsAddingStage(false);
                fetchData();
            }
        } catch (error) {
            console.error('Error creating stage:', error);
        }
    };

    const handleMoveLead = async (leadId: string, newStageId: string) => {
        try {
            await fetch('/api/pipeline/leads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId, stageId: newStageId }),
            });
            fetchData();
        } catch (error) {
            console.error('Error moving lead:', error);
        }
    };

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        // Dropped outside a valid droppable
        if (!destination) return;

        // Dropped in the same position
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        // If moving to a different stage, call the API
        if (destination.droppableId !== source.droppableId) {
            // Optimistic UI update
            setStages((prevStages) => {
                const newStages = prevStages.map(stage => ({
                    ...stage,
                    leads: [...stage.leads]
                }));

                const sourceStage = newStages.find(s => s.id === source.droppableId);
                const destStage = newStages.find(s => s.id === destination.droppableId);

                if (sourceStage && destStage) {
                    const [movedLead] = sourceStage.leads.splice(source.index, 1);
                    destStage.leads.splice(destination.index, 0, movedLead);
                }

                return newStages;
            });

            // Call API to persist the change
            handleMoveLead(draggableId, destination.droppableId);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
                    <span className="text-sm text-gray-500 font-medium">Loading pipeline...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="h-20 border-b border-gray-100 flex items-center justify-between px-8 bg-white flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pipeline</h1>
                    <div className="h-6 w-[1px] bg-gray-200"></div>
                    <span className="text-sm font-medium text-gray-500">
                        {stages.reduce((acc, s) => acc + s.leads.length, 0)} leads
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                        <Settings2 size={16} />
                        Settings
                    </button>
                </div>
            </div>

            {/* Board Area */}
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex-1 overflow-x-auto overflow-y-hidden">
                    <div className="h-full flex p-6 gap-4 min-w-max">
                        {stages.map((stage) => (
                            <StageColumn
                                key={stage.id}
                                stage={stage}
                                onMoveLead={handleMoveLead}
                                allStages={stages}
                            />
                        ))}

                        {/* Add Stage Button/Form */}
                        <div className="min-w-[320px] h-full">
                            {isAddingStage ? (
                                <form onSubmit={handleAddStage} className="bg-gray-50 p-4 rounded-xl border-2 border-dashed border-gray-200">
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
            </DragDropContext>
        </div>
    );
}
