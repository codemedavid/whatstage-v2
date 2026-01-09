import { supabase } from './supabase';
import { supabaseAdmin } from './supabaseAdmin';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { semanticChunk, shouldUseSemanticChunking } from './semanticChunker';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';
const EXPECTED_EMBEDDING_DIMENSIONS = 1024;

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

// ==================== UNIFIED SEARCH ====================

/** Result from unified search across documents and media */
export interface UnifiedSearchResult {
    sourceType: 'document' | 'media';
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
    // Media-specific fields (null for documents)
    mediaId?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'file';
    mediaTitle?: string;
    mediaThumbnail?: string;
}

/** Media match result for chatbot suggestions */
export interface MediaMatch {
    id: string;
    title: string;
    description: string;
    media_url: string;
    media_type: 'image' | 'video' | 'audio' | 'file';
    thumbnail_url: string | null;
    similarity: number;
    keywords?: string[];
    trigger_phrases?: string[];
}

/** Options for unified search */
export interface UnifiedSearchOptions {
    includeMedia?: boolean;
    documentLimit?: number;
    mediaLimit?: number;
    documentThreshold?: number;
    mediaThreshold?: number;
    userId?: string;  // Filter results to specific user
}

/**
 * Unified search across documents AND media
 * Returns combined results for RAG context and media suggestions
 */
