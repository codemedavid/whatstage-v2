import { NextResponse } from 'next/server';
import {
    generateFAQsFromText,
    generateFAQsFromDocument,
    saveFAQsToKnowledge
} from '@/app/lib/faqGeneratorService';

/**
 * POST /api/knowledge/generate-faq
 * 
 * Generate FAQ pairs from text or document
 * 
 * Body options:
 * 1. { text: string, maxPairs?: number } - Generate from raw text
 * 2. { documentId: string, maxPairs?: number } - Generate from existing document
 * 3. { faqs: array, categoryId?: string, save: true } - Save generated FAQs
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, documentId, maxPairs = 5, faqs, categoryId, save } = body;

        // Mode 1: Save FAQs to knowledge base
        if (save && Array.isArray(faqs)) {
            const result = await saveFAQsToKnowledge(faqs, categoryId);
            return NextResponse.json(result);
        }

        // Mode 2: Generate from document ID
        if (documentId) {
            const result = await generateFAQsFromDocument(documentId, maxPairs);
            return NextResponse.json(result);
        }

        // Mode 3: Generate from raw text
        if (text) {
            if (text.length < 100) {
                return NextResponse.json(
                    { error: 'Text is too short. Please provide at least 100 characters.' },
                    { status: 400 }
                );
            }

            const result = await generateFAQsFromText(text, maxPairs);
            return NextResponse.json(result);
        }

        return NextResponse.json(
            { error: 'Either text or documentId is required' },
            { status: 400 }
        );

    } catch (error) {
        console.error('[GenerateFAQ] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate FAQs' },
            { status: 500 }
        );
    }
}
