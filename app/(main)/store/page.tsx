
'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Search,
    Package,
    Trash2,
    Edit2,
    X,
    ToggleLeft,
    ToggleRight,
    Loader2,
    FolderPlus,
    Building,
    MapPin,
    BedDouble,
    Bath,
    Maximize,
    BookOpen,
    Film,
    ExternalLink
} from 'lucide-react';
import Link from 'next/link';

// Lazy load modal components for code splitting
const ProductFormModal = lazy(() => import('./ProductFormModal'));
const CategoryFormModal = lazy(() => import('./CategoryFormModal'));
const PropertyFormModal = lazy(() => import('./PropertyFormModal'));
const ConfirmModal = lazy(() => import('./ConfirmModal'));
const DigitalProductFormModal = lazy(() => import('./DigitalProductFormModal'));

interface ProductCategory {
    id: string;
    name: string;
    color: string;
    description: string | null;
}

interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    category_id: string | null;
    category: ProductCategory | null;
    is_active: boolean;
    display_order: number;
}

interface Property {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    status: 'for_sale' | 'for_rent' | 'sold' | 'rented';
    image_url: string | null;
    is_active: boolean;
    // New fields
    property_type: string | null;
    year_built: number | null;
    lot_area: number | null;
    garage_spaces: number | null;
    down_payment: number | null;
    monthly_amortization: number | null;
    payment_terms: string | null;
}

interface DigitalProductMedia {
    id?: string;
    media_type: 'image' | 'video' | 'video_link';
    media_url: string;
    thumbnail_url?: string | null;
}

interface DigitalProduct {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    price: number | null;
    currency: string;
    category_id: string | null;
    category: ProductCategory | null;
    checkout_form_id: string | null;
    checkout_form: { id: string; title: string } | null;
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
    media: DigitalProductMedia[];
}

