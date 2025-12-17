import { NextResponse } from 'next/server';
import { submitFeedback, getFeedbackStats, getRecentCorrections } from '@/app/lib/feedbackService';

/**
 * POST /api/feedback
 * Submit feedback for a bot response
 * 
 * Body: {
 *   senderId: string (required)
 *   botMessage: string (required)
 *   userMessage?: string
 *   rating?: number (1-5)
 *   isHelpful?: boolean
 *   correction?: string
 *   feedbackNotes?: string
 *   agentId?: string
 * }
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { senderId, botMessage, userMessage, rating, isHelpful, correction, feedbackNotes, agentId } = body;

        if (!senderId || !botMessage) {
            return NextResponse.json(
                { error: 'senderId and botMessage are required' },
                { status: 400 }
            );
        }

        // Validate rating if provided
        if (rating !== undefined && (rating < 1 || rating > 5)) {
            return NextResponse.json(
                { error: 'Rating must be between 1 and 5' },
                { status: 400 }
            );
        }

        const result = await submitFeedback({
            senderId,
            botMessage,
            userMessage,
            rating,
            isHelpful,
            correction,
            feedbackNotes,
            agentId,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: result.id });

    } catch (error) {
        console.error('[Feedback API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to submit feedback' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/feedback?type=stats|corrections
 * Get feedback statistics or recent corrections
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'stats';

        if (type === 'corrections') {
            const corrections = await getRecentCorrections();
            return NextResponse.json(corrections);
        }

        // Default: return stats
        const stats = await getFeedbackStats();
        return NextResponse.json(stats);

    } catch (error) {
        console.error('[Feedback API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch feedback data' },
            { status: 500 }
        );
    }
}
