import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import {
    getCloudinary,
    getResourceType,
    getMediaType,
    validateFile,
    FILE_SIZE_LIMITS,
    logMediaOperation,
} from '@/app/lib/mediaUtils';

// Route segment config - increase timeout for video uploads
export const maxDuration = 60; // 60 seconds max (Vercel Pro/hobby limit)
export const dynamic = 'force-dynamic';

/**
 * Upload file to Cloudinary using streaming for large files
 */
async function uploadToCloudinary(
    buffer: Buffer,
    options: {
        folder: string;
        resourceType: 'image' | 'video' | 'raw';
        mimeType: string;
        useStreaming: boolean;
    }
): Promise<{
    secure_url: string;
    public_id: string;
    eager?: Array<{ secure_url: string }>;
}> {
    const cloudinary = getCloudinary();

    const uploadOptions = {
        folder: options.folder,
        resource_type: options.resourceType,
        timeout: 120000, // 2 minute timeout
        // For raw files, preserve the original filename
        ...(options.resourceType === 'raw' && {
            use_filename: true,
            unique_filename: true,
        }),
        // For videos, add eager transformations for thumbnails
        ...(options.resourceType === 'video' && {
            eager: [
                { format: 'jpg', transformation: [{ width: 400, height: 300, crop: 'fill' }] }
            ],
            eager_async: true,
        }),
    };

    if (options.useStreaming) {
        // Use streaming upload for large files to reduce memory pressure
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                uploadOptions,
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else if (result) {
                        resolve(result);
                    } else {
                        reject(new Error('No result from Cloudinary'));
                    }
                }
            );

            // Convert buffer to readable stream and pipe to upload
            const readable = Readable.from(buffer);
            readable.pipe(uploadStream);
        });
    } else {
        // Use base64 upload for smaller files (simpler, faster)
        const base64 = buffer.toString('base64');
        const dataURI = `data:${options.mimeType};base64,${base64}`;
        return cloudinary.uploader.upload(dataURI, uploadOptions);
    }
}

export async function POST(req: Request) {
    const startTime = Date.now();

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const folder = (formData.get('folder') as string) || 'workflow-attachments';

        // Validate file
        const validation = validateFile(file);
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error, code: validation.errorCode },
                { status: 400 }
            );
        }

        const mimeType = file.type || 'application/octet-stream';
        const resourceType = getResourceType(mimeType);
        const attachmentType = getMediaType(mimeType);
        const fileSizeBytes = file.size;
        const useStreaming = fileSizeBytes > FILE_SIZE_LIMITS.BASE64_MAX;

        logMediaOperation({
            operation: 'upload_start',
            fileSize: fileSizeBytes,
        });

        if (useStreaming) {
            console.log('[Upload] Large file detected, using streaming upload...');
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Upload to Cloudinary
        const result = await uploadToCloudinary(buffer, {
            folder,
            resourceType,
            mimeType,
            useStreaming,
        });

        const duration = Date.now() - startTime;
        logMediaOperation({
            operation: 'upload_complete',
            fileSize: fileSizeBytes,
            duration,
        });

        return NextResponse.json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: resourceType,
            attachment_type: attachmentType,
            file_name: file.name,
            mime_type: mimeType,
            thumbnail_url: result.eager?.[0]?.secure_url || null,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = (error as { code?: string })?.code;

        logMediaOperation({
            operation: 'upload_error',
            error: errorMessage,
            duration: Date.now() - startTime,
        });

        // Provide more specific error messages
        if (errorCode === 'ECONNRESET' || errorMessage.includes('aborted')) {
            return NextResponse.json(
                {
                    error: 'Upload timed out. Try uploading a smaller file or check your connection.',
                    code: 'TIMEOUT'
                },
                { status: 408 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to upload file: ' + errorMessage, code: 'UPLOAD_FAILED' },
            { status: 500 }
        );
    }
}
