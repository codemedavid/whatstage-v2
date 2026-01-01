'use client';

import { useRef, useState, useEffect } from 'react';
import {
    Plus,
    Loader2,
    Image as ImageIcon,
    Video,
    X,
    ChevronDown,
    Trash2,
    GripVertical,
    ExternalLink,
    FileText,
    Bell,
    Link
} from 'lucide-react';

interface ProductCategory {
    id: string;
    name: string;
    color: string;
}

interface Form {
    id: string;
    title: string;
    is_active: boolean;
}

interface MediaItem {
    id?: string;
    media_type: 'image' | 'video' | 'video_link';
    media_url: string;
    thumbnail_url?: string | null;
    isNew?: boolean;
}

interface DigitalProduct {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    price: number | null;
    currency: string;
    category_id: string | null;
    checkout_form_id: string | null;
    is_active: boolean;
    access_type: string;
    access_duration_days: number | null;
    payment_type: 'one_time' | 'recurring';
    billing_interval: 'monthly' | 'yearly';
    thumbnail_url: string | null;
    creator_name: string | null;
    notification_title: string | null;
    notification_greeting: string | null;
    notification_button_text: string | null;
    notification_button_url: string | null;
    media?: MediaItem[];
}

interface DigitalProductFormModalProps {
    isOpen: boolean;
    editingProduct: DigitalProduct | null;
    categories: ProductCategory[];
    onSave: (product: Partial<DigitalProduct> & { media?: MediaItem[] }) => Promise<void>;
    onClose: () => void;
}

