'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, HelpCircle, MessageCircle, ChevronDown, Check, X, Sparkles } from 'lucide-react';
import FAQGeneratorModal from './FAQGeneratorModal';

interface FAQItem {
    id: string;
    question: string;
    answer: string;
    categoryId?: string;
}

interface FAQEditorProps {
    categoryId: string;
    categoryName: string;
}

export default function FAQEditor({ categoryId, categoryName }: FAQEditorProps) {
    const [faqs, setFaqs] = useState<FAQItem[]>([]);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [showAIGenerator, setShowAIGenerator] = useState(false);

    const fetchFAQs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/faq');
            const data = await res.json();
            if (Array.isArray(data)) {
                setFaqs(data.filter((f: FAQItem) => f.categoryId === categoryId));
            }
        } catch (error) {
            console.error('Failed to fetch FAQs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (categoryId) {
            fetchFAQs();
        }
    }, [categoryId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim() || !answer.trim()) return;

        setSaving(true);
        try {
            const res = await fetch('/api/faq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answer, categoryId }),
            });

            if (res.ok) {
                setQuestion('');
                setAnswer('');
                setIsAdding(false);
                await fetchFAQs();
            }
        } catch (error) {
            console.error('Failed to save FAQ:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this FAQ entry?')) return;
        try {
            await fetch(`/api/faq?id=${id}`, { method: 'DELETE' });
            setFaqs(faqs.filter(f => f.id !== id));
        } catch (error) {
            console.error('Failed to delete FAQ:', error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-6 pb-2">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">FAQ Editor</h2>
                        <p className="text-sm text-gray-500">Manage Q&A pairs for <span className="font-medium text-gray-700">{categoryName}</span></p>
                    </div>
                    <button
                        onClick={() => setShowAIGenerator(true)}
                        className="px-3 py-2 flex items-center gap-2 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                    >
                        <Sparkles size={16} />
                        AI Generate
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">

                {/* Add New Section */}
                <div className={`bg-white border rounded-xl transition-all duration-300 overflow-hidden shadow-sm ${isAdding ? 'border-teal-200 ring-4 ring-teal-50/50' : 'border-gray-200 hover:border-teal-200'}`}>
                    {!isAdding ? (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="w-full p-4 flex items-center gap-3 text-gray-500 hover:text-teal-600 transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                <Plus size={18} />
                            </div>
                            <span className="font-medium">Add new FAQ Question</span>
                        </button>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-800">New Question</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Question
                                </label>
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder="e.g., How much does it cost?"
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all font-medium text-gray-800"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Answer
                                </label>
                                <textarea
                                    value={answer}
                                    onChange={(e) => setAnswer(e.target.value)}
                                    placeholder="Write a clear and concise answer..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-gray-700 resize-none"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !question.trim() || !answer.trim()}
                                    className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow font-medium flex items-center gap-2"
                                >
                                    {saving ? 'Saving...' : (
                                        <>
                                            <Check size={16} /> Save FAQ
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                            <p className="text-sm text-gray-400">Loading FAQs...</p>
                        </div>
                    ) : faqs.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                            <HelpCircle size={48} className="mx-auto mb-4 text-gray-200" />
                            <p className="text-gray-500 font-medium">No FAQ entries found</p>
                            <p className="text-sm text-gray-400 mt-1">Start by adding your first question above.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {faqs.map((faq) => (
                                <div
                                    key={faq.id}
                                    className="group bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:border-teal-100 transition-all duration-200"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">Q</div>
                                                <h3 className="text-gray-800 font-medium leading-relaxed">{faq.question}</h3>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 w-6 h-6 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">A</div>
                                                <p className="text-gray-600 text-sm leading-relaxed">{faq.answer}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(faq.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            title="Delete FAQ"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* AI Generator Modal */}
            <FAQGeneratorModal
                isOpen={showAIGenerator}
                onClose={() => setShowAIGenerator(false)}
                onSave={async (faqs, catId) => {
                    const res = await fetch('/api/knowledge/generate-faq', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ faqs, categoryId: catId || categoryId, save: true }),
                    });
                    if (!res.ok) throw new Error('Failed to save FAQs');
                    await fetchFAQs();
                }}
                categoryId={categoryId}
                categoryName={categoryName}
            />
        </div>
    );
}
