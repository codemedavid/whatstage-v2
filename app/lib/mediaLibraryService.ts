/**
 * Media Library Service
 * 
 * Handles media management, semantic search, and AI-driven media suggestions.
 * Uses NVIDIA embeddings for semantic similarity matching.
 */

import { supabase } from './supabase';
import { withRetry, isTransientError } from './retryHelper';
import {
    SIMILARITY_THRESHOLDS,
    PAGINATION_DEFAULTS,
    EmbeddingError,
    logMediaOperation,
} from './mediaUtils';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';

// ==================== TYPES ====================

export interface MediaCategory {
    id: string;
    name: string;
    description: string | null;
    color: string;
    created_at: string;
}

export interface AIMedia {
    id: string;
    title: string;
    description: string;
    keywords: string[] | null;
    category_id: string | null;
    media_url: string;
    media_type: 'image' | 'video' | 'audio' | 'file';
    thumbnail_url: string | null;
    trigger_phrases: string[] | null;
    is_active: boolean;
    usage_count: number;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
    category?: MediaCategory;
}

export interface MediaMatch extends AIMedia {
    similarity: number;
}

export interface MediaSearchResult {
    media: MediaMatch | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
}

// ==================== EMBEDDING FUNCTIONS ====================

/**
 * Generate embedding using NVIDIA API with retry logic
 */
async function getEmbedding(text: string): Promise<number[]> {
    if (!NVIDIA_API_KEY) {
        throw new EmbeddingError('NVIDIA_API_KEY not configured');
    }

    const generateEmbedding = async (): Promise<number[]> => {
        const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: [text],
                model: EMBEDDING_MODEL,
                encoding_format: 'float',
                input_type: 'passage',
                truncate: 'END',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[MediaLibrary] Embedding API error:', errorText);

            // Check if transient error for retry logic
            if (response.status >= 500 || response.status === 429) {
                const error = new Error(`Embedding API failed: ${response.status}`);
                (error as Error & { status: number }).status = response.status;
                throw error;
            }
            throw new EmbeddingError(`Embedding API failed: ${response.status}`);
        }

        const result = await response.json();
        return result.data[0].embedding;
    };

    // Use retry helper for transient errors
    return withRetry(generateEmbedding, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        shouldRetry: (error) => {
            const status = (error as Error & { status?: number }).status;
            return isTransientError(error) || status === 429 || (status !== undefined && status >= 500);
        },
    });
}

/**
 * Generate query embedding (different input_type for queries)
 */
async function getQueryEmbedding(text: string): Promise<number[]> {
    if (!NVIDIA_API_KEY) {
        throw new EmbeddingError('NVIDIA_API_KEY not configured');
    }

    const generateEmbedding = async (): Promise<number[]> => {
        const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: [text],
                model: EMBEDDING_MODEL,
                encoding_format: 'float',
                input_type: 'query',
                truncate: 'END',
            }),
        });

        if (!response.ok) {
            const status = response.status;
            if (status >= 500 || status === 429) {
                const error = new Error(`Embedding API failed: ${status}`);
                (error as Error & { status: number }).status = status;
                throw error;
            }
            throw new EmbeddingError(`Embedding API failed: ${status}`);
        }

        const result = await response.json();
        return result.data[0].embedding;
    };

    return withRetry(generateEmbedding, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        shouldRetry: (error) => {
            const status = (error as Error & { status?: number }).status;
            return isTransientError(error) || status === 429 || (status !== undefined && status >= 500);
        },
    });
}

// ==================== MEDIA CRUD ====================

/**
 * Add new media to the library
 */
export async function addMedia(params: {
    title: string;
    description: string;
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'audio' | 'file';
    categoryId?: string;
    keywords?: string[];
    triggerPhrases?: string[];
    thumbnailUrl?: string;
}): Promise<AIMedia | null> {
    const startTime = Date.now();

    try {
        // Generate embedding from description + title + keywords
        const embeddingText = `${params.title}. ${params.description}. ${(params.keywords || []).join(' ')}`;
        const embedding = await getEmbedding(embeddingText);

        const { data, error } = await supabase
            .from('ai_media')
            .insert({
                title: params.title,
                description: params.description,
                media_url: params.mediaUrl,
                media_type: params.mediaType,
                category_id: params.categoryId || null,
                keywords: params.keywords || [],
                trigger_phrases: params.triggerPhrases || [],
                thumbnail_url: params.thumbnailUrl || null,
                // Format as PostgreSQL vector string for proper pgvector storage
                embedding: `[${embedding.join(',')}]`,
            })
            .select()
            .single();

        if (error) {
            console.error('[MediaLibrary] Database error adding media:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        logMediaOperation({
            operation: 'add',
            mediaId: data.id,
            duration: Date.now() - startTime,
        });

        return data;
    } catch (err) {
        console.error('[MediaLibrary] Error in addMedia:', err);
        throw err;
    }
}

