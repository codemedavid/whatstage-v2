/**
 * Re-embed Documents Script
 * 
 * Regenerates embeddings for documents with missing or mismatched dimensions.
 * Uses the current NVIDIA embedding model (nvidia/nv-embedqa-e5-v5, 1024 dims).
 * 
 * Usage:
 *   npx ts-node scripts/reembed-documents.ts --user-id YOUR_USER_ID [--dry-run] [--all]
 * 
 * Options:
 *   --user-id    Re-embed documents for a specific user
 *   --all        Re-embed ALL documents (use with caution)
 *   --dry-run    Preview what would be updated without making changes
 *   --batch-size Number of documents to process per batch (default: 10)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';
const EXPECTED_DIMENSIONS = 1024;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials. Check .env.local');
    process.exit(1);
}

if (!NVIDIA_API_KEY) {
    console.error('❌ Missing NVIDIA_API_KEY. Check .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting: NVIDIA API has rate limits
const RATE_LIMIT_DELAY_MS = 200; // 200ms between requests

/**
 * Generate embedding using NVIDIA API
 */
async function getEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text],
            input_type: 'passage',
            encoding_format: 'float',
            truncate: 'END',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data || typeof data !== 'object') {
        throw new Error('Embedding API returned invalid response: expected JSON object');
    }

    if (!Array.isArray(data.data)) {
        throw new Error(`Embedding API returned invalid response: 'data' field is not an array (got ${typeof data.data})`);
    }

    if (data.data.length === 0) {
        throw new Error('Embedding API returned empty data array');
    }

    const firstResult = data.data[0];
    if (!firstResult || typeof firstResult !== 'object') {
        throw new Error('Embedding API returned invalid first result: expected object');
    }

    if (!Array.isArray(firstResult.embedding)) {
        throw new Error(`Embedding API returned invalid embedding: expected array (got ${typeof firstResult.embedding})`);
    }

    if (firstResult.embedding.length !== EXPECTED_DIMENSIONS) {
        throw new Error(`Embedding API returned unexpected dimensions: ${firstResult.embedding.length} (expected ${EXPECTED_DIMENSIONS})`);
    }

    return firstResult.embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call
 */
async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts,
            input_type: 'passage',
            encoding_format: 'float',
            truncate: 'END',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data || typeof data !== 'object') {
        throw new Error('Embedding API returned invalid response: expected JSON object');
    }

    if (!Array.isArray(data.data)) {
        throw new Error(`Embedding API returned invalid response: 'data' field is not an array (got ${typeof data.data})`);
    }

    if (data.data.length !== texts.length) {
        throw new Error(`Embedding API returned ${data.data.length} embeddings for ${texts.length} inputs`);
    }

    const embeddings: number[][] = [];
    for (let i = 0; i < data.data.length; i++) {
        const result = data.data[i];
        if (!result || typeof result !== 'object') {
            throw new Error(`Embedding API returned invalid result at index ${i}: expected object`);
        }

        if (!Array.isArray(result.embedding)) {
            throw new Error(`Embedding API returned invalid embedding at index ${i}: expected array (got ${typeof result.embedding})`);
        }

        if (result.embedding.length !== EXPECTED_DIMENSIONS) {
            throw new Error(`Embedding API returned unexpected dimensions at index ${i}: ${result.embedding.length} (expected ${EXPECTED_DIMENSIONS})`);
        }

        embeddings.push(result.embedding);
    }

    return embeddings;
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface DocumentRow {
    id: number;
    content: string;
    embedding: number[] | null;
    user_id: string | null;
    metadata: Record<string, unknown> | null;
}

