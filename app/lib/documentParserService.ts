/**
 * Document Parser Service
 * Handles parsing of various document types (PDF, TXT, MD) 
 * and extracts text content for knowledge base ingestion.
 */

export interface ParsedDocument {
    text: string;
    metadata: {
        title?: string;
        pageCount?: number;
        fileType: string;
        originalFilename: string;
        fileSizeBytes: number;
    };
}

export interface ChunkedDocument extends ParsedDocument {
    chunks: string[];
}

/**
 * Parse a PDF file buffer and extract text content
 * Uses lazy loading to avoid Next.js build-time issues
 */
export async function parsePDF(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    try {
        if (typeof window !== 'undefined') {
            throw new Error('PDF parsing is only supported on the server');
        }

        // Lazy load pdf-parse only when actually needed at runtime
        // This avoids the canvas polyfill warning during build
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfModule = eval('require')('pdf-parse');
        const PDFParse = pdfModule.PDFParse;

        // PDFParse is a class - instantiate with new
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        await parser.load();

        // getText() returns { pages, text, total }
        const textResult = await parser.getText();
        const text = textResult.text || '';
        const info = await parser.getInfo();

        return {
            text: text.trim(),
            metadata: {
                title: info?.Title || filename.replace('.pdf', ''),
                pageCount: info?.numPages || 1,
                fileType: 'pdf',
                originalFilename: filename,
                fileSizeBytes: buffer.length,
            },
        };
    } catch (error) {
        console.error('[DocumentParser] PDF parsing error:', error);
        throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Parse a text file (TXT or MD) and extract content
 */
export function parseTextFile(buffer: Buffer, filename: string): ParsedDocument {
    const text = buffer.toString('utf-8').trim();
    const extension = filename.split('.').pop()?.toLowerCase() || 'txt';

    return {
        text,
        metadata: {
            title: filename.replace(/\.(txt|md)$/i, ''),
            pageCount: 1,
            fileType: extension,
            originalFilename: filename,
            fileSizeBytes: buffer.length,
        },
    };
}

/**
 * Detect file type from filename and parse accordingly
 */
export async function parseDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const extension = filename.split('.').pop()?.toLowerCase();

    switch (extension) {
        case 'pdf':
            return await parsePDF(buffer, filename);
        case 'txt':
        case 'md':
            return parseTextFile(buffer, filename);
        default:
            throw new Error(`Unsupported file type: ${extension}. Supported types: pdf, txt, md`);
    }
}

/**
 * Chunk a document into smaller pieces for embedding
 * Uses paragraph-aware splitting for better context preservation
 */
export function chunkDocument(doc: ParsedDocument, maxChunkSize: number = 1500): ChunkedDocument {
    const text = doc.text;

    // Split by paragraphs first (double newlines)
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        // If adding this paragraph would exceed max size
        if (currentChunk.length + paragraph.length > maxChunkSize) {
            // Save current chunk if it has content
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }

            // If single paragraph is too long, split by sentences
            if (paragraph.length > maxChunkSize) {
                const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
                for (const sentence of sentences) {
                    if (currentChunk.length + sentence.length > maxChunkSize) {
                        if (currentChunk.trim()) {
                            chunks.push(currentChunk.trim());
                        }
                        currentChunk = sentence;
                    } else {
                        currentChunk += ' ' + sentence;
                    }
                }
            } else {
                currentChunk = paragraph;
            }
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return {
        ...doc,
        chunks,
    };
}

/**
 * Get supported file types for upload validation
 */
export function getSupportedFileTypes(): string[] {
    return ['pdf', 'txt', 'md'];
}

/**
 * Validate if a file type is supported
 */
export function isFileTypeSupported(filename: string): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return getSupportedFileTypes().includes(extension || '');
}
