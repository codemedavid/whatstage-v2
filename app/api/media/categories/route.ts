import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '@/app/lib/mediaLibraryService';

// ==================== VALIDATION SCHEMAS ====================

const CreateCategorySchema = z.object({
    name: z.string().min(1, 'Category name is required').max(100),
    description: z.string().max(500).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color format').optional(),
});

const UpdateCategorySchema = z.object({
    id: z.string().uuid('Invalid category ID'),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color format').optional(),
});

// ==================== HANDLERS ====================

/**
 * GET /api/media/categories - List all categories
 */
export async function GET() {
    try {
        const categories = await getCategories();
        return NextResponse.json({ success: true, categories });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch categories';
        console.error('[API/media/categories] GET error:', message);
        return NextResponse.json(
            { success: false, error: message, code: 'FETCH_FAILED' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/media/categories - Create new category
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input
        const validation = CreateCategorySchema.safeParse(body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e: { message: string }) => e.message).join(', ');
            return NextResponse.json(
                { success: false, error: errors, code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const { name, description, color } = validation.data;
        const category = await createCategory({ name, description: description ?? undefined, color });

        if (!category) {
            return NextResponse.json(
                { success: false, error: 'Failed to create category', code: 'CREATE_FAILED' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, category });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create category';
        console.error('[API/media/categories] POST error:', message);
        return NextResponse.json(
            { success: false, error: message, code: 'CREATE_FAILED' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/media/categories - Update category
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input
        const validation = UpdateCategorySchema.safeParse(body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e: { message: string }) => e.message).join(', ');
            return NextResponse.json(
                { success: false, error: errors, code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const { id, name, description, color } = validation.data;
        const category = await updateCategory(id, { name, description, color });

        if (!category) {
            return NextResponse.json(
                { success: false, error: 'Category not found or update failed', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, category });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update category';
        console.error('[API/media/categories] PUT error:', message);
        return NextResponse.json(
            { success: false, error: message, code: 'UPDATE_FAILED' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/media/categories - Delete category
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Category ID is required', code: 'MISSING_ID' },
                { status: 400 }
            );
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return NextResponse.json(
                { success: false, error: 'Invalid category ID format', code: 'INVALID_ID' },
                { status: 400 }
            );
        }

        const success = await deleteCategory(id);

        if (!success) {
            return NextResponse.json(
                { success: false, error: 'Failed to delete category', code: 'DELETE_FAILED' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete category';
        console.error('[API/media/categories] DELETE error:', message);
        return NextResponse.json(
            { success: false, error: message, code: 'DELETE_FAILED' },
            { status: 500 }
        );
    }
}
