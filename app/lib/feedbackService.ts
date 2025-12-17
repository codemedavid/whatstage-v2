import { supabase } from './supabase';

export interface FeedbackSubmission {
    senderId: string;
    botMessage: string;
    userMessage?: string;
    rating?: number;
    isHelpful?: boolean;
    correction?: string;
    feedbackNotes?: string;
    agentId?: string;
}

export interface FeedbackRecord {
    id: string;
    sender_id: string;
    bot_message: string;
    user_message?: string;
    rating?: number;
    is_helpful?: boolean;
    correction?: string;
    feedback_notes?: string;
    feedback_type: 'rating' | 'correction' | 'both';
    agent_id?: string;
    created_at: string;
}

export interface FeedbackStats {
    totalFeedback: number;
    helpfulCount: number;
    notHelpfulCount: number;
    avgRating: number;
    correctionsCount: number;
    helpfulRate: number;
}

/**
 * Submit feedback for a bot response
 */
export async function submitFeedback(feedback: FeedbackSubmission): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        // Determine feedback type
        let feedbackType: 'rating' | 'correction' | 'both' = 'rating';
        if (feedback.correction && (feedback.rating || feedback.isHelpful !== undefined)) {
            feedbackType = 'both';
        } else if (feedback.correction) {
            feedbackType = 'correction';
        }

        const { data, error } = await supabase
            .from('response_feedback')
            .insert({
                sender_id: feedback.senderId,
                bot_message: feedback.botMessage,
                user_message: feedback.userMessage || null,
                rating: feedback.rating || null,
                is_helpful: feedback.isHelpful ?? null,
                correction: feedback.correction || null,
                feedback_notes: feedback.feedbackNotes || null,
                feedback_type: feedbackType,
                agent_id: feedback.agentId || null,
            })
            .select('id')
            .single();

        if (error) {
            console.error('[FeedbackService] Error submitting feedback:', error);
            return { success: false, error: error.message };
        }

        console.log('[FeedbackService] Feedback submitted:', data.id);
        return { success: true, id: data.id };

    } catch (error) {
        console.error('[FeedbackService] Error:', error);
        return { success: false, error: 'Failed to submit feedback' };
    }
}

/**
 * Get feedback for a specific sender
 */
export async function getFeedbackForSender(senderId: string, limit: number = 20): Promise<FeedbackRecord[]> {
    const { data, error } = await supabase
        .from('response_feedback')
        .select('*')
        .eq('sender_id', senderId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[FeedbackService] Error fetching feedback:', error);
        return [];
    }

    return data || [];
}

/**
 * Get aggregated feedback statistics
 */
export async function getFeedbackStats(): Promise<FeedbackStats> {
    const { data, error } = await supabase
        .from('response_feedback')
        .select('rating, is_helpful, correction');

    if (error || !data) {
        console.error('[FeedbackService] Error fetching stats:', error);
        return {
            totalFeedback: 0,
            helpfulCount: 0,
            notHelpfulCount: 0,
            avgRating: 0,
            correctionsCount: 0,
            helpfulRate: 0,
        };
    }

    const totalFeedback = data.length;
    const helpfulCount = data.filter(f => f.is_helpful === true).length;
    const notHelpfulCount = data.filter(f => f.is_helpful === false).length;
    const ratingsWithValue = data.filter(f => f.rating != null);
    const avgRating = ratingsWithValue.length > 0
        ? ratingsWithValue.reduce((sum, f) => sum + (f.rating || 0), 0) / ratingsWithValue.length
        : 0;
    const correctionsCount = data.filter(f => f.correction != null).length;
    const helpfulRate = (helpfulCount + notHelpfulCount) > 0
        ? (helpfulCount / (helpfulCount + notHelpfulCount)) * 100
        : 0;

    return {
        totalFeedback,
        helpfulCount,
        notHelpfulCount,
        avgRating: Math.round(avgRating * 10) / 10,
        correctionsCount,
        helpfulRate: Math.round(helpfulRate),
    };
}

/**
 * Get recent corrections for training/review
 */
export async function getRecentCorrections(limit: number = 50): Promise<FeedbackRecord[]> {
    const { data, error } = await supabase
        .from('response_feedback')
        .select('*')
        .not('correction', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[FeedbackService] Error fetching corrections:', error);
        return [];
    }

    return data || [];
}
