/**
 * Re-ranker Module
 * 
 * Scores retrieved documents by relevance before sending to LLM
 * Uses cross-encoder via NVIDIA API with fallback to keyword overlap scoring
 */

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

export interface StoredDocument {
    id: number;
    content: string;
    metadata: Record<string, unknown>;
    source?: string;
    similarity?: number;
}

export interface RankedDocument extends StoredDocument {
    relevanceScore: number;
    rankingMethod: 'cross-encoder' | 'keyword' | 'similarity';
}

/**
 * Calculate keyword overlap score between query and document
 * Returns a normalized score between 0 and 1
 */
function calculateKeywordScore(query: string, content: string): number {
    const queryTokens = query.toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 2); // Ignore very short words

    const contentLower = content.toLowerCase();

    if (queryTokens.length === 0) return 0;

    let matchCount = 0;
    for (const token of queryTokens) {
        if (contentLower.includes(token)) {
            matchCount++;
        }
    }

    return matchCount / queryTokens.length;
}

/**
 * Calculate phrase match bonus
 * Rewards documents that contain the exact query phrase
 */
function calculatePhraseBonus(query: string, content: string): number {
    const queryLower = query.toLowerCase().trim();
    const contentLower = content.toLowerCase();

    // Exact phrase match
    if (contentLower.includes(queryLower)) {
        return 0.3;
    }

    // Check for significant n-grams (3+ words together)
    const words = queryLower.split(/\s+/);
    if (words.length >= 3) {
        for (let i = 0; i <= words.length - 3; i++) {
            const ngram = words.slice(i, i + 3).join(' ');
            if (contentLower.includes(ngram)) {
                return 0.15;
            }
        }
    }

    return 0;
}

/**
 * Calculate semantic relevance indicators
 * Looks for question-answer patterns and topic markers
 */
function calculateSemanticIndicators(query: string, content: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    let score = 0;

    // Question-answer matching
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
    const isQuestion = questionWords.some(w => queryLower.startsWith(w) || queryLower.includes(`${w} `));

    if (isQuestion) {
        // Boost Q&A formatted content
        if (contentLower.includes('q:') || contentLower.includes('a:') ||
            contentLower.includes('question:') || contentLower.includes('answer:')) {
            score += 0.1;
        }
    }

    // Price/cost query handling
    const priceTerms = ['price', 'cost', 'magkano', 'how much', 'presyo', 'payment', 'fee'];
    const isPriceQuery = priceTerms.some(t => queryLower.includes(t));

    if (isPriceQuery) {
        // Boost documents mentioning prices/numbers
        if (/\$?\d+/.test(content) || priceTerms.some(t => contentLower.includes(t))) {
            score += 0.15;
        }
    }

    return score;
}

/**
 * Fallback re-ranking using keyword overlap and heuristics
 */
function fallbackRerank(query: string, documents: StoredDocument[]): RankedDocument[] {
    return documents.map(doc => {
        const keywordScore = calculateKeywordScore(query, doc.content);
        const phraseBonus = calculatePhraseBonus(query, doc.content);
        const semanticBonus = calculateSemanticIndicators(query, doc.content);

        // Combine scores with similarity if available
        const baseScore = doc.similarity || 0.5;
        const relevanceScore = Math.min(1,
            (baseScore * 0.4) +
            (keywordScore * 0.3) +
            phraseBonus +
            semanticBonus
        );

        return {
            ...doc,
            relevanceScore,
            rankingMethod: 'keyword' as const,
        };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Try to use NVIDIA's reranking API (cross-encoder)
 * Falls back to keyword-based ranking if unavailable
 */
async function crossEncoderRerank(
    query: string,
    documents: StoredDocument[]
): Promise<RankedDocument[] | null> {
    if (!NVIDIA_API_KEY) {
        console.log('[Reranker] No API key, using fallback');
        return null;
    }

    try {
        // NVIDIA's reranking endpoint
        const response = await fetch('https://integrate.api.nvidia.com/v1/ranking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'nvidia/nv-rerankqa-mistral-4b-v3',
                query: { text: query },
                passages: documents.map((doc, idx) => ({
                    text: doc.content,
                    id: idx.toString(),
                })),
            }),
        });

        if (!response.ok) {
            console.log('[Reranker] API error, using fallback:', response.status);
            return null;
        }

        const data = await response.json();

        // Map rankings back to documents
         
        const rankings = data.rankings as Array<{ id: string; logit: number }>;

        return rankings.map(rank => {
            const docIndex = parseInt(rank.id);
            const doc = documents[docIndex];
            return {
                ...doc,
                relevanceScore: Math.max(0, Math.min(1, (rank.logit + 5) / 10)), // Normalize logit to 0-1
                rankingMethod: 'cross-encoder' as const,
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);

    } catch (error) {
        console.error('[Reranker] Cross-encoder error:', error);
        return null;
    }
}

/**
 * Re-rank documents by relevance to query
 * 
 * @param query - The search query
 * @param documents - Candidate documents from retrieval
 * @param topK - Number of top documents to return (default: all)
 * @returns Documents sorted by relevance score
 */
export async function rerankDocuments(
    query: string,
    documents: StoredDocument[],
    topK?: number
): Promise<RankedDocument[]> {
    if (documents.length === 0) {
        return [];
    }

    console.log(`[Reranker] Re-ranking ${documents.length} documents for query: "${query}"`);

    // Try cross-encoder first
    let ranked = await crossEncoderRerank(query, documents);

    // Fall back to keyword-based ranking
    if (!ranked) {
        ranked = fallbackRerank(query, documents);
    }

    // Log top results
    ranked.slice(0, 3).forEach((doc, i) => {
        console.log(`[Reranker] #${i + 1} (${doc.rankingMethod}, score: ${doc.relevanceScore.toFixed(3)}): "${doc.content.substring(0, 60)}..."`);
    });

    // Return top K if specified
    if (topK && topK < ranked.length) {
        return ranked.slice(0, topK);
    }

    return ranked;
}