export default function DigitalProductFormModal({
    isOpen,
    editingProduct,
    categories,
    onSave,
    onClose
}: DigitalProductFormModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [shortDescription, setShortDescription] = useState('');
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState('PHP');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [checkoutFormId, setCheckoutFormId] = useState<string | null>(null);
    const [accessType, setAccessType] = useState('instant');
    const [accessDurationDays, setAccessDurationDays] = useState('');
    const [paymentType, setPaymentType] = useState<'one_time' | 'recurring'>('one_time');
    const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
    const [creatorName, setCreatorName] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);

    // Notification settings
    const [notificationTitle, setNotificationTitle] = useState('');
    const [notificationGreeting, setNotificationGreeting] = useState('');
    const [notificationButtonText, setNotificationButtonText] = useState('');
    const [notificationButtonUrl, setNotificationButtonUrl] = useState('');

    const [forms, setForms] = useState<Form[]>([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Video link modal state
    const [showVideoLinkInput, setShowVideoLinkInput] = useState(false);
    const [videoLinkUrl, setVideoLinkUrl] = useState('');
    const [addingVideoLink, setAddingVideoLink] = useState(false);

    // Helper function to extract video info from URL
    const getVideoInfoFromUrl = (url: string): { type: 'youtube' | 'vimeo' | 'loom' | 'other'; videoId: string | null; thumbnailUrl: string | null } => {
        // YouTube patterns
        const youtubePatterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
        ];
        for (const pattern of youtubePatterns) {
            const match = url.match(pattern);
            if (match) {
                const videoId = match[1];
                return {
                    type: 'youtube',
                    videoId,
                    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                };
            }
        }

        // Vimeo pattern
        const vimeoPattern = /vimeo\.com\/(\d+)/;
        const vimeoMatch = url.match(vimeoPattern);
        if (vimeoMatch) {
            return {
                type: 'vimeo',
                videoId: vimeoMatch[1],
                thumbnailUrl: null // Vimeo requires API call for thumbnails
            };
        }

        // Loom pattern
        const loomPattern = /loom\.com\/share\/([a-zA-Z0-9]+)/;
        const loomMatch = url.match(loomPattern);
        if (loomMatch) {
            const videoId = loomMatch[1];
            return {
                type: 'loom',
                videoId,
                thumbnailUrl: `https://cdn.loom.com/sessions/thumbnails/${videoId}-with-play.gif`
            };
        }

        return { type: 'other', videoId: null, thumbnailUrl: null };
    };

    // Fetch available forms
    useEffect(() => {
        const fetchForms = async () => {
            try {
                const res = await fetch('/api/forms');
                if (res.ok) {
                    const data = await res.json();
                    setForms(data.filter((f: Form) => f.is_active));
                }
            } catch (error) {
                console.error('Error fetching forms:', error);
            }
        };
        if (isOpen) fetchForms();
    }, [isOpen]);

    // Initialize form when editing
    useEffect(() => {
        if (editingProduct) {
            setTitle(editingProduct.title);
            setDescription(editingProduct.description || '');
            setShortDescription(editingProduct.short_description || '');
            setPrice(editingProduct.price?.toString() || '');
            setCurrency(editingProduct.currency || 'PHP');
            setCategoryId(editingProduct.category_id);
            setCheckoutFormId(editingProduct.checkout_form_id);
            setAccessType(editingProduct.access_type || 'instant');
            setAccessDurationDays(editingProduct.access_duration_days?.toString() || '');
            setPaymentType(editingProduct.payment_type || 'one_time');
            setBillingInterval(editingProduct.billing_interval || 'monthly');
            setThumbnailUrl(editingProduct.thumbnail_url || null);
            setCreatorName(editingProduct.creator_name || '');
            setMedia(editingProduct.media || []);
            setNotificationTitle(editingProduct.notification_title || '');
            setNotificationGreeting(editingProduct.notification_greeting || '');
            setNotificationButtonText(editingProduct.notification_button_text || '');
            setNotificationButtonUrl(editingProduct.notification_button_url || '');
        } else {
            resetForm();
        }
    }, [editingProduct, isOpen]);

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setShortDescription('');
        setPrice('');
        setCurrency('PHP');
        setCategoryId(null);
        setCheckoutFormId(null);
        setAccessType('instant');
        setAccessDurationDays('');
        setPaymentType('one_time');
        setBillingInterval('monthly');
        setThumbnailUrl(null);
        setCreatorName('');
        setMedia([]);
        setNotificationTitle('');
        setNotificationGreeting('');
        setNotificationButtonText('');
        setNotificationButtonUrl('');
    };

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingThumbnail(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                setThumbnailUrl(data.url);
            }
        } catch (error) {
            console.error('Error uploading thumbnail:', error);
        } finally {
            setUploadingThumbnail(false);
            if (thumbnailInputRef.current) {
                thumbnailInputRef.current.value = '';
            }
        }
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        const newMedia: MediaItem[] = [];

        for (const file of Array.from(files)) {
            const isVideo = file.type.startsWith('video/');
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    const data = await res.json();
                    newMedia.push({
                        media_type: isVideo ? 'video' : 'image',
                        media_url: data.url,
                        thumbnail_url: isVideo ? data.thumbnail_url : null,
                        isNew: true
                    });
                }
            } catch (error) {
                console.error('Error uploading file:', error);
            }
        }

        setMedia(prev => [...prev, ...newMedia]);
        setUploading(false);

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeMedia = (index: number) => {
        setMedia(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddVideoLink = () => {
        if (!videoLinkUrl.trim()) {
            alert('Please enter a video URL');
            return;
        }

        // Basic URL validation
        try {
            new URL(videoLinkUrl);
        } catch {
            alert('Please enter a valid URL');
            return;
        }

        setAddingVideoLink(true);

        const videoInfo = getVideoInfoFromUrl(videoLinkUrl);

        const newMediaItem: MediaItem = {
            media_type: 'video_link',
            media_url: videoLinkUrl.trim(),
            thumbnail_url: videoInfo.thumbnailUrl,
            isNew: true
        };

        setMedia(prev => [...prev, newMediaItem]);
        setVideoLinkUrl('');
        setShowVideoLinkInput(false);
        setAddingVideoLink(false);
    };

    const handleSubmit = async () => {
        if (!title.trim()) {
            alert('Title is required');
            return;
        }

        setSaving(true);
        try {
            await onSave({
                id: editingProduct?.id,
                title: title.trim(),
                description: description.trim() || null,
                short_description: shortDescription.trim() || null,
                price: price ? parseFloat(price) : null,
                currency,
                category_id: categoryId,
                checkout_form_id: checkoutFormId,
                is_active: editingProduct?.is_active ?? true,
                access_type: accessType,
                access_duration_days: accessDurationDays ? parseInt(accessDurationDays) : null,
                payment_type: paymentType,
                billing_interval: billingInterval,
                thumbnail_url: thumbnailUrl,
                creator_name: creatorName.trim() || null,
                notification_title: notificationTitle.trim() || null,
                notification_greeting: notificationGreeting.trim() || null,
                notification_button_text: notificationButtonText.trim() || null,
                notification_button_url: notificationButtonUrl.trim() || null,
                media: media.map(m => ({
                    media_type: m.media_type,
                    media_url: m.media_url,
                    thumbnail_url: m.thumbnail_url
                }))
            });
            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Failed to save product');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[32px] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            {editingProduct ? 'Edit Digital Product' : 'Add Digital Product'}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Courses, digital downloads, and online content
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-full border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
                    {/* Basic Info */}
                    <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-6">General Information</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Product Title
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g., Complete Marketing Mastery Course"
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Short Description
                                </label>
                                <input
                                    type="text"
                                    value={shortDescription}
                                    onChange={e => setShortDescription(e.target.value)}
                                    placeholder="Brief tagline shown on the product page"
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Full Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Detailed description, what's included, benefits..."
                                    rows={4}
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Creator Name
                                    <span className="text-xs text-gray-400 ml-2">(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={creatorName}
                                    onChange={e => setCreatorName(e.target.value)}
                                    placeholder="e.g., John Doe, WhatStage Team"
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Thumbnail & Media Section */}
                    <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-6">Media</h3>

                        {/* Thumbnail Upload */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Thumbnail Image
                                <span className="text-xs text-gray-400 ml-2">(Used in product cards)</span>
                            </label>
                            <div className="flex items-start gap-4">
                                {thumbnailUrl ? (
                                    <div className="relative w-32 h-20 rounded-xl overflow-hidden border-2 border-emerald-500 group">
                                        <img
                                            src={thumbnailUrl}
                                            alt="Thumbnail"
                                            className="w-full h-full object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setThumbnailUrl(null)}
                                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <label className="w-32 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
                                        <input
                                            ref={thumbnailInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleThumbnailUpload}
                                            className="hidden"
                                        />
                                        {uploadingThumbnail ? (
                                            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                                        ) : (
                                            <>
                                                <Plus className="w-5 h-5 text-gray-400" />
                                                <span className="text-xs text-gray-500 mt-1">Upload</span>
                                            </>
                                        )}
                                    </label>
                                )}
                                <div className="text-xs text-gray-400 pt-1">
                                    Recommended: 16:9 ratio, min 400x225px
                                </div>
                            </div>
                        </div>

                        {/* Media Gallery */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Media Gallery (Images & Videos)
                            </label>
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                {media.length > 0 && (
                                    <div className="grid grid-cols-4 gap-3 mb-4">
                                        {media.map((item, index) => (
                                            <div
                                                key={index}
                                                className={`relative aspect-video bg-gray-100 rounded-xl overflow-hidden group ${index === 0 ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                                            >
                                                {item.thumbnail_url ? (
                                                    <img
                                                        src={item.thumbnail_url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : item.media_type === 'video_link' ? (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                                                        <Link className="w-8 h-8 text-white/60" />
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={item.media_url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                )}
                                                {(item.media_type === 'video' || item.media_type === 'video_link') && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                        {item.media_type === 'video_link' ? (
                                                            <Link className="w-6 h-6 text-white" />
                                                        ) : (
                                                            <Video className="w-6 h-6 text-white" />
                                                        )}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => removeMedia(index)}
                                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                                                >
                                                    <X size={14} />
                                                </button>
                                                {index === 0 && (
                                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded">
                                                        PRIMARY
                                                    </div>
                                                )}
                                                {item.media_type === 'video_link' && (
                                                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">
                                                        LINK
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Video Link Input */}
                                {showVideoLinkInput && (
                                    <div className="mb-4 p-4 bg-white rounded-xl border border-gray-200">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Video URL (YouTube, Loom, Vimeo)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="url"
                                                value={videoLinkUrl}
                                                onChange={e => setVideoLinkUrl(e.target.value)}
                                                placeholder="https://youtube.com/watch?v=... or https://www.loom.com/share/..."
                                                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-lg transition-all text-gray-900 placeholder:text-gray-400 font-medium text-sm"
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddVideoLink();
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddVideoLink}
                                                disabled={addingVideoLink}
                                                className="px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium text-sm disabled:opacity-50"
                                            >
                                                {addingVideoLink ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowVideoLinkInput(false);
                                                    setVideoLinkUrl('');
                                                }}
                                                className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">
                                            Supports YouTube, Loom, and Vimeo links
                                        </p>
                                    </div>
                                )}

                                {/* Upload and Add Link Actions */}
                                <div className="flex gap-3">
                                    <label className="flex-1 flex flex-col items-center justify-center py-6 cursor-pointer hover:bg-gray-100 rounded-xl transition-colors border border-transparent hover:border-gray-200">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*,video/*"
                                            multiple
                                            onChange={handleMediaUpload}
                                            className="hidden"
                                        />
                                        {uploading ? (
                                            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                                        ) : (
                                            <>
                                                <div className="flex gap-2 mb-2">
                                                    <ImageIcon className="w-6 h-6 text-gray-400" />
                                                    <Video className="w-6 h-6 text-gray-400" />
                                                </div>
                                                <span className="text-sm text-gray-600 font-medium">
                                                    Upload files
                                                </span>
                                                <span className="text-xs text-gray-400 mt-1">
                                                    Images or videos
                                                </span>
                                            </>
                                        )}
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => setShowVideoLinkInput(true)}
                                        className="flex-1 flex flex-col items-center justify-center py-6 cursor-pointer hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-200"
                                        disabled={showVideoLinkInput}
                                    >
                                        <Link className="w-6 h-6 text-blue-400 mb-2" />
                                        <span className="text-sm text-gray-600 font-medium">
                                            Add video link
                                        </span>
                                        <span className="text-xs text-gray-400 mt-1">
                                            YouTube, Loom, Vimeo
                                        </span>
                                    </button>
                                </div>

                                <p className="text-xs text-gray-400 mt-3 text-center">
                                    First item will be the main banner
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Pricing Section */}
                    <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-6">Pricing & Settings</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Price
                                </label>
                                <div className="relative">
                                    <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">₱</span>
                                    <input
                                        type="number"
                                        value={price}
                                        onChange={e => setPrice(e.target.value)}
                                        placeholder="0.00 (Free)"
                                        step="0.01"
                                        min="0"
                                        className="w-full pl-10 pr-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                    />
                                </div>
                            </div>

                            {/* Payment Type */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Payment Type
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('one_time')}
                                        className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${paymentType === 'one_time'
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}
                                    >
                                        <div className="font-semibold">One-time</div>
                                        <div className="text-xs opacity-70">Single payment</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('recurring')}
                                        className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${paymentType === 'recurring'
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}
                                    >
                                        <div className="font-semibold">Recurring</div>
                                        <div className="text-xs opacity-70">Subscription</div>
                                    </button>
                                </div>
                                {paymentType === 'recurring' && (
                                    <div className="mt-3">
                                        <select
                                            value={billingInterval}
                                            onChange={e => setBillingInterval(e.target.value as 'monthly' | 'yearly')}
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium cursor-pointer"
                                        >
                                            <option value="monthly">Monthly billing</option>
                                            <option value="yearly">Yearly billing</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Category
                                </label>
                                <select
                                    value={categoryId || ''}
                                    onChange={e => setCategoryId(e.target.value || null)}
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium cursor-pointer"
                                >
                                    <option value="">No category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Checkout Form Selection */}
                        <div className="mt-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Checkout Form <span className="text-emerald-600">(Lead Gen Form)</span>
                            </label>
                            <div className="relative">
                                <select
                                    value={checkoutFormId || ''}
                                    onChange={e => setCheckoutFormId(e.target.value || null)}
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium cursor-pointer appearance-none pr-10"
                                >
                                    <option value="">Select a checkout form...</option>
                                    {forms.map(form => (
                                        <option key={form.id} value={form.id}>{form.title}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                            </div>
                            {checkoutFormId && (
                                <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                                    <FileText size={14} />
                                    <a
                                        href={`/forms/${checkoutFormId}`}
                                        target="_blank"
                                        className="hover:underline flex items-center gap-1"
                                    >
                                        Edit form fields
                                        <ExternalLink size={12} />
                                    </a>
                                </div>
                            )}
                            {forms.length === 0 && (
                                <p className="mt-2 text-sm text-amber-600">
                                    No forms found. <a href="/forms" className="underline">Create a Lead Gen Form</a> first.
                                </p>
                            )}
                        </div>

                        {/* Access Settings */}
                        <div className="grid grid-cols-2 gap-6 mt-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Access Type
                                </label>
                                <select
                                    value={accessType}
                                    onChange={e => setAccessType(e.target.value)}
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium cursor-pointer"
                                >
                                    <option value="instant">Instant Access</option>
                                    <option value="scheduled">Scheduled Release</option>
                                    <option value="drip">Drip Content</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Access Duration
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        value={accessDurationDays}
                                        onChange={e => setAccessDurationDays(e.target.value)}
                                        placeholder="Lifetime"
                                        min="1"
                                        className="flex-1 px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                    />
                                    <span className="ml-2 text-sm text-gray-500">days</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Leave empty for lifetime access</p>
                            </div>
                        </div>
                    </section>

                    {/* Notification Settings */}
                    <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <Bell className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Notification Settings</h3>
                                <p className="text-sm text-gray-500">Message sent to customers after purchase</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Notification Title
                                    <span className="text-xs text-gray-400 ml-2">(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={notificationTitle}
                                    onChange={e => setNotificationTitle(e.target.value)}
                                    placeholder="e.g., Thank You for Your Purchase! 🎉"
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Greeting Message
                                    <span className="text-xs text-gray-400 ml-2">(optional)</span>
                                </label>
                                <textarea
                                    value={notificationGreeting}
                                    onChange={e => setNotificationGreeting(e.target.value)}
                                    placeholder="e.g., Thank you for purchasing [Product Name]! Your order has been received and is being processed."
                                    rows={3}
                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Button Text
                                        <span className="text-xs text-gray-400 ml-2">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={notificationButtonText}
                                        onChange={e => setNotificationButtonText(e.target.value)}
                                        placeholder="e.g., View Order Details"
                                        className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Button URL
                                        <span className="text-xs text-gray-400 ml-2">(optional)</span>
                                    </label>
                                    <input
                                        type="url"
                                        value={notificationButtonUrl}
                                        onChange={e => setNotificationButtonUrl(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400">
                                Leave empty to use default notification. Button only appears if both text and URL are provided.
                            </p>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-gray-100 bg-white flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={saving || !title.trim()}
                        className="flex items-center gap-2 px-8 py-2.5 bg-[#4ADE80] text-emerald-950 rounded-full hover:bg-[#22c55e] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving && <Loader2 className="animate-spin" size={18} />}
                        {editingProduct ? 'Save Changes' : 'Add Digital Product'}
                    </button>
                </div>
            </div>
        </div>
    );
}