async function main() {
    const args = process.argv.slice(2);

    const userIdIndex = args.indexOf('--user-id');
    const userId = userIdIndex !== -1 ? args[userIdIndex + 1] : null;
    const processAll = args.includes('--all');
    const dryRun = args.includes('--dry-run');
    const batchSizeIndex = args.indexOf('--batch-size');
    const batchSize = batchSizeIndex !== -1 ? parseInt(args[batchSizeIndex + 1], 10) : 10;

    if (!userId && !processAll) {
        console.log('Usage: npx ts-node scripts/reembed-documents.ts --user-id YOUR_USER_ID [--dry-run]');
        console.log('       npx ts-node scripts/reembed-documents.ts --all [--dry-run]');
        process.exit(1);
    }

    console.log('='.repeat(60));
    console.log('RE-EMBED DOCUMENTS');
    console.log('='.repeat(60));
    console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚡ LIVE (will update DB)'}`);
    console.log(`Target: ${userId ? `User ${userId}` : 'ALL users'}`);
    console.log(`Expected dimensions: ${EXPECTED_DIMENSIONS}`);
    console.log(`Batch size: ${batchSize}`);
    console.log('');

    // Build query
    let query = supabase
        .from('documents')
        .select('id, content, embedding, user_id, metadata');

    if (userId) {
        query = query.eq('user_id', userId);
    }

    const { data: documents, error } = await query;

    if (error) {
        console.error('❌ Error fetching documents:', error.message);
        process.exit(1);
    }

    if (!documents || documents.length === 0) {
        console.log('✓ No documents found matching criteria.');
        return;
    }

    console.log(`Found ${documents.length} documents total.`);

    // Filter to documents needing re-embedding
    const needsReembed = documents.filter((doc: DocumentRow) => {
        if (!doc.embedding) return true; // No embedding

        // Supabase returns VECTOR type as string - parse it
        let embeddingArray: number[];
        if (typeof doc.embedding === 'string') {
            try {
                embeddingArray = JSON.parse(doc.embedding);
            } catch {
                return true; // Invalid JSON
            }
        } else if (Array.isArray(doc.embedding)) {
            embeddingArray = doc.embedding;
        } else {
            return true; // Invalid embedding type
        }

        if (embeddingArray.length !== EXPECTED_DIMENSIONS) return true; // Wrong dimensions
        return false;
    });

    console.log(`Documents needing re-embed: ${needsReembed.length}`);

    if (needsReembed.length === 0) {
        console.log('✓ All documents have correct embeddings!');
        return;
    }

    // Show preview
    console.log('\n--- Documents to re-embed ---');
    needsReembed.slice(0, 10).forEach((doc: DocumentRow, i: number) => {
        let dims: string | number = 'null';
        if (doc.embedding) {
            if (typeof doc.embedding === 'string') {
                try {
                    dims = JSON.parse(doc.embedding).length;
                } catch {
                    dims = 'invalid';
                }
            } else if (Array.isArray(doc.embedding)) {
                dims = doc.embedding.length;
            } else {
                dims = 'invalid';
            }
        }
        console.log(`  ${i + 1}. ID: ${doc.id} | dims: ${dims} | "${doc.content.substring(0, 40)}..."`);
    });
    if (needsReembed.length > 10) {
        console.log(`  ... and ${needsReembed.length - 10} more`);
    }

    if (dryRun) {
        console.log('\n🔍 DRY RUN - No changes made.');
        console.log(`Would update ${needsReembed.length} documents.`);
        return;
    }

    // Process in batches
    console.log('\n--- Starting re-embedding ---');
    console.log(`Processing ${needsReembed.length} documents in batches of ${batchSize}...\n`);

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    // Split documents into batches
    for (let batchStart = 0; batchStart < needsReembed.length; batchStart += batchSize) {
        const batch = needsReembed.slice(batchStart, batchStart + batchSize) as DocumentRow[];
        const batchNum = Math.floor(batchStart / batchSize) + 1;
        const totalBatches = Math.ceil(needsReembed.length / batchSize);

        try {
            // Generate embeddings for the entire batch in one API call
            const texts = batch.map(doc => doc.content);
            const embeddings = await getEmbeddingsBatch(texts);

            // Prepare batch updates
            const updates: { id: number; embedding: number[] }[] = [];
            for (let i = 0; i < batch.length; i++) {
                updates.push({
                    id: batch[i].id,
                    embedding: embeddings[i]
                });
            }

            // Perform batch upsert
            let batchErrorCount = 0;
            for (const update of updates) {
                const { error: updateError } = await supabase
                    .from('documents')
                    .update({ embedding: update.embedding })
                    .eq('id', update.id);

                if (updateError) {
                    console.error(`\n❌ Doc ${update.id}: ${updateError.message}`);
                    batchErrorCount++;
                    errorCount++;
                } else {
                    successCount++;
                }
            }

            processedCount += batch.length;
            const progress = Math.round((processedCount / needsReembed.length) * 100);
            process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} | Progress: ${progress}% (${successCount} updated, ${errorCount} errors)`);

            // Rate limiting between batches
            if (batchStart + batchSize < needsReembed.length) {
                await sleep(RATE_LIMIT_DELAY_MS);
            }

        } catch (err) {
            // If batch embedding fails, fall back to processing documents individually
            console.error(`\n⚠️  Batch ${batchNum} failed, falling back to individual processing: ${err}`);

            for (const doc of batch) {
                try {
                    const embedding = await getEmbedding(doc.content);

                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({ embedding })
                        .eq('id', doc.id);

                    if (updateError) {
                        console.error(`\n❌ Doc ${doc.id}: ${updateError.message}`);
                        errorCount++;
                    } else {
                        successCount++;
                    }

                    // Rate limiting for individual requests
                    await sleep(RATE_LIMIT_DELAY_MS);

                } catch (docErr) {
                    console.error(`\n❌ Doc ${doc.id}: ${docErr}`);
                    errorCount++;
                }
            }

            processedCount += batch.length;
            const progress = Math.round((processedCount / needsReembed.length) * 100);
            process.stdout.write(`\r  Progress: ${progress}% (${successCount} updated, ${errorCount} errors)`);
        }
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('');
    console.log('Run your bot again to verify RAG is working!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
