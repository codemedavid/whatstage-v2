'use client';

import { useState, useEffect } from 'react';
import {
    Video,
    Image as ImageIcon,
    Volume2,
    FileText,
    Plus,
    Filter,
    Search,
    MoreVertical,
    Eye,
    Edit2,
    Trash2,
    ToggleLeft,
    ToggleRight,
    TrendingUp,
    RefreshCw,
    FolderPlus,
    X
} from 'lucide-react';
import MediaUploadModal from '@/app/components/MediaUploadModal';

interface Category {
    id: string;
    name: string;
    description: string | null;
    color: string;
}

interface AIMedia {
    id: string;
    title: string;
    description: string;
    keywords: string[] | null;
    category_id: string | null;
    media_url: string;
    media_type: 'image' | 'video' | 'audio' | 'file';
    thumbnail_url: string | null;
    trigger_phrases: string[] | null;
    is_active: boolean;
    usage_count: number;
    last_used_at: string | null;
    created_at: string;
    category?: Category;
}

export default function MediaLibraryPage() {
    const [media, setMedia] = useState<AIMedia[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
    const [selectedMedia, setSelectedMedia] = useState<AIMedia | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

    // Fetch media and categories
    const fetchData = async () => {
        setLoading(true);
        try {
            const [mediaRes, categoriesRes] = await Promise.all([
                fetch('/api/media'),
                fetch('/api/media/categories')
            ]);

            const mediaData = await mediaRes.json();
            const categoriesData = await categoriesRes.json();

            if (mediaData.success) {
                setMedia(mediaData.media);
            }
            if (categoriesData.success) {
                setCategories(categoriesData.categories);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter media
    const filteredMedia = media.filter(item => {
        const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
        const matchesSearch = !searchQuery ||
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    // Get media type icon
    const getMediaIcon = (type: string) => {
        switch (type) {
            case 'image': return <ImageIcon size={24} className="text-blue-500" />;
            case 'video': return <Video size={24} className="text-purple-500" />;
            case 'audio': return <Volume2 size={24} className="text-green-500" />;
            default: return <FileText size={24} className="text-gray-500" />;
        }
    };

    // Toggle media active status
    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch('/api/media', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive: !currentStatus }),
            });

            if (res.ok) {
                setMedia(media.map(m =>
                    m.id === id ? { ...m, is_active: !currentStatus } : m
                ));
            }
        } catch (error) {
            console.error('Failed to toggle status:', error);
        }
        setActiveDropdown(null);
    };

    // Delete media
    const deleteMedia = async (id: string) => {
        if (!confirm('Are you sure you want to delete this media?')) return;

        try {
            const res = await fetch(`/api/media?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                setMedia(media.filter(m => m.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete media:', error);
        }
        setActiveDropdown(null);
    };

    // Create category
    const createCategory = async () => {
        if (!newCategoryName.trim()) return;

        try {
            const res = await fetch('/api/media/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategoryName, color: newCategoryColor }),
            });

            const data = await res.json();
            if (data.success) {
                setCategories([...categories, data.category]);
                setNewCategoryName('');
                setShowCategoryModal(false);
            }
        } catch (error) {
            console.error('Failed to create category:', error);
        }
    };

    // Stats
    const stats = {
        total: media.length,
        active: media.filter(m => m.is_active).length,
        totalUsage: media.reduce((sum, m) => sum + m.usage_count, 0),
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">AI Media Library</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Media that AI can send to customers during conversations
                        </p>
                    </div>
                    <button
                        onClick={() => setShowUploadModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                    >
                        <Plus size={18} />
                        Upload Media
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="bg-gray-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                        <div className="text-sm text-gray-500">Total Media</div>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                        <div className="text-sm text-gray-500">Active</div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={20} className="text-purple-500" />
                            <span className="text-2xl font-bold text-purple-600">{stats.totalUsage}</span>
                        </div>
                        <div className="text-sm text-gray-500">Total Uses</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 bg-white border-b flex items-center gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search media..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                </div>

                {/* Category Filter */}
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-gray-400" />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    >
                        <option value="all">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>

                {/* Add Category */}
                <button
                    onClick={() => setShowCategoryModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <FolderPlus size={18} />
                    Add Category
                </button>

                {/* Refresh */}
                <button
                    onClick={fetchData}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* Media Grid */}
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw size={32} className="animate-spin text-gray-400" />
                    </div>
                ) : filteredMedia.length === 0 ? (
                    <div className="text-center py-20">
                        <Video size={48} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-600">No media found</h3>
                        <p className="text-gray-400 mt-1">
                            {searchQuery ? 'Try a different search term' : 'Upload some media to get started'}
                        </p>
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                        >
                            Upload First Media
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredMedia.map((item) => (
                            <div
                                key={item.id}
                                className={`bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow ${!item.is_active ? 'opacity-60' : ''
                                    }`}
                            >
                                {/* Thumbnail */}
                                <div
                                    className="aspect-video bg-gray-100 relative cursor-pointer"
                                    onClick={() => {
                                        setSelectedMedia(item);
                                        setShowPreview(true);
                                    }}
                                >
                                    {item.thumbnail_url || (item.media_type === 'image' && item.media_url) ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={item.thumbnail_url || item.media_url}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            {getMediaIcon(item.media_type)}
                                        </div>
                                    )}

                                    {/* Media type badge */}
                                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-full capitalize flex items-center gap-1">
                                        {item.media_type === 'video' && <Video size={12} />}
                                        {item.media_type === 'image' && <ImageIcon size={12} />}
                                        {item.media_type === 'audio' && <Volume2 size={12} />}
                                        {item.media_type}
                                    </div>

                                    {/* Usage count */}
                                    {item.usage_count > 0 && (
                                        <div className="absolute top-2 right-2 px-2 py-1 bg-purple-500 text-white text-xs rounded-full flex items-center gap-1">
                                            <TrendingUp size={12} />
                                            {item.usage_count}
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="p-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                                            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                                                {item.description}
                                            </p>
                                        </div>

                                        {/* Actions dropdown */}
                                        <div className="relative ml-2">
                                            <button
                                                onClick={() => setActiveDropdown(activeDropdown === item.id ? null : item.id)}
                                                className="p-1 hover:bg-gray-100 rounded-lg"
                                            >
                                                <MoreVertical size={16} className="text-gray-400" />
                                            </button>

                                            {activeDropdown === item.id && (
                                                <div className="absolute right-0 top-8 bg-white border rounded-lg shadow-lg py-1 w-40 z-10">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedMedia(item);
                                                            setShowPreview(true);
                                                            setActiveDropdown(null);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        <Eye size={14} /> Preview
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(item.id, item.is_active)}
                                                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        {item.is_active ? (
                                                            <><ToggleLeft size={14} /> Deactivate</>
                                                        ) : (
                                                            <><ToggleRight size={14} /> Activate</>
                                                        )}
                                                    </button>
                                                    <hr className="my-1" />
                                                    <button
                                                        onClick={() => deleteMedia(item.id)}
                                                        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                    >
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Category & Status */}
                                    <div className="flex items-center gap-2 mt-3">
                                        {item.category && (
                                            <span
                                                className="px-2 py-0.5 text-xs rounded-full"
                                                style={{
                                                    backgroundColor: `${item.category.color}20`,
                                                    color: item.category.color
                                                }}
                                            >
                                                {item.category.name}
                                            </span>
                                        )}
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${item.is_active
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-gray-100 text-gray-500'
                                            }`}>
                                            {item.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Upload Modal */}
            <MediaUploadModal
                isOpen={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                onSuccess={fetchData}
                categories={categories}
            />

            {/* Category Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Category</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="e.g., Property Tours"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                                <input
                                    type="color"
                                    value={newCategoryColor}
                                    onChange={(e) => setNewCategoryColor(e.target.value)}
                                    className="w-full h-10 rounded-lg cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setShowCategoryModal(false)}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createCategory}
                                disabled={!newCategoryName.trim()}
                                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {showPreview && selectedMedia && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-lg font-semibold text-gray-900">{selectedMedia.title}</h3>
                            <button
                                onClick={() => setShowPreview(false)}
                                className="p-1 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                            {/* Media Preview */}
                            <div className="bg-gray-100 rounded-lg overflow-hidden mb-4">
                                {selectedMedia.media_type === 'image' && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={selectedMedia.media_url}
                                        alt={selectedMedia.title}
                                        className="w-full max-h-[400px] object-contain"
                                    />
                                )}
                                {selectedMedia.media_type === 'video' && (
                                    <video
                                        src={selectedMedia.media_url}
                                        controls
                                        className="w-full max-h-[400px]"
                                    />
                                )}
                                {selectedMedia.media_type === 'audio' && (
                                    <div className="p-8 flex justify-center">
                                        <audio src={selectedMedia.media_url} controls />
                                    </div>
                                )}
                            </div>

                            {/* Details */}
                            <div className="space-y-3">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700">Description</h4>
                                    <p className="text-gray-600 mt-1">{selectedMedia.description}</p>
                                </div>

                                {selectedMedia.keywords && selectedMedia.keywords.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700">Keywords</h4>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {selectedMedia.keywords.map(k => (
                                                <span key={k} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                                                    {k}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedMedia.trigger_phrases && selectedMedia.trigger_phrases.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700">Trigger Phrases</h4>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {selectedMedia.trigger_phrases.map(p => (
                                                <span key={p} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                                                    &ldquo;{p}&rdquo;
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-4 text-sm text-gray-500">
                                    <span>Used {selectedMedia.usage_count} times</span>
                                    {selectedMedia.last_used_at && (
                                        <span>Last used: {new Date(selectedMedia.last_used_at).toLocaleDateString()}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