export async function searchAllSources(
    query: string,
    options: UnifiedSearchOptions = {}
): Promise<{
    documents: string;
    relevantMedia: MediaMatch[];
    allResults: UnifiedSearchResult[];
}> {
    const {
        includeMedia = true,
        documentLimit = 5,
        mediaLimit = 3,
        documentThreshold = 0.35,
        mediaThreshold = 0.45,
        userId,
    } = options;

    try {
        console.log(`[RAG] Unified search for: "${query.substring(0, 50)}..." userId: ${userId || 'none'}`);

        // If userId is provided, use user-filtered search
        if (userId) {
            // Direct query with user filter for documents
            const queryEmbedding = await getEmbedding(query, 'query');

            // Search documents filtered by user_id
            const { data: userDocs, error: docError } = await supabaseAdmin
                .from('documents')
                .select('id, content, metadata, embedding')
                .eq('user_id', userId)
                .limit(documentLimit);  // Fetch exact limit to reduce JS work

            if (docError) {
                console.error('[RAG] User document search error:', docError);
            }

            // Calculate similarity scores for user's documents
            let documentResults: UnifiedSearchResult[] = [];
            const EPSILON = 1e-10; // Guard against division by zero

            // Track mismatched embeddings for diagnostics
            let mismatchedCount = 0;

            if (userDocs && userDocs.length > 0) {
                documentResults = userDocs
                    .map(doc => {
                        // Calculate cosine similarity if embedding exists
                        let similarity = 0.5; // Default
                        if (doc.embedding && queryEmbedding) {
                            // Skip if embedding lengths mismatch (corrupted data)
                            if (doc.embedding.length !== queryEmbedding.length) {
                                mismatchedCount++;
                                // Only log first few to avoid spam
                                if (mismatchedCount <= 3) {
                                    console.warn(`[RAG] Embedding mismatch doc=${doc.id}: ${doc.embedding.length} dims (expected ${EXPECTED_EMBEDDING_DIMENSIONS}). Run: npx ts-node scripts/reembed-documents.ts --user-id ${userId}`);
                                }
                                return {
                                    sourceType: 'document' as const,
                                    content: doc.content,
                                    similarity: 0, // Skip this document in filtering
                                    metadata: doc.metadata || {},
                                };
                            }

                            const dotProduct = queryEmbedding.reduce((sum, val, i) => sum + val * doc.embedding[i], 0);
                            const magA = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
                            const magB = Math.sqrt(doc.embedding.reduce((sum: number, val: number) => sum + val * val, 0));

                            // Guard against zero magnitude (corrupted all-zero embeddings)
                            if (magA <= EPSILON || magB <= EPSILON) {
                                similarity = 0;
                            } else {
                                similarity = dotProduct / (magA * magB);
                            }
                        }
                        return {
                            sourceType: 'document' as const,
                            content: doc.content,
                            similarity,
                            metadata: doc.metadata || {},
                        };
                    })
                    .filter(d => d.similarity >= documentThreshold)
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, documentLimit);
            }

            // Log summary of mismatched embeddings
            if (mismatchedCount > 0) {
                console.warn(`[RAG] ⚠️ ${mismatchedCount} documents have mismatched embeddings and were skipped. Run re-embed script to fix.`);
            }

            const documents = documentResults.map(d => d.content).join('\n\n');

            console.log(`[RAG] User-filtered results: ${documentResults.length} docs for user ${userId}`);

            // TODO: Also filter media by user_id when media supports it
            return { documents, relevantMedia: [], allResults: documentResults };
        }

        // Generate query embedding once
        const queryEmbedding = await getEmbedding(query, 'query');

        // Call unified search RPC with user filtering
        const { data, error } = await supabase.rpc('search_all_sources', {
            query_embedding: queryEmbedding,
            doc_threshold: documentThreshold,
            media_threshold: includeMedia ? mediaThreshold : 1.0,
            doc_count: documentLimit,
            media_count: includeMedia ? mediaLimit : 0,
            filter_user_id: userId || null, // Pass user_id for multi-tenant filtering
        });

        if (error) {
            console.error('[RAG] Unified search error:', error);
            // Fallback to standard document search (with user filtering)
            const fallbackDocs = await searchDocuments(query, documentLimit, {}, userId);
            return { documents: fallbackDocs, relevantMedia: [], allResults: [] };
        }

        if (!data || data.length === 0) {
            console.log('[RAG] No unified results found');
            return { documents: '', relevantMedia: [], allResults: [] };
        }

        // Parse results
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allResults: UnifiedSearchResult[] = data.map((row: any) => ({
            sourceType: row.source_type as 'document' | 'media',
            content: row.content,
            similarity: row.similarity,
            metadata: row.metadata || {},
            mediaId: row.media_id || undefined,
            mediaUrl: row.media_url || undefined,
            mediaType: row.media_type as 'image' | 'video' | 'audio' | 'file' | undefined,
            mediaTitle: row.media_title || undefined,
            mediaThumbnail: row.media_thumbnail || undefined,
        }));

        // Separate documents and media
        const documentResults = allResults.filter(r => r.sourceType === 'document');
        const mediaResults = allResults.filter(r => r.sourceType === 'media');

        // Combine document content for RAG context
        const documents = documentResults
            .slice(0, documentLimit)
            .map(d => d.content)
            .join('\n\n');

        // Map media results to MediaMatch format
        const relevantMedia: MediaMatch[] = mediaResults
            .slice(0, mediaLimit)
            .map(m => ({
                id: m.mediaId!,
                title: m.mediaTitle || 'Untitled',
                description: m.content,
                media_url: m.mediaUrl!,
                media_type: m.mediaType!,
                thumbnail_url: m.mediaThumbnail || null,
                similarity: m.similarity,
                keywords: (m.metadata?.keywords as string[]) || [],
                trigger_phrases: (m.metadata?.trigger_phrases as string[]) || [],
            }));

        console.log(`[RAG] Unified results: ${documentResults.length} docs, ${mediaResults.length} media`);

        if (relevantMedia.length > 0) {
            console.log(`[RAG] Top media match: "${relevantMedia[0].title}" (${relevantMedia[0].similarity.toFixed(3)})`);
        }

        return { documents, relevantMedia, allResults };
    } catch (err) {
        console.error('[RAG] Unified search failed:', err);
        const fallbackDocs = await searchDocuments(query, options.documentLimit || 5, {}, userId);
        return { documents: fallbackDocs, relevantMedia: [], allResults: [] };
    }
}

// Enriched metadata interface for documents
export interface DocumentMetadata {
    categoryId?: string;
    userId?: string;          // User who owns this document
    sourceType?: string;      // 'user_upload', 'setup_wizard', 'faq', 'api_import'
    confidenceScore?: number; // 0.0 - 1.0
    verifiedAt?: string;      // ISO date string
    expiresAt?: string;       // ISO date string
    [key: string]: unknown;   // Allow additional custom fields
}