export default function StorePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [storeType, setStoreType] = useState<'ecommerce' | 'real_estate' | 'digital_product' | null>(null);
    const [activeTab, setActiveTab] = useState<'products' | 'digital'>('products');

    // E-commerce state
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
    const [isEditingProduct, setIsEditingProduct] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formPrice, setFormPrice] = useState('');
    const [formImageUrl, setFormImageUrl] = useState('');
    const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('#6B7280');

    // Real Estate state
    const [properties, setProperties] = useState<Property[]>([]);
    const [isEditingProperty, setIsEditingProperty] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [propertyFormData, setPropertyFormData] = useState<any>({});

    // Digital Products state
    const [digitalProducts, setDigitalProducts] = useState<DigitalProduct[]>([]);
    const [isEditingDigitalProduct, setIsEditingDigitalProduct] = useState(false);
    const [editingDigitalProduct, setEditingDigitalProduct] = useState<DigitalProduct | null>(null);

    // Joint state
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    useEffect(() => {
        checkStoreSettings();
    }, []);

    const checkStoreSettings = async () => {
        try {
            const res = await fetch('/api/store-settings');
            const settings = await res.json();

            if (!settings || !settings.setup_completed) {
                router.push('/setup');
                return;
            }

            setStoreType(settings.store_type);

            if (settings.store_type === 'ecommerce') {
                await Promise.all([fetchProducts(), fetchCategories(), fetchDigitalProducts()]);
            } else if (settings.store_type === 'digital_product') {
                // Digital Product only mode - default to digital tab and only fetch digital products
                setActiveTab('digital');
                await Promise.all([fetchCategories(), fetchDigitalProducts()]);
            } else if (settings.store_type === 'real_estate') {
                await fetchProperties();
            }
        } catch (error) {
            console.error('Failed to check settings:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- E-COMMERCE FUNCTIONS ---

    const fetchProducts = async () => {
        try {
            const res = await fetch('/api/products');
            const data = await res.json();
            setProducts(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch products:', error);
            setProducts([]);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/product-categories');
            const data = await res.json();
            setCategories(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch categories:', error);
            setCategories([]);
        }
    };

    const resetProductForm = () => {
        setFormName('');
        setFormDescription('');
        setFormPrice('');
        setFormImageUrl('');
        setFormCategoryId(null);
        setEditingProduct(null);
        setIsEditingProduct(false);
    };

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product);
        setFormName(product.name);
        setFormDescription(product.description || '');
        setFormPrice(product.price?.toString() || '');
        setFormImageUrl(product.image_url || '');
        setFormCategoryId(product.category_id);
        setIsEditingProduct(true);
    };

    const handleSaveProduct = async () => {
        if (!formName.trim()) return;
        setSaving(true);
        try {
            const payload = {
                id: editingProduct?.id,
                name: formName.trim(),
                description: formDescription.trim() || null,
                price: formPrice ? parseFloat(formPrice) : null,
                imageUrl: formImageUrl || null,
                categoryId: formCategoryId,
            };
            const res = await fetch('/api/products', {
                method: editingProduct ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const savedProduct = await res.json();
                const productId = savedProduct.id;
                // Save variations logic (kept from original)
                const variations = (window as any).__productVariations || [];
                for (const variation of variations) {
                    if (variation.isNew || !variation.id) {
                        await fetch('/api/product-variations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                productId,
                                variationTypeId: variation.variation_type_id,
                                value: variation.value,
                                price: variation.price,
                            }),
                        });
                    } else {
                        await fetch('/api/product-variations', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: variation.id,
                                value: variation.value,
                                price: variation.price,
                            }),
                        });
                    }
                }
                delete (window as any).__productVariations;
                await fetchProducts();
                resetProductForm();
            }
        } catch (error) {
            console.error('Failed to save product:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleProductActive = async (product: Product) => {
        try {
            await fetch('/api/products', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, isActive: !product.is_active }),
            });
            await fetchProducts();
        } catch (error) {
            console.error('Failed to toggle product:', error);
        }
    };

    const handleDeleteProduct = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Product',
            message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
                    await fetchProducts();
                } catch (error) {
                    console.error('Failed to delete product:', error);
                }
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            },
        });
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            await fetch('/api/product-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor }),
            });
            await fetchCategories();
            setNewCategoryName('');
            setShowCategoryForm(false);
        } catch (error) {
            console.error('Failed to add category:', error);
        }
    };

    const handleDeleteCategory = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Category',
            message: `Are you sure you want to delete "${name}"? Products in this category will become uncategorized.`,
            onConfirm: async () => {
                try {
                    await fetch(`/api/product-categories?id=${id}`, { method: 'DELETE' });
                    if (selectedCategoryFilter === id) setSelectedCategoryFilter(null);
                    await fetchCategories();
                    await fetchProducts();
                } catch (error) {
                    console.error('Failed to delete category:', error);
                }
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            },
        });
    };

    // --- DIGITAL PRODUCTS FUNCTIONS ---

    const fetchDigitalProducts = async () => {
        try {
            const res = await fetch('/api/digital-products');
            const data = await res.json();
            setDigitalProducts(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch digital products:', error);
            setDigitalProducts([]);
        }
    };

    const handleEditDigitalProduct = (product: DigitalProduct) => {
        setEditingDigitalProduct(product);
        setIsEditingDigitalProduct(true);
    };

    const handleSaveDigitalProduct = async (productData: Partial<DigitalProduct> & { media?: DigitalProductMedia[] }) => {
        try {
            const isEditing = !!productData.id;
            const res = await fetch(isEditing ? `/api/digital-products/${productData.id}` : '/api/digital-products', {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productData),
            });

            if (res.ok) {
                await fetchDigitalProducts();
                setEditingDigitalProduct(null);
                setIsEditingDigitalProduct(false);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('Failed to save digital product:', error);
            throw error;
        }
    };

    const handleToggleDigitalProductActive = async (product: DigitalProduct) => {
        try {
            await fetch(`/api/digital-products/${product.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !product.is_active }),
            });
            await fetchDigitalProducts();
        } catch (error) {
            console.error('Failed to toggle digital product:', error);
        }
    };

    const handleDeleteDigitalProduct = (id: string, title: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Digital Product',
            message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    await fetch(`/api/digital-products/${id}`, { method: 'DELETE' });
                    await fetchDigitalProducts();
                } catch (error) {
                    console.error('Failed to delete digital product:', error);
                }
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            },
        });
    };

    // Filtered Digital Products
    const filteredDigitalProducts = digitalProducts.filter(product =>
        product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // --- REAL ESTATE FUNCTIONS ---

    const fetchProperties = async () => {
        try {
            const res = await fetch('/api/properties');
            const data = await res.json();
            setProperties(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch properties:', error);
            setProperties([]);
        }
    };

    const resetPropertyForm = () => {
        setPropertyFormData({});
        setEditingProperty(null);
        setIsEditingProperty(false);
    };

    const handleEditProperty = (property: Property) => {
        setEditingProperty(property);
        // Handle both new imageUrls array and legacy imageUrl field
        const imageUrls = (property as any).image_urls || (property.image_url ? [property.image_url] : []);
        setPropertyFormData({
            title: property.title,
            description: property.description,
            price: property.price,
            address: property.address,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            sqft: property.sqft,
            status: property.status,
            imageUrls: imageUrls,
            isActive: property.is_active,
            // New fields
            propertyType: property.property_type,
            yearBuilt: property.year_built,
            lotArea: property.lot_area,
            garageSpaces: property.garage_spaces,
            downPayment: property.down_payment,
            monthlyAmortization: property.monthly_amortization,
            paymentTerms: property.payment_terms,
        });
        setIsEditingProperty(true);
    };

    const handleSaveProperty = async () => {
        if (!propertyFormData.title) return;
        setSaving(true);
        try {
            const payload = {
                id: editingProperty?.id,
                ...propertyFormData
            };
            const res = await fetch('/api/properties', {
                method: editingProperty ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                await fetchProperties();
                resetPropertyForm();
            }
        } catch (error) {
            console.error('Failed to save property:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteProperty = (id: string, title: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Property',
            message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    await fetch(`/api/properties?id=${id}`, { method: 'DELETE' });
                    await fetchProperties();
                } catch (error) {
                    console.error('Failed to delete property:', error);
                }
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            },
        });
    };

    const handleTogglePropertyActive = async (property: Property) => {
        try {
            await fetch('/api/properties', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: property.id, isActive: !property.is_active }),
            });
            await fetchProperties();
        } catch (error) {
            console.error('Failed to toggle property active:', error);
        }
    }


    // --- SHARED FUNCTIONS ---

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            if (storeType === 'ecommerce' || storeType === 'digital_product') {
                // E-commerce/Digital Product: single image upload
                const file = files[0];
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success && data.url) {
                    setFormImageUrl(data.url);
                }
            } else {
                // Real Estate: multiple image upload
                const uploadedUrls: string[] = [];
                for (const file of Array.from(files)) {
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (data.success && data.url) {
                        uploadedUrls.push(data.url);
                    }
                }
                // Append to existing images
                setPropertyFormData((prev: any) => ({
                    ...prev,
                    imageUrls: [...(prev.imageUrls || []), ...uploadedUrls]
                }));
            }
        } catch (error) {
            console.error('Failed to upload image:', error);
        } finally {
            setUploading(false);
            // Reset file input to allow re-selecting same files
            e.target.value = '';
        }
    };

    const formatPrice = (price: number | null) => {
        if (price === null) return 'Price on Request';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`; // Real estate usually whole numbers
    };

    // Filtered Products (E-commerce)
    const filteredProducts = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = !selectedCategoryFilter || product.category_id === selectedCategoryFilter;
        return matchesSearch && matchesCategory;
    });

    // Filtered Properties (Real Estate) - Simple search for now
    const filteredProperties = properties.filter(prop =>
        prop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prop.address?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="animate-spin text-teal-500" size={40} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="max-w-7xl mx-auto p-8">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                            {storeType === 'real_estate' ? 'Properties' : 'Store'}
                        </h1>
                        <p className="text-gray-500 mt-2 text-lg">
                            {storeType === 'real_estate' ? 'Manage your real estate listings' : 'Manage your products and inventory'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {(storeType === 'ecommerce' || storeType === 'digital_product') ? (
                            <>
                                {activeTab === 'products' ? (
                                    <>
                                        <button
                                            onClick={() => setShowCategoryForm(true)}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-sm shadow-sm"
                                        >
                                            <FolderPlus size={18} />
                                            Add Category
                                        </button>
                                        <button
                                            onClick={() => setIsEditingProduct(true)}
                                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-full hover:from-teal-600 hover:to-emerald-600 transition-all font-medium text-sm shadow-lg shadow-teal-500/25"
                                        >
                                            <Plus size={18} />
                                            Add Product
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setIsEditingDigitalProduct(true)}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full hover:from-emerald-600 hover:to-teal-600 transition-all font-medium text-sm shadow-lg shadow-emerald-500/25"
                                    >
                                        <Plus size={18} />
                                        Add Digital Product
                                    </button>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditingProperty(true)}
                                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full hover:from-emerald-600 hover:to-teal-600 transition-all font-medium text-sm shadow-lg shadow-emerald-500/25"
                            >
                                <Plus size={18} />
                                List Property
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab Navigation - E-commerce only */}
                {(storeType === 'ecommerce' || storeType === 'digital_product') && (
                    <div className="flex items-center gap-2 mb-6">
                        <button
                            onClick={() => setActiveTab('products')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${activeTab === 'products' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                        >
                            <Package size={18} />
                            Products
                            <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'products' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                {products.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('digital')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${activeTab === 'digital' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                        >
                            <BookOpen size={18} />
                            Digital Products
                            <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'digital' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                {digitalProducts.length}
                            </span>
                        </button>
                    </div>
                )}

                {/* Search Bar - Shared */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder={storeType === 'real_estate' ? "Search properties by location or title..." : "Search products..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-gray-900 placeholder-gray-400"
                        />
                    </div>
                    {(storeType === 'ecommerce' || storeType === 'digital_product') && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setSelectedCategoryFilter(null)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${!selectedCategoryFilter ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                            >
                                All
                            </button>
                            {categories.map((category) => (
                                <div key={category.id} className="relative group">
                                    <button
                                        onClick={() => setSelectedCategoryFilter(category.id)}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 pr-8 ${selectedCategoryFilter === category.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                                        {category.name}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id, category.name); }}
                                        className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${selectedCategoryFilter === category.id ? 'hover:bg-white/20 text-white/70 hover:text-white' : 'hover:bg-red-100 text-gray-400 hover:text-red-500'}`}
                                        title={`Delete ${category.name}`}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* CONTENT AREA */}
                {(storeType === 'ecommerce' || storeType === 'digital_product') ? (
                    // E-COMMERCE VIEW (Products or Digital Products based on tab)
                    activeTab === 'products' ? (
                        // PRODUCTS GRID
                        filteredProducts.length === 0 ? (
                            <div className="text-center py-20 px-4 bg-white rounded-[32px] border border-dashed border-gray-200">
                                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
                                    <Package size={40} className="text-teal-500" />
                                </div>
                                <h3 className="text-gray-900 font-semibold text-xl mb-2">No products yet</h3>
                                <button onClick={() => setIsEditingProduct(true)} className="mt-4 px-6 py-2 bg-teal-500 text-white rounded-full">Add Product</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredProducts.map((product) => (
                                    <div key={product.id} className={`group bg-white rounded-3xl overflow-hidden border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 ${!product.is_active ? 'opacity-60' : ''}`}>
                                        <Link href={`/product/${product.id}`}>
                                            <div className="relative aspect-square bg-gray-100 overflow-hidden">
                                                {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full flex items-center justify-center"><Package className="text-gray-300" /></div>}
                                                {product.category && <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium text-white backdrop-blur-sm" style={{ backgroundColor: `${product.category.color}CC` }}>{product.category.name}</div>}
                                                {!product.is_active && <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium bg-gray-900/80 text-white backdrop-blur-sm">Inactive</div>}
                                            </div>
                                        </Link>
                                        <div className="p-5">
                                            <h3 className="font-semibold text-gray-900 text-lg mb-1 truncate">{product.name}</h3>
                                            <p className="text-gray-500 text-sm line-clamp-2 mb-3">{product.description}</p>
                                            <div className="text-xl font-bold text-teal-600">{formatPrice(product.price)}</div>
                                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                                                <button onClick={() => handleToggleProductActive(product)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">{product.is_active ? <ToggleRight className="text-teal-500" /> : <ToggleLeft />} {product.is_active ? 'Active' : 'Inactive'}</button>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleEditProduct(product)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"><Edit2 size={18} /></button>
                                                    <button onClick={() => handleDeleteProduct(product.id, product.name)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        // DIGITAL PRODUCTS GRID
                        filteredDigitalProducts.length === 0 ? (
                            <div className="text-center py-20 px-4 bg-white rounded-[32px] border border-dashed border-gray-200">
                                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
                                    <BookOpen size={40} className="text-emerald-500" />
                                </div>
                                <h3 className="text-gray-900 font-semibold text-xl mb-2">No digital products yet</h3>
                                <p className="text-gray-500 mb-4">Sell courses, ebooks, and digital content</p>
                                <button onClick={() => setIsEditingDigitalProduct(true)} className="mt-4 px-6 py-2 bg-emerald-500 text-white rounded-full">Add Digital Product</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredDigitalProducts.map((product) => (
                                    <div key={product.id} className={`group bg-white rounded-3xl overflow-hidden border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 ${!product.is_active ? 'opacity-60' : ''}`}>
                                        {/* Media Preview */}
                                        <div className="relative aspect-video bg-gradient-to-br from-teal-100 to-emerald-100 overflow-hidden">
                                            {product.media && product.media.length > 0 ? (
                                                <>
                                                    {product.media[0].thumbnail_url ? (
                                                        <img
                                                            src={product.media[0].thumbnail_url}
                                                            alt={product.title}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                    ) : product.media[0].media_type === 'video_link' ? (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800">
                                                            <Film size={40} className="text-white/40" />
                                                        </div>
                                                    ) : (
                                                        <img
                                                            src={product.media[0].media_url}
                                                            alt={product.title}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                    )}
                                                    {(product.media[0].media_type === 'video' || product.media[0].media_type === 'video_link') && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                            <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                                                                <Film size={24} className="text-emerald-600 ml-0.5" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {product.media.length > 1 && (
                                                        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 rounded-full text-xs text-white">
                                                            +{product.media.length - 1} more
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <BookOpen size={40} className="text-emerald-300" />
                                                </div>
                                            )}
                                            {product.category && (
                                                <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium text-white backdrop-blur-sm" style={{ backgroundColor: `${product.category.color}CC` }}>
                                                    {product.category.name}
                                                </div>
                                            )}
                                            {!product.is_active && (
                                                <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium bg-gray-900/80 text-white backdrop-blur-sm">Inactive</div>
                                            )}
                                        </div>
                                        {/* Content */}
                                        <div className="p-5">
                                            <h3 className="font-semibold text-gray-900 text-lg mb-1 truncate">{product.title}</h3>
                                            <p className="text-gray-500 text-sm line-clamp-2 mb-3">{product.short_description || product.description}</p>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-xl font-bold text-emerald-600">
                                                    {product.price ? formatPrice(product.price) : 'Free'}
                                                </div>
                                                {product.checkout_form && (
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        Form: {product.checkout_form.title}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleToggleDigitalProductActive(product)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                                                        {product.is_active ? <ToggleRight className="text-emerald-500" /> : <ToggleLeft />}
                                                        {product.is_active ? 'Active' : 'Inactive'}
                                                    </button>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Link
                                                        href={`/digital/${product.id}`}
                                                        target="_blank"
                                                        className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                                        title="View public page"
                                                    >
                                                        <ExternalLink size={18} />
                                                    </Link>
                                                    <button onClick={() => handleEditDigitalProduct(product)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Edit2 size={18} /></button>
                                                    <button onClick={() => handleDeleteDigitalProduct(product.id, product.title)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )
                ) : (
                    // REAL ESTATE GRID
                    filteredProperties.length === 0 ? (
                        <div className="text-center py-20 px-4 bg-white rounded-[32px] border border-dashed border-gray-200">
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
                                <Building size={40} className="text-emerald-500" />
                            </div>
                            <h3 className="text-gray-900 font-semibold text-xl mb-2">No properties listed</h3>
                            <button onClick={() => setIsEditingProperty(true)} className="mt-4 px-6 py-2 bg-emerald-500 text-white rounded-full">List Property</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {filteredProperties.map((property) => (
                                <div key={property.id} className={`group bg-white rounded-3xl overflow-hidden border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 ${!property.is_active ? 'opacity-60' : ''}`}>
                                    <Link href={`/property/${property.id}`}>
                                        <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden cursor-pointer">
                                            {property.image_url ?
                                                <img src={property.image_url} alt={property.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                : <div className="w-full h-full flex items-center justify-center"><Building className="text-gray-300" size={48} /></div>
                                            }
                                            <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold text-white bg-black/50 backdrop-blur-md uppercase tracking-wide">
                                                {property.status.replace('_', ' ')}
                                            </div>
                                            {!property.is_active && <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium bg-red-500 text-white backdrop-blur-sm">Inactive</div>}
                                        </div>
                                    </Link>

                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-2">
                                            <Link href={`/property/${property.id}`} className="flex-1 mr-4">
                                                <h3 className="font-bold text-gray-900 text-xl line-clamp-1 hover:text-emerald-600 transition-colors">{property.title}</h3>
                                            </Link>
                                            <p className="font-bold text-emerald-600 text-lg whitespace-nowrap">{formatPrice(property.price)}</p>
                                        </div>

                                        <div className="flex items-center text-gray-500 mb-4 text-sm">
                                            <MapPin size={16} className="mr-1 flex-shrink-0" />
                                            <span className="truncate">{property.address || 'No address provided'}</span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 py-4 border-t border-gray-100 mb-4">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="flex items-center gap-1 text-gray-400 mb-1">
                                                    <BedDouble size={18} />
                                                    <span className="text-xs font-medium">Beds</span>
                                                </div>
                                                <span className="font-semibold text-gray-900">{property.bedrooms || '-'}</span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center text-center border-l border-gray-100">
                                                <div className="flex items-center gap-1 text-gray-400 mb-1">
                                                    <Bath size={18} />
                                                    <span className="text-xs font-medium">Baths</span>
                                                </div>
                                                <span className="font-semibold text-gray-900">{property.bathrooms || '-'}</span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center text-center border-l border-gray-100">
                                                <div className="flex items-center gap-1 text-gray-400 mb-1">
                                                    <Maximize size={18} />
                                                    <span className="text-xs font-medium">Sqft</span>
                                                </div>
                                                <span className="font-semibold text-gray-900">{property.sqft || '-'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2">
                                            <button onClick={() => handleTogglePropertyActive(property)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                                                {property.is_active ? <ToggleRight className="text-emerald-500" /> : <ToggleLeft />}
                                                {property.is_active ? 'Listed' : 'Unlisted'}
                                            </button>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEditProperty(property)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"><Edit2 size={18} /></button>
                                                <button onClick={() => handleDeleteProperty(property.id, property.title)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* Modals */}
            <Suspense fallback={<div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"><Loader2 className="animate-spin text-white" size={32} /></div>}>
                {(storeType === 'ecommerce' || storeType === 'digital_product') && (
                    <>
                        <ProductFormModal
                            isOpen={isEditingProduct}
                            editingProduct={editingProduct}
                            formName={formName}
                            setFormName={setFormName}
                            formDescription={formDescription}
                            setFormDescription={setFormDescription}
                            formPrice={formPrice}
                            setFormPrice={setFormPrice}
                            formImageUrl={formImageUrl}
                            setFormImageUrl={setFormImageUrl}
                            formCategoryId={formCategoryId}
                            setFormCategoryId={setFormCategoryId}
                            categories={categories}
                            uploading={uploading}
                            saving={saving}
                            onSave={handleSaveProduct}
                            onClose={resetProductForm}
                            onImageUpload={handleImageUpload}
                            onOpenCategoryForm={() => setShowCategoryForm(true)}
                        />
                        <CategoryFormModal
                            isOpen={showCategoryForm}
                            categoryName={newCategoryName}
                            setCategoryName={setNewCategoryName}
                            categoryColor={newCategoryColor}
                            setCategoryColor={setNewCategoryColor}
                            onSave={handleAddCategory}
                            onClose={() => setShowCategoryForm(false)}
                        />
                        <DigitalProductFormModal
                            isOpen={isEditingDigitalProduct}
                            editingProduct={editingDigitalProduct}
                            categories={categories}
                            onSave={handleSaveDigitalProduct}
                            onClose={() => {
                                setIsEditingDigitalProduct(false);
                                setEditingDigitalProduct(null);
                            }}
                        />
                    </>
                )}

                {storeType === 'real_estate' && (
                    <PropertyFormModal
                        isOpen={isEditingProperty}
                        editingProperty={editingProperty}
                        formData={propertyFormData}
                        setFormData={setPropertyFormData}
                        uploading={uploading}
                        saving={saving}
                        onSave={handleSaveProperty}
                        onClose={resetPropertyForm}
                        onImageUpload={handleImageUpload}
                    />
                )}

                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                />
            </Suspense>
        </div>
    );
}
