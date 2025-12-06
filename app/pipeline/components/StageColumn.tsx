'use client';

import { useState } from 'react';
import { MoreHorizontal, MessageCircle, Clock, ChevronDown, GripVertical } from 'lucide-react';
import { Droppable, Draggable } from '@hello-pangea/dnd';

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

interface StageColumnProps {
    stage: Stage;
    onMoveLead: (leadId: string, stageId: string) => void;
    allStages: Stage[];
}

function formatTimeAgo(dateString: string | null): string {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

export default function StageColumn({ stage, onMoveLead, allStages }: StageColumnProps) {
    const [moveMenuOpen, setMoveMenuOpen] = useState<string | null>(null);

    return (
        <div className="w-[320px] max-w-[320px] flex-shrink-0 flex flex-col h-full bg-gray-50/50 rounded-xl group">
            {/* Stage Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color }}
                    ></div>
                    <h3 className="font-bold text-gray-900 tracking-tight">{stage.name}</h3>
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {stage.leads.length}
                    </span>
                </div>
                <button className="p-1.5 text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-white">
                    <MoreHorizontal size={16} />
                </button>
            </div>

            {/* Leads - Droppable Area */}
            <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                            }`}
                    >
                        {stage.leads.length === 0 && !snapshot.isDraggingOver ? (
                            <div className="h-24 border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center text-gray-300 text-sm font-medium">
                                No leads
                            </div>
                        ) : (
                            stage.leads.map((lead, index) => (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className={`bg-white rounded-lg border p-4 transition-all cursor-pointer group/card w-full max-w-full overflow-hidden ${snapshot.isDragging
                                                    ? 'shadow-lg border-blue-200 rotate-1'
                                                    : 'border-gray-100 hover:shadow-md hover:border-gray-200'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    {/* Drag Handle */}
                                                    <div
                                                        {...provided.dragHandleProps}
                                                        className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
                                                    >
                                                        <GripVertical size={14} />
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold">
                                                        {(lead.name || lead.sender_id)?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">
                                                            {lead.name || `Lead ${lead.sender_id.slice(-6)}`}
                                                        </p>
                                                        <p className="text-xs text-gray-400">
                                                            {lead.sender_id.slice(-8)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Move dropdown */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setMoveMenuOpen(moveMenuOpen === lead.id ? null : lead.id)}
                                                        className="p-1 text-gray-400 hover:text-gray-900 opacity-0 group-hover/card:opacity-100 transition-opacity rounded hover:bg-gray-100"
                                                    >
                                                        <ChevronDown size={14} />
                                                    </button>

                                                    {moveMenuOpen === lead.id && (
                                                        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
                                                            <p className="px-3 py-1.5 text-xs text-gray-400 font-medium">Move to</p>
                                                            {allStages
                                                                .filter(s => s.id !== stage.id)
                                                                .map(s => (
                                                                    <button
                                                                        key={s.id}
                                                                        onClick={() => {
                                                                            onMoveLead(lead.id, s.id);
                                                                            setMoveMenuOpen(null);
                                                                        }}
                                                                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                                    >
                                                                        <div
                                                                            className="w-2 h-2 rounded-full"
                                                                            style={{ backgroundColor: s.color }}
                                                                        ></div>
                                                                        {s.name}
                                                                    </button>
                                                                ))
                                                            }
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* AI Reason - truncated */}
                                            {lead.ai_classification_reason && (
                                                <p
                                                    className="text-xs text-gray-500 mb-3 italic overflow-hidden break-words"
                                                    style={{
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'break-word',
                                                    }}
                                                    title={lead.ai_classification_reason}
                                                >
                                                    &quot;{lead.ai_classification_reason}&quot;
                                                </p>
                                            )}

                                            {/* Stats */}
                                            <div className="flex items-center gap-4 text-xs text-gray-400">
                                                <span className="flex items-center gap-1">
                                                    <MessageCircle size={12} />
                                                    {lead.message_count}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {formatTimeAgo(lead.last_message_at)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            ))
                        )}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </div>
    );
}