/**
 * Update existing media
 */
export async function updateMedia(
    id: string,
    params: Partial<{
        title: string;
        description: string;
        categoryId: string | null;
        keywords: string[];
        triggerPhrases: string[];
        isActive: boolean;
        thumbnailUrl: string | null;
    }>
): Promise<AIMedia | null> {
    try {
        const updates: Record<string, unknown> = {};

        if (params.title !== undefined) updates.title = params.title;
        if (params.description !== undefined) updates.description = params.description;
        if (params.categoryId !== undefined) updates.category_id = params.categoryId;
        if (params.keywords !== undefined) updates.keywords = params.keywords;
        if (params.triggerPhrases !== undefined) updates.trigger_phrases = params.triggerPhrases;
        if (params.isActive !== undefined) updates.is_active = params.isActive;
        if (params.thumbnailUrl !== undefined) updates.thumbnail_url = params.thumbnailUrl;

        // Re-generate embedding if content fields changed
        if (params.title !== undefined || params.description !== undefined || params.keywords !== undefined) {
            const { data: current } = await supabase
                .from('ai_media')
                .select('title, description, keywords')
                .eq('id', id)
                .single();

            if (current) {
                const newTitle = params.title ?? current.title;
                const newDesc = params.description ?? current.description;
                const newKeywords = params.keywords ?? current.keywords ?? [];
                const embeddingText = `${newTitle}. ${newDesc}. ${newKeywords.join(' ')}`;
                const embedding = await getEmbedding(embeddingText);
                // Format as PostgreSQL vector string for proper pgvector storage
                updates.embedding = `[${embedding.join(',')}]`;
            }
        }

        const { data, error } = await supabase
            .from('ai_media')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[MediaLibrary] Error updating media:', error);
            return null;
        }

        logMediaOperation({ operation: 'update', mediaId: id });
        return data;
    } catch (err) {
        console.error('[MediaLibrary] Error in updateMedia:', err);
        return null;
    }
}

/**
 * Delete media (soft delete by default)
 */
export async function deleteMedia(id: string, hard: boolean = false): Promise<boolean> {
    try {
        if (hard) {
            const { error } = await supabase
                .from('ai_media')
                .delete()
                .eq('id', id);

            if (!error) logMediaOperation({ operation: 'hard_delete', mediaId: id });
            return !error;
        } else {
            const { error } = await supabase
                .from('ai_media')
                .update({ is_active: false })
                .eq('id', id);

            if (!error) logMediaOperation({ operation: 'soft_delete', mediaId: id });
            return !error;
        }
    } catch (err) {
        console.error('[MediaLibrary] Error in deleteMedia:', err);
        return false;
    }
}

/**
 * Get a single media by ID
 */
