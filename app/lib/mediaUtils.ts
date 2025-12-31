/**
 * Shared Media Utilities
 * 
 * Centralized utilities for media handling across the application.
 * Eliminates code duplication and ensures consistent behavior.
 */

import { v2 as cloudinary } from 'cloudinary';

// ==================== CONSTANTS ====================

/** Similarity thresholds for semantic search */
export const SIMILARITY_THRESHOLDS = {
    /** Minimum threshold for search results */
    SEARCH_MIN: 0.45,
    /** Threshold for proactive context matching */
    CONTEXT_MATCH: 0.50,
    /** Medium confidence threshold */
    MEDIUM_CONFIDENCE: 0.55,
    /** High confidence threshold */
    HIGH_CONFIDENCE: 0.70,
} as const;

/** File size limits in bytes */
export const FILE_SIZE_LIMITS = {
    /** Maximum size for base64 encoding (10MB) */
    BASE64_MAX: 10 * 1024 * 1024,
    /** Maximum allowed upload size (100MB) */
    UPLOAD_MAX: 100 * 1024 * 1024,
    /** Ideal chunk size for streaming (5MB) */
    CHUNK_SIZE: 5 * 1024 * 1024,
} as const;

/** Allowed MIME types by category */
export const ALLOWED_MIME_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

/** Default pagination settings */
export const PAGINATION_DEFAULTS = {
    PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
} as const;

// ==================== CLOUDINARY CONFIGURATION ====================

let cloudinaryConfigured = false;

/**
 * Get configured Cloudinary instance
 * Lazy initialization to avoid issues with missing env vars during build
 */
export function getCloudinary() {
    if (!cloudinaryConfigured) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
        cloudinaryConfigured = true;
    }
    return cloudinary;
}

// ==================== TYPE DETECTION ====================

/**
 * Determine Cloudinary resource type based on MIME type
 */
export function getResourceType(mimeType: string): 'image' | 'video' | 'raw' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'video';
    return 'raw';
}

/**
 * Determine media type for Messenger attachments
 */
export function getMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
}

/**
 * Infer media type from URL file extension
 */
export function inferMediaTypeFromUrl(url: string): 'image' | 'video' | 'audio' | 'file' {
    const urlLower = url.toLowerCase();
    if (urlLower.match(/\.(jpg|jpeg|png|gif|webp|svg)/)) return 'image';
    if (urlLower.match(/\.(mp4|mov|avi|webm|mkv)/)) return 'video';
    if (urlLower.match(/\.(mp3|wav|ogg|aac|flac)/)) return 'audio';
    return 'file';
}

// ==================== VALIDATION ====================

export interface ValidationResult {
    valid: boolean;
    error?: string;
    errorCode?: string;
}

/**
 * Validate file for upload
 */
export function validateFile(file: File): ValidationResult {
    // Check file exists
    if (!file || !file.name) {
        return { valid: false, error: 'No file provided', errorCode: 'NO_FILE' };
    }

    // Check file size
    if (file.size > FILE_SIZE_LIMITS.UPLOAD_MAX) {
        const maxMB = FILE_SIZE_LIMITS.UPLOAD_MAX / (1024 * 1024);
        return {
            valid: false,
            error: `File too large. Maximum size is ${maxMB}MB`,
            errorCode: 'FILE_TOO_LARGE'
        };
    }

    // Check MIME type is allowed
    const mimeType = file.type || 'application/octet-stream';
    const allAllowedTypes: string[] = [
        ...ALLOWED_MIME_TYPES.image,
        ...ALLOWED_MIME_TYPES.video,
        ...ALLOWED_MIME_TYPES.audio,
        ...ALLOWED_MIME_TYPES.document,
    ];

    if (!allAllowedTypes.includes(mimeType) && mimeType !== 'application/octet-stream') {
        return {
            valid: false,
            error: `File type "${mimeType}" is not allowed`,
            errorCode: 'INVALID_TYPE'
        };
    }

    return { valid: true };
}

/**
 * Validate media URL
 */
export function validateMediaUrl(url: string): ValidationResult {
    if (!url || typeof url !== 'string') {
        return { valid: false, error: 'URL is required', errorCode: 'NO_URL' };
    }

    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { valid: false, error: 'URL must use HTTP or HTTPS', errorCode: 'INVALID_PROTOCOL' };
        }
    } catch {
        return { valid: false, error: 'Invalid URL format', errorCode: 'INVALID_URL' };
    }

    return { valid: true };
}

// ==================== LOGGING ====================

export interface MediaLogContext {
    operation: string;
    mediaId?: string;
    fileSize?: number;
    duration?: number;
    error?: string;
}

/**
 * Structured logging for media operations
 */
export function logMediaOperation(context: MediaLogContext) {
    const timestamp = new Date().toISOString();
    const parts = [
        `[Media:${context.operation}]`,
        context.mediaId ? `id=${context.mediaId}` : null,
        context.fileSize ? `size=${(context.fileSize / 1024 / 1024).toFixed(2)}MB` : null,
        context.duration ? `duration=${context.duration}ms` : null,
        context.error ? `error=${context.error}` : null,
    ].filter(Boolean);

    console.log(`${timestamp} ${parts.join(' ')}`);
}

// ==================== ERROR TYPES ====================

export class MediaError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500
    ) {
        super(message);
        this.name = 'MediaError';
    }
}

export class ValidationError extends MediaError {
    constructor(message: string, code: string = 'VALIDATION_ERROR') {
        super(message, code, 400);
        this.name = 'ValidationError';
    }
}

export class EmbeddingError extends MediaError {
    constructor(message: string) {
        super(message, 'EMBEDDING_ERROR', 503);
        this.name = 'EmbeddingError';
    }
}

// ==================== THUMBNAIL GENERATION ====================

/**
 * Generate Cloudinary thumbnail URL for video
 */
export function generateVideoThumbnail(
    cloudinaryUrl: string,
    options: { width?: number; height?: number } = {}
): string | null {
    const { width = 400, height = 300 } = options;

    if (!cloudinaryUrl.includes('cloudinary')) {
        return null;
    }

    // Extract public_id and generate thumbnail
    const match = cloudinaryUrl.match(/\/v\d+\/(.+)\.[^.]+$/);
    if (!match) return null;

    return cloudinaryUrl
        .replace(/\.[^.]+$/, '.jpg')
        .replace('/video/', `/video/c_fill,w_${width},h_${height}/`);
}
