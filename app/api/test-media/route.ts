import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { searchAllSources } from '@/app/lib/rag';

/**
 * Debug endpoint to check media embeddings and search functionality
 * GET /api/test-media?query=test
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query') || 'show me a demo video';

        // 1. Check how many media items exist
        const { data: allMedia, error: mediaError } = await supabase
            .from('ai_media')
            .select('id, title, description, media_type, is_active, embedding')
            .eq('is_active', true);

        if (mediaError) {
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch media',
                details: mediaError
            }, { status: 500 });
        }

        // 2. Check if embeddings exist (just check if not null, not full content)
        const mediaWithEmbeddings = allMedia?.map(m => ({
            id: m.id,
            title: m.title,
            description: m.description?.substring(0, 100),
            media_type: m.media_type,
            is_active: m.is_active,
            has_embedding: m.embedding !== null && m.embedding !== undefined,
            embedding_type: m.embedding ? typeof m.embedding : 'null',
            // If embedding is a string (wrong), show first chars
            embedding_preview: typeof m.embedding === 'string'
                ? m.embedding.substring(0, 50) + '...'
                : (Array.isArray(m.embedding) ? `array[${m.embedding.length}]` : 'N/A')
        }));

        // 3. Try the unified search
        let searchResult = null;
        let searchError = null;
        try {
            searchResult = await searchAllSources(query, {
                includeMedia: true,
                documentLimit: 3,
                mediaLimit: 3
            });
        } catch (err) {
            searchError = err instanceof Error ? err.message : String(err);
        }

        // 4. Check if RPC function exists
        let rpcExists = false;
        try {
            const { error: rpcError } = await supabase.rpc('search_all_sources', {
                query_embedding: new Array(1024).fill(0), // dummy embedding
                doc_threshold: 0.99, // high threshold to return nothing
                media_threshold: 0.99,
                doc_count: 1,
                media_count: 1
            });
            rpcExists = !rpcError || !rpcError.message.includes('function');
            if (rpcError) {
                console.log('RPC check error:', rpcError);
            }
        } catch {
            rpcExists = false;
        }

        return NextResponse.json({
            success: true,
            debug: {
                totalMedia: allMedia?.length || 0,
                query: query,
                rpcFunctionExists: rpcExists,
                media: mediaWithEmbeddings,
                searchResult: searchResult ? {
                    documentsFound: searchResult.documents.length,
                    mediaFound: searchResult.relevantMedia.length,
                    topMedia: searchResult.relevantMedia[0] || null,
                    documentPreview: searchResult.documents.substring(0, 200)
                } : null,
                searchError: searchError
            }
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
