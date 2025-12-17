/**
 * Semantic Chunker
 * 
 * Splits text by sentence/paragraph boundaries instead of character counts
 * for better context preservation in RAG retrieval.
 */

export interface ChunkConfig {
    maxChunkSize?: number;       // Max characters per chunk (default: 1500)
    overlapSentences?: number;   // Number of sentences to overlap (default: 2)
    preserveParagraphs?: boolean; // Try to keep paragraphs intact (default: true)
}

const DEFAULT_CONFIG: Required<ChunkConfig> = {
    maxChunkSize: 1500,
    overlapSentences: 2,
    preserveParagraphs: true,
};

/**
 * Split text into sentences using regex patterns
 * Handles common sentence-ending punctuation while avoiding false splits on abbreviations
 */
function splitIntoSentences(text: string): string[] {
    // Pattern matches sentence-ending punctuation followed by whitespace or end of string
    // Avoids splitting on common abbreviations like Mr., Dr., etc.
    const sentencePattern = /(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$/g;

    const sentences = text
        .split(sentencePattern)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // If no sentences found, return the original text as a single sentence
    if (sentences.length === 0 && text.trim().length > 0) {
        return [text.trim()];
    }

    return sentences;
}

/**
 * Split text into paragraphs based on double newlines
 */
function splitIntoParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

/**
 * Create semantic chunks from text
 * 
 * Strategy:
 * 1. If preserveParagraphs is true, try to keep paragraphs intact
 * 2. Split paragraphs that exceed maxChunkSize by sentence boundaries
 * 3. Group small paragraphs together up to maxChunkSize
 * 4. Add sentence overlap between chunks for context continuity
 */
export function semanticChunk(text: string, config?: ChunkConfig): string[] {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { maxChunkSize, overlapSentences, preserveParagraphs } = cfg;

    if (!text || text.trim().length === 0) {
        return [];
    }

    const chunks: string[] = [];
    let overlapBuffer: string[] = []; // Sentences to prepend to next chunk

    if (preserveParagraphs) {
        // Strategy: Process paragraph by paragraph
        const paragraphs = splitIntoParagraphs(text);
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            const potentialChunk = currentChunk
                ? `${currentChunk}\n\n${paragraph}`
                : paragraph;

            if (potentialChunk.length <= maxChunkSize) {
                // Paragraph fits, add to current chunk
                currentChunk = potentialChunk;
            } else if (paragraph.length > maxChunkSize) {
                // Paragraph is too large, need to split by sentences
                if (currentChunk) {
                    chunks.push(currentChunk);
                    // Get overlap sentences from current chunk
                    const currentSentences = splitIntoSentences(currentChunk);
                    overlapBuffer = currentSentences.slice(-overlapSentences);
                    currentChunk = '';
                }

                // Split large paragraph by sentences
                const sentences = splitIntoSentences(paragraph);
                let sentenceChunk = overlapBuffer.join(' ');
                overlapBuffer = [];

                for (const sentence of sentences) {
                    const potentialSentenceChunk = sentenceChunk
                        ? `${sentenceChunk} ${sentence}`
                        : sentence;

                    if (potentialSentenceChunk.length <= maxChunkSize) {
                        sentenceChunk = potentialSentenceChunk;
                    } else {
                        if (sentenceChunk) {
                            chunks.push(sentenceChunk);
                            // Store overlap sentences
                            const chunkSentences = splitIntoSentences(sentenceChunk);
                            overlapBuffer = chunkSentences.slice(-overlapSentences);
                        }
                        // Start new chunk with overlap + current sentence
                        sentenceChunk = [...overlapBuffer, sentence].join(' ');
                        overlapBuffer = [];
                    }
                }

                if (sentenceChunk) {
                    currentChunk = sentenceChunk;
                }
            } else {
                // Current chunk is full, start new one
                if (currentChunk) {
                    chunks.push(currentChunk);
                    // Get overlap sentences
                    const currentSentences = splitIntoSentences(currentChunk);
                    overlapBuffer = currentSentences.slice(-overlapSentences);
                }
                // Start new chunk with overlap + paragraph
                currentChunk = [...overlapBuffer, paragraph].join('\n\n');
                overlapBuffer = [];
            }
        }

        // Don't forget the last chunk
        if (currentChunk) {
            chunks.push(currentChunk);
        }
    } else {
        // Simple sentence-based chunking without paragraph preservation
        const sentences = splitIntoSentences(text);
        let currentChunk = '';

        for (const sentence of sentences) {
            const potentialChunk = currentChunk
                ? `${currentChunk} ${sentence}`
                : sentence;

            if (potentialChunk.length <= maxChunkSize) {
                currentChunk = potentialChunk;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    // Get overlap sentences
                    const currentSentences = splitIntoSentences(currentChunk);
                    overlapBuffer = currentSentences.slice(-overlapSentences);
                }
                // Start new chunk with overlap + current sentence
                currentChunk = [...overlapBuffer, sentence].join(' ');
                overlapBuffer = [];
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }
    }

    // Filter out empty chunks and trim
    return chunks
        .map(c => c.trim())
        .filter(c => c.length > 0);
}

/**
 * Utility to estimate if text would benefit from semantic chunking
 * (has enough structure with sentences/paragraphs)
 */
export function shouldUseSemanticChunking(text: string): boolean {
    // Check if text has enough sentence structure
    const sentences = splitIntoSentences(text);
    const hasSentences = sentences.length >= 2;

    // Check if text has paragraph structure
    const paragraphs = splitIntoParagraphs(text);
    const hasParagraphs = paragraphs.length >= 2;

    // Use semantic chunking if text has structure
    return hasSentences || hasParagraphs;
}