export async function addDocument(content: string, metadata: DocumentMetadata = {}) {
    try {
        const { categoryId, userId, sourceType, confidenceScore, verifiedAt, expiresAt, ...restMetadata } = metadata;

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

            // Validate embedding dimensions before storing
            if (embedding.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
                console.error(`[RAG] ❌ Embedding dimension mismatch! Got ${embedding.length}, expected ${EXPECTED_EMBEDDING_DIMENSIONS}. Skipping chunk.`);
                continue;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insertData: any = {
                content: chunkContent,
                metadata: { ...restMetadata, chunkingMethod },
                embedding: embedding,
            };

            // Add optional enriched metadata fields
            if (userId) insertData.user_id = userId;
            if (categoryId) insertData.category_id = categoryId;
            if (sourceType) insertData.source_type = sourceType;
            if (confidenceScore !== undefined) insertData.confidence_score = confidenceScore;
            if (verifiedAt) insertData.verified_at = verifiedAt;
            if (expiresAt) insertData.expires_at = expiresAt;

            // Use supabaseAdmin when userId is explicitly provided (server-side context)
            // This bypasses RLS since the service role is being used
            const dbClient = userId ? supabaseAdmin : supabase;

            let { error } = await dbClient.from('documents').insert(insertData);

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
                const retryResult = await dbClient.from('documents').insert(insertData);
                error = retryResult.error;
            }

            if (error) {
                console.error('[RAG] Error inserting chunk:', error);
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
 * @param userId - Optional user ID to filter documents for multi-tenancy
 */
export async function searchDocuments(
    query: string,
    limit: number = 5,
    config: Partial<SearchConfig> = {},
    userId?: string
) {
    const cfg = { ...DEFAULT_SEARCH_CONFIG, ...config };
    // Use admin client when filtering by userId to bypass RLS
    const dbClient = userId ? supabaseAdmin : supabase;

    try {
        console.log(`[RAG] Searching for: "${query}" (threshold: ${cfg.similarityThreshold}, userId: ${userId || 'none'})`);

        // STRATEGY 1: Semantic search with embedding
        let semanticDocs: StoredDocument[] = [];
        try {
            const queryEmbedding = await getEmbedding(query, 'query');

            // Pass filter_user_id for multi-tenant isolation
            const { data: matchedDocs, error: matchError } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: cfg.similarityThreshold,
                match_count: limit * 2, // Get more candidates for re-ranking
                filter_user_id: userId || null, // Filter by user for multi-tenancy
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
            let keywordQuery = dbClient
                .from('documents')
                .select('id, content, metadata')
                .or('content.ilike.%price%,content.ilike.%payment%,content.ilike.%magkano%');

            // Filter by user_id for multi-tenancy
            if (userId) {
                keywordQuery = keywordQuery.eq('user_id', userId);
            }

            const { data: priceDocs, error: priceError } = await keywordQuery.limit(5);

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
        let recentQuery = dbClient
            .from('documents')
            .select('id, content, metadata')
            .order('id', { ascending: false });

        // Filter by user_id for multi-tenancy
        if (userId) {
            recentQuery = recentQuery.eq('user_id', userId);
        }

        const { data: recentData, error: recentError } = await recentQuery.limit(3);

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
        // Last resort: just get any documents we have (filtered by user if provided)
        try {
            let fallbackQuery = dbClient
                .from('documents')
                .select('content');

            if (userId) {
                fallbackQuery = fallbackQuery.eq('user_id', userId);
            }

            const { data: fallbackDocs } = await fallbackQuery.limit(3);

            if (fallbackDocs && fallbackDocs.length > 0) {
                console.log(`[RAG] Using fallback - returning docs for user ${userId || 'all'}`);
                return fallbackDocs.map(d => d.content).join('\n\n');
            }
        } catch (e) {
            console.error('Fallback also failed:', e);
        }
        return '';
    }
}
