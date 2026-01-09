import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';
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
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get('categoryId');
        const isActive = searchParams.get('isActive');
        const mediaType = searchParams.get('mediaType');

        let query = supabase
            .from('media_library')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (categoryId) query = query.eq('category_id', categoryId);
        if (isActive !== undefined && isActive !== null && isActive !== '') {
            query = query.eq('is_active', isActive === 'true');
        }
        if (mediaType) query = query.eq('media_type', mediaType);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching media:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch media', code: 'FETCH_FAILED' },
                { status: 500 }
            );
        }

        logMediaOperation({
            operation: 'list',
            duration: Date.now() - startTime,
        });

        return NextResponse.json({ success: true, media: data || [] });
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
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

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

        const supabase = await createClient();

        const { data: media, error } = await supabase
            .from('media_library')
            .insert({
                user_id: userId,
                title: data.title,
                description: data.description,
                media_url: data.mediaUrl,
                media_type: resolvedMediaType,
                category_id: data.categoryId || null,
                keywords: data.keywords,
                trigger_phrases: data.triggerPhrases,
                thumbnail_url: thumbnailUrl,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating media:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to create media', code: 'CREATE_FAILED' },
                { status: 500 }
            );
        }

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
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

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
        const supabase = await createClient();

        // Build update object with snake_case
        const updateData: Record<string, unknown> = {};
        if (updates.title !== undefined) updateData.title = updates.title;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId;
        if (updates.keywords !== undefined) updateData.keywords = updates.keywords;
        if (updates.triggerPhrases !== undefined) updateData.trigger_phrases = updates.triggerPhrases;
        if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
        if (updates.thumbnailUrl !== undefined) updateData.thumbnail_url = updates.thumbnailUrl;
        updateData.updated_at = new Date().toISOString();

        const { data: media, error } = await supabase
            .from('media_library')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error || !media) {
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
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

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

        const supabase = await createClient();

        if (hard) {
            // Hard delete
            const { error } = await supabase
                .from('media_library')
                .delete()
                .eq('id', id)
                .eq('user_id', userId);

            if (error) {
                return NextResponse.json(
                    { success: false, error: 'Failed to delete media', code: 'DELETE_FAILED' },
                    { status: 500 }
                );
            }
        } else {
            // Soft delete (set is_active to false)
            const { error } = await supabase
                .from('media_library')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', userId);

            if (error) {
                return NextResponse.json(
                    { success: false, error: 'Failed to deactivate media', code: 'DELETE_FAILED' },
                    { status: 500 }
                );
            }
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
