'use client';

import { useState, useRef } from 'react';
import { Upload, X, FileText, Video, Image, Volume2, Loader2, Plus, Tag } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    color: string;
}

interface MediaUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    categories: Category[];
}

export default function MediaUploadModal({
    isOpen,
    onClose,
    onSuccess,
    categories,
}: MediaUploadModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [keywords, setKeywords] = useState<string[]>([]);
    const [keywordInput, setKeywordInput] = useState('');
    const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
    const [triggerInput, setTriggerInput] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Facebook Messenger attachment size limit (25MB)
    const MAX_FILE_SIZE = 25 * 1024 * 1024;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check file size limit
            if (file.size > MAX_FILE_SIZE) {
                setError(`File too large. Maximum size is 25MB. Your file is ${formatFileSize(file.size)}.`);
                return;
            }

            setSelectedFile(file);
            setError(null);

            // Generate preview for images/videos
            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                setPreview(url);
            } else if (file.type.startsWith('video/')) {
                const url = URL.createObjectURL(file);
                setPreview(url);
            } else {
                setPreview(null);
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            // Check file size limit
            if (file.size > MAX_FILE_SIZE) {
                setError(`File too large. Maximum size is 25MB. Your file is ${formatFileSize(file.size)}.`);
                return;
            }

            setSelectedFile(file);
            setError(null);

            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                setPreview(URL.createObjectURL(file));
            }
        }
    };

    const handleAddKeyword = () => {
        if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
            setKeywords([...keywords, keywordInput.trim()]);
            setKeywordInput('');
        }
    };

    const handleRemoveKeyword = (keyword: string) => {
        setKeywords(keywords.filter(k => k !== keyword));
    };

    const handleAddTrigger = () => {
        if (triggerInput.trim() && !triggerPhrases.includes(triggerInput.trim())) {
            setTriggerPhrases([...triggerPhrases, triggerInput.trim()]);
            setTriggerInput('');
        }
    };

    const handleRemoveTrigger = (phrase: string) => {
        setTriggerPhrases(triggerPhrases.filter(p => p !== phrase));
    };

    const handleUpload = async () => {
        if (!selectedFile || !title.trim() || !description.trim()) {
            setError('Please fill in all required fields');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            // Step 1: Upload file to Cloudinary via /api/upload (this works)
            const uploadFormData = new FormData();
            uploadFormData.append('file', selectedFile);
            uploadFormData.append('folder', 'ai-media');

            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                body: uploadFormData,
            });

            const uploadData = await uploadRes.json();

            if (!uploadRes.ok || !uploadData.success) {
                throw new Error(uploadData.error || 'Failed to upload file');
            }

            // Step 2: Create media entry with JSON (avoids FormData parsing issues)
            const mediaRes = await fetch('/api/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    mediaUrl: uploadData.url,
                    mediaType: uploadData.attachment_type,
                    categoryId: categoryId || null,
                    keywords: keywords.length > 0 ? keywords : [],
                    triggerPhrases: triggerPhrases.length > 0 ? triggerPhrases : [],
                }),
            });

            const mediaData = await mediaRes.json();

            if (!mediaRes.ok || !mediaData.success) {
                throw new Error(mediaData.error || 'Failed to create media entry');
            }

            onSuccess();
            handleClose();
        } catch (err) {
            console.error('Upload error:', err);
            setError(err instanceof Error ? err.message : 'Failed to upload media');
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setTitle('');
        setDescription('');
        setCategoryId('');
        setKeywords([]);
        setTriggerPhrases([]);
        setKeywordInput('');
        setTriggerInput('');
        setError(null);
        setPreview(null);
        onClose();
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getFileIcon = () => {
        if (!selectedFile) return <Upload size={32} className="text-gray-400" />;
        if (selectedFile.type.startsWith('image/')) return <Image size={32} className="text-blue-500" />;
        if (selectedFile.type.startsWith('video/')) return <Video size={32} className="text-purple-500" />;
        if (selectedFile.type.startsWith('audio/')) return <Volume2 size={32} className="text-green-500" />;
        return <FileText size={32} className="text-gray-500" />;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Upload Media</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                    {/* Drop Zone */}
                    <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                            ${selectedFile
                                ? 'border-teal-300 bg-teal-50'
                                : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
                            }
                        `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*,audio/*,application/pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {selectedFile ? (
                            <div className="flex items-center justify-center gap-4">
                                {preview && selectedFile.type.startsWith('image/') ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={preview} alt="Preview" className="w-20 h-20 object-cover rounded-lg" />
                                ) : preview && selectedFile.type.startsWith('video/') ? (
                                    <video src={preview} className="w-20 h-20 object-cover rounded-lg" />
                                ) : (
                                    getFileIcon()
                                )}
                                <div className="text-left">
                                    <p className="font-medium text-gray-900">{selectedFile.name}</p>
                                    <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {getFileIcon()}
                                <p className="text-gray-600 font-medium mt-2">Drop file here or click to browse</p>
                                <p className="text-sm text-gray-400 mt-1">Supports images, videos, audio, and documents (max 25MB)</p>
                            </>
                        )}
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Amaia Skies Virtual Tour"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what this media contains. AI will use this to match with customer queries..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Be detailed! This description is used by AI to find relevant media for customers.
                        </p>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Category
                        </label>
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        >
                            <option value="">No category</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Keywords */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Keywords
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={keywordInput}
                                onChange={(e) => setKeywordInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                                placeholder="Add keyword..."
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                            />
                            <button
                                type="button"
                                onClick={handleAddKeyword}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <Plus size={16} className="text-gray-600" />
                            </button>
                        </div>
                        {keywords.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {keywords.map((keyword) => (
                                    <span
                                        key={keyword}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                                    >
                                        <Tag size={12} />
                                        {keyword}
                                        <button
                                            onClick={() => handleRemoveKeyword(keyword)}
                                            className="hover:text-blue-900"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Trigger Phrases */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Trigger Phrases (Optional)
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                            Exact phrases that will always trigger this media
                        </p>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={triggerInput}
                                onChange={(e) => setTriggerInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTrigger())}
                                placeholder='e.g., "show me amaia skies"'
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                            />
                            <button
                                type="button"
                                onClick={handleAddTrigger}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <Plus size={16} className="text-gray-600" />
                            </button>
                        </div>
                        {triggerPhrases.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {triggerPhrases.map((phrase) => (
                                    <span
                                        key={phrase}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs"
                                    >
                                        &ldquo;{phrase}&rdquo;
                                        <button
                                            onClick={() => handleRemoveTrigger(phrase)}
                                            className="hover:text-purple-900"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || !title.trim() || !description.trim() || uploading}
                        className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Upload & Index
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
