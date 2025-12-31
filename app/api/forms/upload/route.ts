import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { createClient } from '@/app/lib/supabaseServer';
import {
    getCloudinary,
    getResourceType,
    validateFile,
    FILE_SIZE_LIMITS,
} from '@/app/lib/mediaUtils';

// Route segment config
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Upload file to Cloudinary
 */
async function uploadToCloudinary(
    buffer: Buffer,
    options: {
        folder: string;
        mimeType: string;
        useStreaming: boolean;
    }
): Promise<{
    secure_url: string;
    public_id: string;
}> {
    const cloudinary = getCloudinary();
    const resourceType = getResourceType(options.mimeType);

    const uploadOptions = {
        folder: options.folder,
        resource_type: resourceType,
        timeout: 60000,
    };

    if (options.useStreaming) {
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

            const readable = Readable.from(buffer);
            readable.pipe(uploadStream);
        });
    } else {
        const base64 = buffer.toString('base64');
        const dataURI = `data:${options.mimeType};base64,${base64}`;
        return cloudinary.uploader.upload(dataURI, uploadOptions);
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const formSubmissionId = formData.get('form_submission_id') as string;
        const fieldId = formData.get('field_id') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file using shared utility
        const validation = validateFile(file);
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error, code: validation.errorCode },
                { status: 400 }
            );
        }

        const mimeType = file.type || 'application/octet-stream';
        const useStreaming = file.size > FILE_SIZE_LIMITS.BASE64_MAX;

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Upload to Cloudinary
        const result = await uploadToCloudinary(buffer, {
            folder: 'form-uploads',
            mimeType,
            useStreaming,
        });

        const fileUrl = result.secure_url;

        // If we have a form submission ID, also record in form_file_uploads
        if (formSubmissionId) {
            await supabase
                .from('form_file_uploads')
                .insert([{
                    form_submission_id: formSubmissionId,
                    field_id: fieldId || null,
                    file_url: fileUrl,
                    file_name: file.name,
                    file_type: mimeType,
                    file_size: file.size
                }]);
        }

        return NextResponse.json({
            url: fileUrl,
            public_id: result.public_id,
            name: file.name,
            type: mimeType,
            size: file.size
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Form file upload error:', errorMessage);

        return NextResponse.json(
            { error: 'Upload failed: ' + errorMessage },
            { status: 500 }
        );
    }
}
