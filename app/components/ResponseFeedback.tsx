'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, Edit2, Send, X, Loader2 } from 'lucide-react';

interface ResponseFeedbackProps {
    senderId: string;
    botMessage: string;
    userMessage?: string;
    onFeedbackSubmitted?: () => void;
    compact?: boolean;
}

export default function ResponseFeedback({
    senderId,
    botMessage,
    userMessage,
    onFeedbackSubmitted,
    compact = false,
}: ResponseFeedbackProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isHelpful, setIsHelpful] = useState<boolean | null>(null);
    const [rating, setRating] = useState<number>(0);
    const [correction, setCorrection] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleQuickFeedback = async (helpful: boolean) => {
        setIsHelpful(helpful);
        if (!helpful) {
            setIsExpanded(true);
            return;
        }

        // Submit just the thumbs up immediately
        await submitFeedback({ isHelpful: true });
    };

    const submitFeedback = async (overrides: Partial<{
        isHelpful: boolean;
        rating: number;
        correction: string;
        notes: string;
    }> = {}) => {
        setSubmitting(true);

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderId,
                    botMessage,
                    userMessage,
                    isHelpful: overrides.isHelpful ?? isHelpful,
                    rating: overrides.rating ?? (rating > 0 ? rating : undefined),
                    correction: overrides.correction ?? (correction.trim() || undefined),
                    feedbackNotes: overrides.notes ?? (notes.trim() || undefined),
                }),
            });

            if (res.ok) {
                setSubmitted(true);
                onFeedbackSubmitted?.();
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitDetailed = () => {
        submitFeedback({});
    };

    if (submitted) {
        return (
            <div className="flex items-center gap-2 text-xs text-green-600 py-1">
                <ThumbsUp size={12} />
                <span>Feedback submitted</span>
            </div>
        );
    }

    if (compact) {
        return (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => handleQuickFeedback(true)}
                    disabled={submitting}
                    className={`p-1 rounded transition-colors ${isHelpful === true ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                        }`}
                    title="Helpful"
                >
                    <ThumbsUp size={14} />
                </button>
                <button
                    onClick={() => handleQuickFeedback(false)}
                    disabled={submitting}
                    className={`p-1 rounded transition-colors ${isHelpful === false ? 'text-red-600 bg-red-50' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                    title="Not helpful - click to suggest correction"
                >
                    <ThumbsDown size={14} />
                </button>

                {isExpanded && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-72">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-700">Suggest a better response</span>
                            <button onClick={() => setIsExpanded(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={14} />
                            </button>
                        </div>
                        <textarea
                            value={correction}
                            onChange={(e) => setCorrection(e.target.value)}
                            placeholder="What should the bot have said?"
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded text-black resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                            rows={2}
                        />
                        <button
                            onClick={handleSubmitDetailed}
                            disabled={submitting}
                            className="mt-2 w-full px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Submit
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Full expanded view
    return (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Rate this response</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleQuickFeedback(true)}
                        className={`p-1.5 rounded-lg transition-colors ${isHelpful === true ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-green-600 hover:bg-green-100'
                            }`}
                    >
                        <ThumbsUp size={16} />
                    </button>
                    <button
                        onClick={() => handleQuickFeedback(false)}
                        className={`p-1.5 rounded-lg transition-colors ${isHelpful === false ? 'text-red-600 bg-red-100' : 'text-gray-400 hover:text-red-600 hover:bg-red-100'
                            }`}
                    >
                        <ThumbsDown size={16} />
                    </button>
                </div>
            </div>

            {/* Star Rating */}
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => setRating(star)}
                        className="p-0.5 transition-colors"
                    >
                        <Star
                            size={18}
                            className={star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                        />
                    </button>
                ))}
                <span className="text-xs text-gray-400 ml-2">
                    {rating > 0 ? `${rating}/5` : 'Click to rate'}
                </span>
            </div>

            {/* Correction Input */}
            <div>
                <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                    <Edit2 size={12} />
                    Suggest correction (optional)
                </label>
                <textarea
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                    placeholder="What should the bot have said instead?"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-black resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    rows={2}
                />
            </div>

            {/* Notes */}
            <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Additional notes</label>
                <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any context or observations..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
            </div>

            {/* Submit Button */}
            <button
                onClick={handleSubmitDetailed}
                disabled={submitting || (rating === 0 && isHelpful === null && !correction.trim())}
                className="w-full px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {submitting ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        Submitting...
                    </>
                ) : (
                    <>
                        <Send size={16} />
                        Submit Feedback
                    </>
                )}
            </button>
        </div>
    );
}
