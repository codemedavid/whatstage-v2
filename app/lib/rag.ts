import { supabase } from './supabase';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { semanticChunk, shouldUseSemanticChunking } from './semanticChunker';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';

async function getEmbedding(text: string, inputType: 'query' | 'passage'): Promise<number[]> {
    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text],
            input_type: inputType,
            encoding_format: 'float',
            truncate: 'END',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Embedding error:', errorText);
        throw new Error(`Embedding API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
}

// Enriched metadata interface for documents
export interface DocumentMetadata {
    categoryId?: string;
    sourceType?: string;      // 'user_upload', 'setup_wizard', 'faq', 'api_import'
    confidenceScore?: number; // 0.0 - 1.0
    verifiedAt?: string;      // ISO date string
    expiresAt?: string;       // ISO date string
    [key: string]: unknown;   // Allow additional custom fields
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addDocument(content: string, metadata: DocumentMetadata = {}) {
    try {
        const { categoryId, sourceType, confidenceScore, verifiedAt, expiresAt, ...restMetadata } = metadata;

        let chunks: string[];
        let chunkingMethod: string;

        // Try semantic chunking first if text has structure
        if (shouldUseSemanticChunking(content)) {
            chunks = semanticChunk(content, {
                maxChunkSize: 1500,
                overlapSentences: 2,
                preserveParagraphs: true,
            });
            chunkingMethod = 'semantic';
            console.log(`[RAG] Using semantic chunking: ${chunks.length} chunks`);
        } else {
            // Fallback to character-based splitting for unstructured text
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200,
            });
            const docs = await splitter.createDocuments([content]);
            chunks = docs.map(doc => doc.pageContent);
            chunkingMethod = 'character';
            console.log(`[RAG] Using character chunking: ${chunks.length} chunks`);
        }

        console.log(`[RAG] Adding document with ${chunks.length} chunks (${chunkingMethod})`);

        for (const chunkContent of chunks) {
            const embedding = await getEmbedding(chunkContent, 'passage');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insertData: any = {
                content: chunkContent,
                metadata: { ...restMetadata, chunkingMethod },
                embedding: embedding,
            };

            // Add optional enriched metadata fields
            if (categoryId) insertData.category_id = categoryId;
            if (sourceType) insertData.source_type = sourceType;
            if (confidenceScore !== undefined) insertData.confidence_score = confidenceScore;
            if (verifiedAt) insertData.verified_at = verifiedAt;
            if (expiresAt) insertData.expires_at = expiresAt;

            let { error } = await supabase.from('documents').insert(insertData);

            // Retry without new columns if they don't exist (backward compatibility)
            if (error && (error.message?.includes('category_id') ||
                error.message?.includes('source_type') ||
                error.message?.includes('confidence_score') ||
                error.message?.includes('verified_at') ||
                error.message?.includes('expires_at'))) {
                // Strip out columns that may not exist
                delete insertData.category_id;
                delete insertData.source_type;
                delete insertData.confidence_score;
                delete insertData.verified_at;
                delete insertData.expires_at;
                const retryResult = await supabase.from('documents').insert(insertData);
                error = retryResult.error;
            }

            if (error) {
                console.error('Error inserting chunk:', error);
                throw error;
            }

            console.log(`[RAG] Inserted (${chunkingMethod}): "${chunkContent.substring(0, 50)}..."`);
        }

        return true;
    } catch (error) {
        console.error('Error adding document:', error);
        return false;
    }
}

// ... (add definition at the top or here if possible) 
// Actually I need to add the interface definition.
// I'll add it before searchDocuments

import { rerankDocuments, StoredDocument as RerankStoredDocument, RankedDocument } from './reranker';

interface StoredDocument {
    id: number;
    content: string;
    metadata: Record<string, unknown>;
    embedding?: number[];
    source?: string;
    similarity?: number;
}

// Configuration for hybrid search weighting
interface SearchConfig {
    semanticWeight: number;   // Weight for semantic search results
    keywordWeight: number;    // Weight for keyword search results
    recencyWeight: number;    // Weight for recent documents
    similarityThreshold: number; // Minimum similarity for semantic search
    enableReranking: boolean;    // Enable re-ranking layer
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
    semanticWeight: 0.6,
    keywordWeight: 0.25,
    recencyWeight: 0.15,
    similarityThreshold: 0.35, // Increased from 0.20 for better precision
    enableReranking: true,
};

/**
 * Enhanced retrieval with re-ranking and hybrid search weighting
 * Strategy: 
 * 1. Semantic search with embeddings
 * 2. Keyword search for specific query types
 * 3. Recent documents as fallback
 * 4. Apply hybrid weights and re-rank results
 */
export async function searchDocuments(
    query: string,
    limit: number = 5,
    config: Partial<SearchConfig> = {}
) {
    const cfg = { ...DEFAULT_SEARCH_CONFIG, ...config };

    try {
        console.log(`[RAG] Searching for: "${query}" (threshold: ${cfg.similarityThreshold})`);

        // STRATEGY 1: Semantic search with embedding
        let semanticDocs: StoredDocument[] = [];
        try {
            const queryEmbedding = await getEmbedding(query, 'query');

            const { data: matchedDocs, error: matchError } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: cfg.similarityThreshold,
                match_count: limit * 2, // Get more candidates for re-ranking
            });

            if (!matchError && matchedDocs) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                semanticDocs = (matchedDocs as any[]).map(doc => ({
                    ...doc,
                    source: 'semantic',
                    similarity: doc.similarity || 0,
                }));
            }
        } catch (embError) {
            console.error('Embedding search failed:', embError);
        }

        // STRATEGY 2: Keyword search for price-related queries
        let keywordDocs: StoredDocument[] = [];
        const lowerQuery = query.toLowerCase();
        const isPriceQuery = lowerQuery.includes('price') ||
            lowerQuery.includes('cost') ||
            lowerQuery.includes('magkano') ||
            lowerQuery.includes('how much') ||
            lowerQuery.includes('hm') ||
            lowerQuery.includes('presyo');

        if (isPriceQuery) {
            const { data: priceDocs, error: priceError } = await supabase
                .from('documents')
                .select('id, content, metadata')
                .or('content.ilike.%price%,content.ilike.%payment%,content.ilike.%magkano%')
                .limit(5);

            if (!priceError && priceDocs) {
                keywordDocs = priceDocs.map(doc => ({
                    ...doc,
                    source: 'keyword',
                    similarity: 0.5, // Default similarity for keyword matches
                })) as StoredDocument[];
            }
        }

        // STRATEGY 3: Recent documents as fallback
        let recentDocs: StoredDocument[] = [];
        const { data: recentData, error: recentError } = await supabase
            .from('documents')
            .select('id, content, metadata')
            .order('id', { ascending: false })
            .limit(3);

        if (!recentError && recentData) {
            recentDocs = recentData.map(doc => ({
                ...doc,
                source: 'recent',
                similarity: 0.3, // Lower default for recency-based
            })) as StoredDocument[];
        }

        // Combine all results and deduplicate
        const allDocs: StoredDocument[] = [];
        const seenIds = new Set<number>();

        // Apply weighted scoring and combine
        const addWithWeight = (docs: StoredDocument[], weight: number) => {
            for (const doc of docs) {
                if (!seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    allDocs.push({
                        ...doc,
                        // Apply weight to similarity score
                        similarity: (doc.similarity || 0.5) * weight,
                    });
                }
            }
        };

        addWithWeight(semanticDocs, cfg.semanticWeight);
        addWithWeight(keywordDocs, cfg.keywordWeight);
        addWithWeight(recentDocs, cfg.recencyWeight);

        // Log pre-rerank results
        console.log(`[RAG] Found ${allDocs.length} documents before re-ranking`);

        if (allDocs.length === 0) {
            console.log('[RAG] No documents found');
            return '';
        }

        // Apply re-ranking if enabled
        let finalDocs: (StoredDocument | RankedDocument)[] = allDocs;

        if (cfg.enableReranking && allDocs.length > 1) {
            try {
                const reranked = await rerankDocuments(
                    query,
                    allDocs as RerankStoredDocument[],
                    limit
                );
                finalDocs = reranked;
                console.log(`[RAG] Re-ranked ${reranked.length} documents`);
            } catch (rerankError) {
                console.error('[RAG] Re-ranking failed, using original order:', rerankError);
            }
        }

        // Log final results
        finalDocs.slice(0, 5).forEach((doc, i) => {
            const score = 'relevanceScore' in doc ? doc.relevanceScore : doc.similarity;
            console.log(`[RAG] Doc ${i + 1} [${doc.source}] (score: ${score?.toFixed(3)}): ${doc.content?.substring(0, 60)}...`);
        });

        // Return combined content
        return finalDocs
            .slice(0, limit)
            .map(doc => doc.content)
            .join('\n\n');

    } catch (error) {
        console.error('Error in RAG search:', error);
        // Last resort: just get any documents we have
        try {
            const { data: fallbackDocs } = await supabase
                .from('documents')
                .select('content')
                .limit(3);

            if (fallbackDocs && fallbackDocs.length > 0) {
                console.log('[RAG] Using fallback - returning all docs');
                return fallbackDocs.map(d => d.content).join('\n\n');
            }
        } catch (e) {
            console.error('Fallback also failed:', e);
        }
        return '';
    }
}
