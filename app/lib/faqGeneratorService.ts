import { supabase } from './supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.0-flash';

export interface GeneratedFAQ {
    question: string;
    answer: string;
    confidence: number;
}

export interface FAQGenerationResult {
    faqs: GeneratedFAQ[];
    sourceText: string;
    totalGenerated: number;
}

/**
 * Generate FAQ pairs from document text using AI
 */
export async function generateFAQsFromText(
    text: string,
    maxPairs: number = 5,
    categoryContext?: string
): Promise<FAQGenerationResult> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    // Truncate text if too long (keep first 8000 chars for context)
    const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...' : text;

    const systemPrompt = `You are an expert FAQ writer. Your task is to generate frequently asked questions (FAQs) based on the provided document content.

RULES:
1. Generate exactly ${maxPairs} question-answer pairs
2. Questions should be natural, like what a customer would actually ask
3. Answers should be concise but complete (2-4 sentences max)
4. Focus on the most important and useful information
5. Questions should start with "What", "How", "When", "Where", "Can I", etc.
6. Answers should be direct and helpful
${categoryContext ? `7. Context: This is for a ${categoryContext} knowledge base` : ''}

OUTPUT FORMAT: Return ONLY a valid JSON array with this structure:
[
  {"question": "...", "answer": "...", "confidence": 0.9},
  {"question": "...", "answer": "...", "confidence": 0.85}
]

The confidence score (0.0-1.0) indicates how confident you are that this Q&A is accurate based on the source material.`;

    const userPrompt = `Generate ${maxPairs} FAQ pairs from this document:\n\n${truncatedText}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: systemPrompt }] },
                        { role: 'model', parts: [{ text: 'I understand. I will generate FAQ pairs in JSON format.' }] },
                        { role: 'user', parts: [{ text: userPrompt }] }
                    ],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 2048,
                    },
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Parse JSON from response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error('[FAQGenerator] No JSON array found in response:', responseText);
            throw new Error('Failed to parse AI response');
        }

        const faqs: GeneratedFAQ[] = JSON.parse(jsonMatch[0]);

        // Validate and clean FAQs
        const validFaqs = faqs
            .filter(faq => faq.question && faq.answer)
            .map(faq => ({
                question: faq.question.trim(),
                answer: faq.answer.trim(),
                confidence: Math.min(1, Math.max(0, faq.confidence || 0.7)),
            }));

        console.log(`[FAQGenerator] Generated ${validFaqs.length} FAQs from ${text.length} chars of text`);

        return {
            faqs: validFaqs,
            sourceText: truncatedText,
            totalGenerated: validFaqs.length,
        };
    } catch (error) {
        console.error('[FAQGenerator] Error generating FAQs:', error);
        throw error;
    }
}

/**
 * Generate FAQs from a document by its ID
 */
export async function generateFAQsFromDocument(
    documentId: string | number,
    maxPairs: number = 5
): Promise<FAQGenerationResult> {
    // Fetch document content
    const { data: doc, error } = await supabase
        .from('documents')
        .select('content, category_id')
        .eq('id', documentId)
        .single();

    if (error || !doc) {
        throw new Error(`Document not found: ${documentId}`);
    }

    // Get category name for context
    let categoryName: string | undefined;
    if (doc.category_id) {
        const { data: category } = await supabase
            .from('knowledge_categories')
            .select('name')
            .eq('id', doc.category_id)
            .single();
        categoryName = category?.name;
    }

    return generateFAQsFromText(doc.content, maxPairs, categoryName);
}

/**
 * Save generated FAQs to the knowledge base
 */
export async function saveFAQsToKnowledge(
    faqs: GeneratedFAQ[],
    categoryId?: string
): Promise<{ success: boolean; savedCount: number }> {
    let savedCount = 0;

    for (const faq of faqs) {
        // Format as Q&A document
        const content = `Q: ${faq.question}\n\nA: ${faq.answer}`;

        const { error } = await supabase
            .from('documents')
            .insert({
                content,
                category_id: categoryId || null,
                metadata: {
                    type: 'faq',
                    source: 'ai_generated',
                    confidence: faq.confidence,
                    question: faq.question,
                    answer: faq.answer,
                },
            });

        if (!error) {
            savedCount++;
        } else {
            console.error('[FAQGenerator] Error saving FAQ:', error);
        }
    }

    return { success: savedCount > 0, savedCount };
}
