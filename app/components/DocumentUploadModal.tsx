'use client';

import { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    type: string;
    color: string;
}

interface DocumentUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    categories: Category[];
    selectedCategoryId?: string;
}

interface UploadResult {
    success: boolean;
    filename?: string;
    pageCount?: number;
    chunkCount?: number;
    chunksStored?: number;
    error?: string;
}

export default function DocumentUploadModal({
    isOpen,
    onClose,
    onSuccess,
    categories,
    selectedCategoryId,
}: DocumentUploadModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [categoryId, setCategoryId] = useState<string>(selectedCategoryId || '');
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setResult(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            // Validate file type
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (['pdf', 'txt', 'md'].includes(ext || '')) {
                setSelectedFile(file);
                setResult(null);
            } else {
                setResult({ success: false, error: 'Unsupported file type. Please use PDF, TXT, or MD.' });
            }
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            if (categoryId) {
                formData.append('categoryId', categoryId);
            }

            const res = await fetch('/api/knowledge/upload-document', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setResult({
                    success: true,
                    filename: data.filename,
                    pageCount: data.pageCount,
                    chunkCount: data.chunkCount,
                    chunksStored: data.chunksStored,
                });
                // Auto-close after success
                setTimeout(() => {
                    onSuccess();
                    handleClose();
                }, 2000);
            } else {
                setResult({
                    success: false,
                    error: data.error || 'Failed to upload document',
                });
            }
        } catch (error) {
            console.error('Upload error:', error);
            setResult({
                success: false,
                error: 'Network error. Please try again.',
            });
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setResult(null);
        setCategoryId(selectedCategoryId || '');
        onClose();
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
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
                            accept=".pdf,.txt,.md"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {selectedFile ? (
                            <div className="flex items-center justify-center gap-3">
                                <FileText size={24} className="text-teal-600" />
                                <div className="text-left">
                                    <p className="font-medium text-gray-900">{selectedFile.name}</p>
                                    <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                                <p className="text-gray-600 font-medium">Drop file here or click to browse</p>
                                <p className="text-sm text-gray-400 mt-1">Supports PDF, TXT, MD</p>
                            </>
                        )}
                    </div>

                    {/* Category Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Category (optional)
                        </label>
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className="w-full px-3 py-2 border text-black border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        >
                            <option value="">No category</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Result Message */}
                    {result && (
                        <div
                            className={`p-3 rounded-lg flex items-start gap-2 ${result.success
                                ? 'bg-green-50 text-green-700'
                                : 'bg-red-50 text-red-700'
                                }`}
                        >
                            {result.success ? (
                                <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />
                            ) : (
                                <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                            )}
                            <div className="text-sm">
                                {result.success ? (
                                    <>
                                        <p className="font-medium">Document uploaded successfully!</p>
                                        <p className="text-green-600">
                                            {result.pageCount} page(s) → {result.chunksStored} chunks stored
                                        </p>
                                    </>
                                ) : (
                                    <p>{result.error}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-2xl">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                        className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Upload
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
