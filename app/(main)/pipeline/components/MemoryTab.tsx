'use client';

import { useState, useEffect } from 'react';
import { Brain, User, Heart, DollarSign, Star, MessageCircle, RefreshCw, Clock, Activity } from 'lucide-react';

interface EntityGroup {
    [key: string]: Array<{
        key: string;
        value: string;
        confidence: number;
    }>;
}

interface ImportantMessage {
    id: string;
    role: string;
    content: string;
    importance_score: number;
    created_at: string;
}

interface ActivityHighlight {
    id: string;
    activity_type: string;
    item_name?: string;
    item_id?: string;
    created_at: string;
    metadata?: Record<string, unknown>;
}

interface MemoryData {
    leadName: string | null;
    entities: EntityGroup;
    entityCount: number;
    summary: string | null;
    importantMessages: ImportantMessage[];
    activityHighlights: ActivityHighlight[];
}

interface MemoryTabProps {
    leadId: string;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
    name: <User size={14} className="text-blue-500" />,
    preference: <Heart size={14} className="text-pink-500" />,
    budget: <DollarSign size={14} className="text-green-500" />,
    interest: <Star size={14} className="text-yellow-500" />,
    contact: <MessageCircle size={14} className="text-purple-500" />,
    custom: <Brain size={14} className="text-gray-500" />,
};

const ENTITY_LABELS: Record<string, string> = {
    name: 'Identity',
    preference: 'Preferences',
    budget: 'Budget',
    interest: 'Interests',
    contact: 'Contact Info',
    custom: 'Other',
};

export default function MemoryTab({ leadId }: MemoryTabProps) {
    const [data, setData] = useState<MemoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMemory = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/pipeline/leads/${leadId}/memory`);
            if (!response.ok) {
                throw new Error('Failed to fetch memory data');
            }
            const memoryData = await response.json();
            setData(memoryData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (leadId) {
            fetchMemory();
        }
    }, [leadId]);

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getImportanceLabel = (score: number) => {
        if (score >= 3) return { label: 'Milestone', color: 'bg-purple-100 text-purple-700' };
        if (score >= 2) return { label: 'Key Info', color: 'bg-blue-100 text-blue-700' };
        return { label: 'Normal', color: 'bg-gray-100 text-gray-600' };
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-gray-500">
                    <RefreshCw size={20} className="animate-spin" />
                    <span>Loading memory...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-red-500">
                <p>{error}</p>
                <button
                    onClick={fetchMemory}
                    className="mt-4 px-4 py-2 text-sm bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                    Try Again
                </button>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center py-12 text-gray-400">
                No memory data available
            </div>
        );
    }

    const hasEntities = data.entityCount > 0;
    const hasSummary = !!data.summary;
    const hasImportantMessages = data.importantMessages.length > 0;

    return (
        <div className="space-y-6 p-1">
            {/* Header with refresh button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Brain size={20} className="text-indigo-600" />
                    <h3 className="font-semibold text-gray-800">Bot Memory</h3>
                    {data.entityCount > 0 && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            {data.entityCount} facts
                        </span>
                    )}
                </div>
                <button
                    onClick={fetchMemory}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                    title="Refresh memory"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Customer Profile Section */}
            {hasEntities && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                    <h4 className="text-sm font-medium text-indigo-800 mb-3 flex items-center gap-2">
                        <User size={16} />
                        Customer Profile
                    </h4>
                    <div className="grid gap-3">
                        {Object.entries(data.entities).map(([type, entities]) => (
                            <div key={type} className="bg-white/70 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    {ENTITY_ICONS[type] || ENTITY_ICONS.custom}
                                    <span className="text-xs font-medium text-gray-600">
                                        {ENTITY_LABELS[type] || type}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {entities.map((entity, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-md text-xs border border-gray-200"
                                            title={`${entity.key}: ${entity.value} (${Math.round(entity.confidence * 100)}% confidence)`}
                                        >
                                            <span className="text-gray-500">{entity.key.replace(/_/g, ' ')}:</span>
                                            <span className="font-medium text-gray-800">{entity.value}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary Section */}
            {hasSummary && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-100">
                    <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                        <MessageCircle size={16} />
                        Conversation Summary
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {data.summary}
                    </p>
                </div>
            )}

            {/* Important Messages Section */}
            {hasImportantMessages && (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-100">
                    <h4 className="text-sm font-medium text-amber-800 mb-3 flex items-center gap-2">
                        <Star size={16} />
                        Key Moments
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {data.importantMessages.map((msg) => {
                            const importance = getImportanceLabel(msg.importance_score);
                            return (
                                <div
                                    key={msg.id}
                                    className="bg-white/70 rounded-lg p-3 border border-amber-100"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${importance.color}`}>
                                            {importance.label}
                                        </span>
                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                            <Clock size={10} />
                                            {formatTimeAgo(msg.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 line-clamp-2">
                                        <span className="font-medium text-gray-500">
                                            {msg.role === 'user' ? 'Customer: ' : 'Bot: '}
                                        </span>
                                        {msg.content}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Activity Highlights */}
            {data.activityHighlights.length > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                    <h4 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
                        <Activity size={16} />
                        Recent Activity
                    </h4>
                    <div className="space-y-2">
                        {data.activityHighlights.slice(0, 5).map((activity) => (
                            <div
                                key={activity.id}
                                className="flex items-center justify-between text-sm bg-white/70 rounded-lg px-3 py-2"
                            >
                                <span className="text-gray-700">
                                    {activity.activity_type.replace(/_/g, ' ')}
                                    {activity.item_name && `: ${activity.item_name}`}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {formatTimeAgo(activity.created_at)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!hasEntities && !hasSummary && !hasImportantMessages && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <Brain size={48} className="mb-3 opacity-50" />
                    <p className="text-sm">No memory captured yet</p>
                    <p className="text-xs mt-1">The bot will learn from future conversations</p>
                </div>
            )}
        </div>
    );
}
