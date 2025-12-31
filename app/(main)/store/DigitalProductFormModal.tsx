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
    FileText
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
    media_type: 'image' | 'video';
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

    const [forms, setForms] = useState<Form[]>([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

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
                                                <img
                                                    src={item.thumbnail_url || item.media_url}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                                {item.media_type === 'video' && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                        <Video className="w-6 h-6 text-white" />
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
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label className="flex flex-col items-center justify-center py-6 cursor-pointer hover:bg-gray-100 rounded-xl transition-colors">
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
                                                Click to upload images or videos
                                            </span>
                                            <span className="text-xs text-gray-400 mt-1">
                                                First item will be the main banner
                                            </span>
                                        </>
                                    )}
                                </label>
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
