import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
    addMedia,
    getAllMedia,
    updateMedia,
    deleteMedia,
    getMediaById
} from '@/app/lib/mediaLibraryService';
import {
    inferMediaTypeFromUrl,
    generateVideoThumbnail,
    logMediaOperation,
    MediaError,
} from '@/app/lib/mediaUtils';

// ==================== VALIDATION SCHEMAS ====================

const CreateMediaSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().min(1, 'Description is required').max(2000),
    mediaUrl: z.string().url('Invalid media URL'),
    mediaType: z.enum(['image', 'video', 'audio', 'file']).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    keywords: z.array(z.string()).default([]),
    triggerPhrases: z.array(z.string()).default([]),
    thumbnailUrl: z.string().url().nullable().optional(),
});

const UpdateMediaSchema = z.object({
    id: z.string().uuid('Invalid media ID'),
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(2000).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    keywords: z.array(z.string()).optional(),
    triggerPhrases: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
});

// ==================== HANDLERS ====================

/**
 * GET /api/media - List all media with optional filters
 */
export async function GET(request: Request) {
    const startTime = Date.now();

    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get('categoryId') || undefined;
        const isActive = searchParams.get('isActive');
        const mediaType = searchParams.get('mediaType') || undefined;
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '20', 10);

        const media = await getAllMedia({
            categoryId,
            isActive: isActive !== null ? isActive === 'true' : undefined,
            mediaType,
            page,
            limit,
        });

        logMediaOperation({
            operation: 'list',
            duration: Date.now() - startTime,
        });

        return NextResponse.json({ success: true, media });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch media';
        logMediaOperation({ operation: 'list_error', error: message });

        return NextResponse.json(
            { success: false, error: message, code: 'FETCH_FAILED' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/media - Create new media with embedding
 * 
 * Expects JSON body (file should already be uploaded via /api/upload)
 */
export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();

        // Validate input
        const validation = CreateMediaSchema.safeParse(body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e: { message: string }) => e.message).join(', ');
            return NextResponse.json(
                { success: false, error: errors, code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const data = validation.data;

        // Infer media type from URL if not provided
        const resolvedMediaType = data.mediaType || inferMediaTypeFromUrl(data.mediaUrl);

        // Generate video thumbnail if applicable
        let thumbnailUrl = data.thumbnailUrl || null;
        if (resolvedMediaType === 'video' && data.mediaUrl.includes('cloudinary') && !thumbnailUrl) {
            thumbnailUrl = generateVideoThumbnail(data.mediaUrl);
        }

        // Add to database with embedding
        const media = await addMedia({
            title: data.title,
            description: data.description,
            mediaUrl: data.mediaUrl,
            mediaType: resolvedMediaType,
            categoryId: data.categoryId || undefined,
            keywords: data.keywords,
            triggerPhrases: data.triggerPhrases,
            thumbnailUrl: thumbnailUrl || undefined,
        });

        logMediaOperation({
            operation: 'create',
            mediaId: media?.id,
            duration: Date.now() - startTime,
        });

        return NextResponse.json({
            success: true,
            media,
            message: 'Media indexed successfully'
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process request';
        const statusCode = error instanceof MediaError ? error.statusCode : 500;
        const code = error instanceof MediaError ? error.code : 'CREATE_FAILED';

        logMediaOperation({ operation: 'create_error', error: message });

        return NextResponse.json(
            { success: false, error: message, code },
            { status: statusCode }
        );
    }
}

/**
 * PUT /api/media - Update existing media
 */
export async function PUT(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();

        // Validate input
        const validation = UpdateMediaSchema.safeParse(body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e: { message: string }) => e.message).join(', ');
            return NextResponse.json(
                { success: false, error: errors, code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const { id, ...updates } = validation.data;
        const media = await updateMedia(id, updates);

        if (!media) {
            return NextResponse.json(
                { success: false, error: 'Media not found or update failed', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }

        logMediaOperation({
            operation: 'update',
            mediaId: id,
            duration: Date.now() - startTime,
        });

        return NextResponse.json({ success: true, media });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update media';
        logMediaOperation({ operation: 'update_error', error: message });

        return NextResponse.json(
            { success: false, error: message, code: 'UPDATE_FAILED' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/media - Delete media (soft delete by default)
 */
export async function DELETE(request: Request) {
    const startTime = Date.now();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const hard = searchParams.get('hard') === 'true';

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Media ID is required', code: 'MISSING_ID' },
                { status: 400 }
            );
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return NextResponse.json(
                { success: false, error: 'Invalid media ID format', code: 'INVALID_ID' },
                { status: 400 }
            );
        }

        // Get media info before delete (for potential Cloudinary cleanup)
        if (hard) {
            const media = await getMediaById(id);
            if (!media) {
                return NextResponse.json(
                    { success: false, error: 'Media not found', code: 'NOT_FOUND' },
                    { status: 404 }
                );
            }
            // Note: Cloudinary cleanup could be added here if needed
        }

        const success = await deleteMedia(id, hard);

        if (!success) {
            return NextResponse.json(
                { success: false, error: 'Failed to delete media', code: 'DELETE_FAILED' },
                { status: 500 }
            );
        }

        logMediaOperation({
            operation: hard ? 'hard_delete' : 'soft_delete',
            mediaId: id,
            duration: Date.now() - startTime,
        });

        return NextResponse.json({
            success: true,
            message: hard ? 'Media permanently deleted' : 'Media deactivated'
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete media';
        logMediaOperation({ operation: 'delete_error', error: message });

        return NextResponse.json(
            { success: false, error: message, code: 'DELETE_FAILED' },
            { status: 500 }
        );
    }
}
