
'use client';

import { useRef, useState } from 'react';
import {
    Loader2,
    Image as ImageIcon,
    Plus,
    Home,
    Banknote,
    Car,
    Ruler
} from 'lucide-react';

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

interface PropertyFormModalProps {
    isOpen: boolean;
    editingProperty: Property | null;
    formData: any;
    setFormData: (data: any) => void;
    uploading: boolean;
    saving: boolean;
    onSave: () => void;
    onClose: () => void;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PROPERTY_TYPES = [
    'House & Lot',
    'Condominium',
    'Townhouse',
    'Apartment',
    'Lot Only',
    'Commercial',
    'Warehouse',
    'Farm',
    'Beach House'
];

export default function PropertyFormModal({
    isOpen,
    editingProperty,
    formData,
    setFormData,
    uploading,
    saving,
    onSave,
    onClose,
    onImageUpload,
}: PropertyFormModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [customType, setCustomType] = useState(false);

    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[32px] w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            {editingProperty ? 'Edit Property' : 'List New Property'}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            {editingProperty ? 'Update property details' : 'Add a new property to your portfolio'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-full border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onSave}
                            disabled={!formData.title?.trim() || saving}
                            className="flex items-center gap-2 px-8 py-2.5 bg-[#4ADE80] text-emerald-950 rounded-full hover:bg-[#22c55e] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving && <Loader2 className="animate-spin" size={18} />}
                            {editingProperty ? 'Save Changes' : 'List Property'}
                        </button>
                    </div>
                </div>

                {/* Modal Body - Scrollable */}
                <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column: Details */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* General Information Card */}
                            <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                                        <Home size={20} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">Property Details</h3>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Property Title
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.title || ''}
                                            onChange={(e) => handleChange('title', e.target.value)}
                                            placeholder="e.g. Modern 3-Bedroom Villa in Makati"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Property Type
                                            </label>
                                            {customType ? (
                                                <input
                                                    type="text"
                                                    value={formData.propertyType || ''}
                                                    onChange={(e) => handleChange('propertyType', e.target.value)}
                                                    placeholder="Type custom value..."
                                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                                    autoFocus
                                                />
                                            ) : (
                                                <select
                                                    value={formData.propertyType || ''}
                                                    onChange={(e) => {
                                                        if (e.target.value === 'custom') {
                                                            setCustomType(true);
                                                            handleChange('propertyType', '');
                                                        } else {
                                                            handleChange('propertyType', e.target.value);
                                                        }
                                                    }}
                                                    className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium cursor-pointer"
                                                >
                                                    <option value="">Select Type</option>
                                                    {PROPERTY_TYPES.map(type => (
                                                        <option key={type} value={type}>{type}</option>
                                                    ))}
                                                    <option value="custom">+ Add Custom Type</option>
                                                </select>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Status
                                            </label>
                                            <select
                                                value={formData.status || 'for_sale'}
                                                onChange={(e) => handleChange('status', e.target.value)}
                                                className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium cursor-pointer"
                                            >
                                                <option value="for_sale">For Sale</option>
                                                <option value="for_rent">For Rent</option>
                                                <option value="sold">Sold</option>
                                                <option value="rented">Rented</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Address / Location
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.address || ''}
                                            onChange={(e) => handleChange('address', e.target.value)}
                                            placeholder="e.g. 123 Leviste St, Salcedo Village, Makati"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Description
                                        </label>
                                        <textarea
                                            value={formData.description || ''}
                                            onChange={(e) => handleChange('description', e.target.value)}
                                            placeholder="Describe the property features, amenities, etc..."
                                            rows={5}
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium resize-none"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Features Specs */}
                            <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                                        <Ruler size={20} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">Specifications</h3>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Bedrooms</label>
                                        <input
                                            type="number"
                                            value={formData.bedrooms || ''}
                                            onChange={(e) => handleChange('bedrooms', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Bathrooms</label>
                                        <input
                                            type="number"
                                            value={formData.bathrooms || ''}
                                            onChange={(e) => handleChange('bathrooms', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Garage</label>
                                        <input
                                            type="number"
                                            value={formData.garageSpaces || ''}
                                            onChange={(e) => handleChange('garageSpaces', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Floor Area (sqft)</label>
                                        <input
                                            type="number"
                                            value={formData.sqft || ''}
                                            onChange={(e) => handleChange('sqft', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Lot Area (sqm)</label>
                                        <input
                                            type="number"
                                            value={formData.lotArea || ''}
                                            onChange={(e) => handleChange('lotArea', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Year Built</label>
                                        <input
                                            type="number"
                                            value={formData.yearBuilt || ''}
                                            onChange={(e) => handleChange('yearBuilt', e.target.value)}
                                            placeholder="2024"
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Right Column: Financials & Images */}
                        <div className="space-y-8">
                            {/* Financials Card */}
                            <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-yellow-50 rounded-xl text-yellow-600">
                                        <Banknote size={20} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">Financials</h3>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Selling Price
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">₱</span>
                                            <input
                                                type="number"
                                                value={formData.price || ''}
                                                onChange={(e) => handleChange('price', e.target.value)}
                                                placeholder="0.00"
                                                className="w-full pl-10 pr-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-bold text-lg"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Down Payment
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">₱</span>
                                            <input
                                                type="number"
                                                value={formData.downPayment || ''}
                                                onChange={(e) => handleChange('downPayment', e.target.value)}
                                                placeholder="0.00"
                                                className="w-full pl-10 pr-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Monthly Amortization (Est.)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">₱</span>
                                            <input
                                                type="number"
                                                value={formData.monthlyAmortization || ''}
                                                onChange={(e) => handleChange('monthlyAmortization', e.target.value)}
                                                placeholder="0.00"
                                                className="w-full pl-10 pr-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Payment Terms
                                        </label>
                                        <textarea
                                            value={formData.paymentTerms || ''}
                                            onChange={(e) => handleChange('paymentTerms', e.target.value)}
                                            placeholder="e.g. 20% DP payable in 12 months, 80% Bank Financing"
                                            rows={3}
                                            className="w-full px-5 py-3.5 bg-gray-50 border-transparent focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-xl transition-all text-gray-900 placeholder:text-gray-400 font-medium resize-none text-sm"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Images Card */}
                            <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-xl font-bold text-gray-900 mb-6">Property Images</h3>

                                <div className="space-y-4">
                                    {/* Image Grid */}
                                    <div className="grid grid-cols-3 gap-3">
                                        {/* Existing Images */}
                                        {(formData.imageUrls || []).map((url: string, index: number) => (
                                            <div
                                                key={index}
                                                className={`relative aspect-square rounded-xl overflow-hidden group ${index === 0 ? 'ring-2 ring-emerald-500 ring-offset-2' : 'border border-gray-200'}`}
                                            >
                                                <img
                                                    src={url}
                                                    alt={`Property ${index + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                {index === 0 && (
                                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded">
                                                        PRIMARY
                                                    </div>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newUrls = [...(formData.imageUrls || [])];
                                                        newUrls.splice(index, 1);
                                                        setFormData((prev: any) => ({ ...prev, imageUrls: newUrls }));
                                                    }}
                                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}

                                        {/* Add Image Button */}
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center hover:bg-gray-50 hover:border-emerald-400 text-gray-400 hover:text-emerald-500 transition-all disabled:opacity-50"
                                        >
                                            {uploading ? (
                                                <Loader2 className="animate-spin" size={24} />
                                            ) : (
                                                <>
                                                    <Plus size={24} />
                                                    <span className="text-xs mt-1">Add</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={onImageUpload}
                                        className="hidden"
                                    />

                                    <p className="text-xs text-gray-500 text-center">
                                        First image will be used as the primary thumbnail
                                    </p>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