export async function getMediaById(id: string): Promise<AIMedia | null> {
    try {
        const { data, error } = await supabase
            .from('ai_media')
            .select(`
                *,
                category:media_categories(*)
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('[MediaLibrary] Error fetching media by ID:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('[MediaLibrary] Error in getMediaById:', err);
        return null;
    }
}

/**
 * Get all media with optional filters and pagination
 */
export async function getAllMedia(params?: {
    categoryId?: string;
    isActive?: boolean;
    mediaType?: string;
    page?: number;
    limit?: number;
}): Promise<AIMedia[]> {
    try {
        const page = params?.page ?? 1;
        const limit = Math.min(params?.limit ?? PAGINATION_DEFAULTS.PAGE_SIZE, PAGINATION_DEFAULTS.MAX_PAGE_SIZE);
        const offset = (page - 1) * limit;

        let query = supabase
            .from('ai_media')
            .select(`
                *,
                category:media_categories(*)
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (params?.categoryId) {
            query = query.eq('category_id', params.categoryId);
        }
        if (params?.isActive !== undefined) {
            query = query.eq('is_active', params.isActive);
        }
        if (params?.mediaType) {
            query = query.eq('media_type', params.mediaType);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[MediaLibrary] Error fetching media:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[MediaLibrary] Error in getAllMedia:', err);
        return [];
    }
}

// ==================== SEMANTIC SEARCH ====================

/**
 * Search for relevant media using semantic similarity
 */
export async function searchRelevantMedia(
    query: string,
    limit: number = 3,
    threshold: number = SIMILARITY_THRESHOLDS.SEARCH_MIN
): Promise<MediaMatch[]> {
    try {
        // First, check for explicit trigger phrases
        const lowerQuery = query.toLowerCase();
        const { data: triggerMatches } = await supabase
            .from('ai_media')
            .select('*')
            .eq('is_active', true)
            .not('trigger_phrases', 'is', null);

        // Check if any trigger phrases match
        const exactMatch = triggerMatches?.find(media =>
            media.trigger_phrases?.some((phrase: string) =>
                lowerQuery.includes(phrase.toLowerCase())
            )
        );

        if (exactMatch) {
            console.log('[MediaLibrary] Trigger phrase match found:', exactMatch.title);
            return [{ ...exactMatch, similarity: 1.0 }];
        }

        // Semantic search using embeddings
        const queryEmbedding = await getQueryEmbedding(query);

        const { data, error } = await supabase.rpc('search_ai_media', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: limit,
        });

        if (error) {
            console.error('[MediaLibrary] Search error:', error);
            return [];
        }

        console.log('[MediaLibrary] Found', data?.length || 0, 'matching media');
        return data || [];
    } catch (err) {
        console.error('[MediaLibrary] Error in searchRelevantMedia:', err);
        return [];
    }
}

/**
 * Get media match for conversation context
 */
export async function getMediaForContext(
    currentMessage: string,
    conversationContext?: string
): Promise<MediaSearchResult> {
    try {
        const searchQuery = conversationContext
            ? `${currentMessage}\n\nContext: ${conversationContext}`
            : currentMessage;

        const matches = await searchRelevantMedia(searchQuery, 1, SIMILARITY_THRESHOLDS.CONTEXT_MATCH);

        if (matches.length === 0) {
            return { media: null, confidence: 'none' };
        }

        const topMatch = matches[0];

        // Determine confidence based on similarity score
        let confidence: 'high' | 'medium' | 'low';
        if (topMatch.similarity >= SIMILARITY_THRESHOLDS.HIGH_CONFIDENCE) {
            confidence = 'high';
        } else if (topMatch.similarity >= SIMILARITY_THRESHOLDS.MEDIUM_CONFIDENCE) {
            confidence = 'medium';
        } else {
            confidence = 'low';
        }

        console.log('[MediaLibrary] Context match:', topMatch.title, 'similarity:', topMatch.similarity, 'confidence:', confidence);

        return { media: topMatch, confidence };
    } catch (err) {
        console.error('[MediaLibrary] Error in getMediaForContext:', err);
        return { media: null, confidence: 'none' };
    }
}

// ==================== USAGE TRACKING ====================

/**
 * Track media usage when sent to customer
 */
export async function trackMediaUsage(mediaId: string): Promise<void> {
    try {
        // Try using RPC function first
        const { error: rpcError } = await supabase.rpc('increment_media_usage', { media_id: mediaId });

        if (rpcError) {
            // Fallback: Direct update if RPC doesn't exist
            console.log('[MediaLibrary] RPC not available, using direct update');

            // Get current count and increment
            const { data: current } = await supabase
                .from('ai_media')
                .select('usage_count')
                .eq('id', mediaId)
                .single();

            if (current) {
                await supabase
                    .from('ai_media')
                    .update({
                        usage_count: (current.usage_count || 0) + 1,
                        last_used_at: new Date().toISOString()
                    })
                    .eq('id', mediaId);
            }
        }

        logMediaOperation({ operation: 'usage_tracked', mediaId });
    } catch (err) {
        console.error('[MediaLibrary] Error tracking usage:', err);
    }
}

// ==================== CATEGORIES ====================

/**
 * Get all categories
 */
export async function getCategories(): Promise<MediaCategory[]> {
    try {
        const { data, error } = await supabase
            .from('media_categories')
            .select('*')
            .order('name');

        if (error) {
            console.error('[MediaLibrary] Error fetching categories:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[MediaLibrary] Error in getCategories:', err);
        return [];
    }
}

/**
 * Create a new category
 */
export async function createCategory(params: {
    name: string;
    description?: string;
    color?: string;
}): Promise<MediaCategory | null> {
    try {
        const { data, error } = await supabase
            .from('media_categories')
            .insert({
                name: params.name,
                description: params.description || null,
                color: params.color || '#3b82f6',
            })
            .select()
            .single();

        if (error) {
            console.error('[MediaLibrary] Error creating category:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('[MediaLibrary] Error in createCategory:', err);
        return null;
    }
}

/**
 * Update an existing category
 */
export async function updateCategory(
    id: string,
    params: Partial<{
        name: string;
        description: string | null;
        color: string;
    }>
): Promise<MediaCategory | null> {
    try {
        const updates: Record<string, unknown> = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.description !== undefined) updates.description = params.description;
        if (params.color !== undefined) updates.color = params.color;

        const { data, error } = await supabase
            .from('media_categories')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[MediaLibrary] Error updating category:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('[MediaLibrary] Error in updateCategory:', err);
        return null;
    }
}

/**
 * Delete a category
 */
export async function deleteCategory(id: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('media_categories')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[MediaLibrary] Error deleting category:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('[MediaLibrary] Error in deleteCategory:', err);
        return false;
    }
}
