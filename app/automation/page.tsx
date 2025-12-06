'use client';

import WorkflowCanvas from './components/WorkflowCanvas';
import { Play, Settings2, Save, Edit2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function AutomationPage() {
    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [workflowName, setWorkflowName] = useState('Follow-up Sequence');
    const [isPublished, setIsPublished] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);

    const handleSave = async (workflowData: any) => {
        setIsSaving(true);
        try {
            if (workflowId) {
                // Update existing
                await fetch('/api/workflows', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: workflowId, name: workflowName, workflow_data: workflowData }),
                });
            } else {
                // Create new
                const res = await fetch('/api/workflows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: workflowName, workflow_data: workflowData }),
                });
                const data = await res.json();
                setWorkflowId(data.id);
            }
        } catch (error) {
            console.error('Error saving workflow:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!workflowId) {
            alert('Please save the workflow first');
            return;
        }

        try {
            await fetch(`/api/workflows/${workflowId}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_published: !isPublished }),
            });
            setIsPublished(!isPublished);
        } catch (error) {
            console.error('Error publishing workflow:', error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    {isEditingName ? (
                        <input
                            type="text"
                            value={workflowName}
                            onChange={(e) => setWorkflowName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                            className="text-xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent"
                            autoFocus
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-gray-900">{workflowName}</h1>
                            <button onClick={() => setIsEditingName(true)} className="p-1 text-gray-400 hover:text-gray-600">
                                <Edit2 size={14} />
                            </button>
                        </div>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${isPublished ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {isPublished ? 'Published' : 'Draft'}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handlePublish()}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm ${isPublished
                                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                    >
                        <Play size={16} />
                        {isPublished ? 'Unpublish' : 'Publish Workflow'}
                    </button>
                </div>
            </header>

            {/* Main Canvas Area */}
            <main className="flex-1 overflow-hidden">
                <WorkflowCanvas onSave={handleSave} isSaving={isSaving} />
            </main>
        </div>
    );
}
