'use client';

import { useState } from 'react';
import { X, Sparkles, Check, Trash2, Loader2, AlertCircle, Save } from 'lucide-react';

interface GeneratedFAQ {
    question: string;
    answer: string;
    confidence: number;
    selected?: boolean;
}

interface FAQGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (faqs: GeneratedFAQ[], categoryId?: string) => Promise<void>;
    initialText?: string;
    categoryId?: string;
    categoryName?: string;
}

export default function FAQGeneratorModal({
    isOpen,
    onClose,
    onSave,
    initialText = '',
    categoryId,
    categoryName,
}: FAQGeneratorModalProps) {
    const [text, setText] = useState(initialText);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [faqs, setFaqs] = useState<GeneratedFAQ[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [pairCount, setPairCount] = useState(5);

    const handleGenerate = async () => {
        if (text.length < 100) {
            setError('Please provide at least 100 characters of text');
            return;
        }

        setGenerating(true);
        setError(null);

        try {
            const res = await fetch('/api/knowledge/generate-faq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, maxPairs: pairCount }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to generate FAQs');
            }

            // Mark all as selected by default
            setFaqs(data.faqs.map((faq: GeneratedFAQ) => ({ ...faq, selected: true })));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate FAQs');
        } finally {
            setGenerating(false);
        }
    };

    const toggleFAQ = (index: number) => {
        setFaqs(prev => prev.map((faq, i) =>
            i === index ? { ...faq, selected: !faq.selected } : faq
        ));
    };

    const removeFAQ = (index: number) => {
        setFaqs(prev => prev.filter((_, i) => i !== index));
    };

    const editFAQ = (index: number, field: 'question' | 'answer', value: string) => {
        setFaqs(prev => prev.map((faq, i) =>
            i === index ? { ...faq, [field]: value } : faq
        ));
    };

    const handleSave = async () => {
        const selectedFaqs = faqs.filter(faq => faq.selected);
        if (selectedFaqs.length === 0) {
            setError('Please select at least one FAQ to save');
            return;
        }

        setSaving(true);
        try {
            await onSave(selectedFaqs, categoryId);
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save FAQs');
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setText(initialText);
        setFaqs([]);
        setError(null);
        onClose();
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return 'bg-green-100 text-green-700';
        if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700';
        return 'bg-orange-100 text-orange-700';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Sparkles size={20} className="text-purple-600" />
                        <h2 className="text-lg font-semibold text-gray-900">Generate FAQs</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Text Input */}
                    {faqs.length === 0 && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Source Text
                                </label>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Paste or type the content you want to generate FAQs from..."
                                    className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    {text.length} characters (minimum 100)
                                </p>
                            </div>

                            <div className="flex items-center gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Number of FAQs
                                    </label>
                                    <select
                                        value={pairCount}
                                        onChange={(e) => setPairCount(Number(e.target.value))}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    >
                                        {[3, 5, 7, 10].map(n => (
                                            <option key={n} value={n}>{n} pairs</option>
                                        ))}
                                    </select>
                                </div>
                                {categoryName && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                            Category
                                        </label>
                                        <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                                            {categoryName}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Generated FAQs */}
                    {faqs.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-medium text-gray-700">
                                    Generated FAQs ({faqs.filter(f => f.selected).length} selected)
                                </h3>
                                <button
                                    onClick={() => setFaqs([])}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                    Regenerate
                                </button>
                            </div>

                            {faqs.map((faq, index) => (
                                <div
                                    key={index}
                                    className={`border rounded-xl p-3 transition-colors ${faq.selected ? 'border-purple-300 bg-purple-50/50' : 'border-gray-200 bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-start gap-2">
                                        <button
                                            onClick={() => toggleFAQ(index)}
                                            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${faq.selected
                                                    ? 'bg-purple-600 border-purple-600'
                                                    : 'border-gray-300 hover:border-purple-400'
                                                }`}
                                        >
                                            {faq.selected && <Check size={12} className="text-white" />}
                                        </button>

                                        <div className="flex-1 space-y-2">
                                            <div>
                                                <label className="text-xs text-gray-500">Question</label>
                                                <input
                                                    type="text"
                                                    value={faq.question}
                                                    onChange={(e) => editFAQ(index, 'question', e.target.value)}
                                                    className="w-full px-2 py-1 text-sm font-medium text-black bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500">Answer</label>
                                                <textarea
                                                    value={faq.answer}
                                                    onChange={(e) => editFAQ(index, 'answer', e.target.value)}
                                                    className="w-full px-2 py-1 text-sm text-black bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                                                    rows={2}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <span className={`px-2 py-0.5 text-xs rounded-full ${getConfidenceColor(faq.confidence)}`}>
                                                {Math.round(faq.confidence * 100)}%
                                            </span>
                                            <button
                                                onClick={() => removeFAQ(index)}
                                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-start gap-2 text-sm">
                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-2xl">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>

                    {faqs.length === 0 ? (
                        <button
                            onClick={handleGenerate}
                            disabled={generating || text.length < 100}
                            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {generating ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} />
                                    Generate FAQs
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            disabled={saving || faqs.filter(f => f.selected).length === 0}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Save {faqs.filter(f => f.selected).length} FAQs
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
