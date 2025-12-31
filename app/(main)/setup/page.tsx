
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Building, ArrowRight, Loader2, Store, BookOpen } from 'lucide-react';

export default function SetupPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [storeName, setStoreName] = useState('');
    const [storeType, setStoreType] = useState<'ecommerce' | 'real_estate' | 'digital_product' | null>(null);
    const [loading, setLoading] = useState(false);

    const handleComplete = async () => {
        if (!storeName || !storeType) return;

        setLoading(true);
        try {
            const res = await fetch('/api/store-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeName,
                    storeType,
                    setupCompleted: true,
                }),
            });

            if (res.ok) {
                router.push('/store');
            } else {
                console.error('Failed to save settings');
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-2xl w-full">
                {/* Progress */}
                <div className="flex items-center justify-center mb-12 space-x-4">
                    <div className={`w-3 h-3 rounded-full transition-colors ${step >= 1 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <div className={`w-12 h-1 rounded-full transition-colors ${step >= 2 ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                    <div className={`w-3 h-3 rounded-full transition-colors ${step >= 2 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                </div>

                <div className="bg-white rounded-[32px] shadow-xl p-10 md:p-14">
                    {step === 1 ? (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="text-center mb-10">
                                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <Store size={32} />
                                </div>
                                <h1 className="text-3xl font-bold text-gray-900 mb-3">Welcome to your Store</h1>
                                <p className="text-gray-500 text-lg">Let's start by giving your business a name.</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">Store Name</label>
                                    <input
                                        type="text"
                                        value={storeName}
                                        onChange={(e) => setStoreName(e.target.value)}
                                        placeholder="e.g. New York Properties"
                                        className="w-full px-6 py-4 bg-gray-50 border-transparent text-black focus:border-emerald-500 focus:bg-white focus:ring-0 rounded-2xl text-lg transition-all placeholder:text-gray-400 font-medium"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && storeName && setStep(2)}
                                    />
                                </div>

                                <button
                                    onClick={() => setStep(2)}
                                    disabled={!storeName.trim()}
                                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                                >
                                    Next Step
                                    <ArrowRight size={20} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="text-center mb-10">
                                <h1 className="text-3xl font-bold text-gray-900 mb-3">What are you selling?</h1>
                                <p className="text-gray-500 text-lg">Choose the best fit for your business type.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                                {/* E-commerce Option */}
                                <button
                                    onClick={() => setStoreType('ecommerce')}
                                    className={`relative group p-6 rounded-3xl border-2 text-left transition-all duration-300 hover:shadow-lg ${storeType === 'ecommerce'
                                        ? 'border-emerald-500 bg-emerald-50/30'
                                        : 'border-gray-100 bg-white hover:border-emerald-200'
                                        }`}
                                >
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${storeType === 'ecommerce' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'
                                        }`}>
                                        <ShoppingBag size={28} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Products</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">
                                        For physical goods like clothing, electronics, or accessories. Manage inventory and variations.
                                    </p>

                                    {storeType === 'ecommerce' && (
                                        <div className="absolute top-4 right-4 text-emerald-500">
                                            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </div>
                                    )}
                                </button>

                                {/* Real Estate Option */}
                                <button
                                    onClick={() => setStoreType('real_estate')}
                                    className={`relative group p-6 rounded-3xl border-2 text-left transition-all duration-300 hover:shadow-lg ${storeType === 'real_estate'
                                        ? 'border-emerald-500 bg-emerald-50/30'
                                        : 'border-gray-100 bg-white hover:border-emerald-200'
                                        }`}
                                >
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${storeType === 'real_estate' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'
                                        }`}>
                                        <Building size={28} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Properties</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">
                                        For real estate listings. Manage properties, features, locations, and status (Sale/Rent).
                                    </p>

                                    {storeType === 'real_estate' && (
                                        <div className="absolute top-4 right-4 text-emerald-500">
                                            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </div>
                                    )}
                                </button>

                                {/* Digital Product Option */}
                                <button
                                    onClick={() => setStoreType('digital_product')}
                                    className={`relative group p-6 rounded-3xl border-2 text-left transition-all duration-300 hover:shadow-lg md:col-span-2 ${storeType === 'digital_product'
                                        ? 'border-violet-500 bg-violet-50/30'
                                        : 'border-gray-100 bg-white hover:border-violet-200'
                                        }`}
                                >
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${storeType === 'digital_product' ? 'bg-violet-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-violet-100 group-hover:text-violet-600'
                                        }`}>
                                        <BookOpen size={28} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Digital Products</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">
                                        For online courses, ebooks, digital downloads, and subscriptions. Sell digital content with instant access.
                                    </p>

                                    {storeType === 'digital_product' && (
                                        <div className="absolute top-4 right-4 text-violet-500">
                                            <div className="w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center">
                                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </div>
                                    )}
                                </button>
                            </div>

                            <button
                                onClick={handleComplete}
                                disabled={!storeType || loading}
                                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                            >
                                {loading && <Loader2 className="animate-spin" size={20} />}
                                Complete Setup
                            </button>

                            <button
                                onClick={() => setStep(1)}
                                disabled={loading}
                                className="w-full mt-4 py-3 text-gray-500 font-medium hover:text-gray-800 transition-colors"
                            >
                                Back
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
