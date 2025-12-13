'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Loader2, Facebook } from 'lucide-react';

interface FacebookPageData {
    id: string;
    name: string;
    access_token: string;
    picture: string | null;
}

interface ConnectPageStepProps {
    onNext: (data: Record<string, string | undefined>) => void;
    isLoading: boolean;
    initialData?: Record<string, string | undefined>;
}

export default function ConnectPageStep({ onNext, isLoading }: ConnectPageStepProps) {
    const [availablePages, setAvailablePages] = useState<FacebookPageData[]>([]);
    const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
    const [connecting, setConnecting] = useState(false);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchingPages, setFetchingPages] = useState(false);

    // Check URL params on mount for OAuth callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const success = params.get('success');
        const fbSession = params.get('fb_session');
        const errorMsg = params.get('error');

        if (errorMsg) {
            setError(decodeURIComponent(errorMsg));
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } else if (success && fbSession) {
            // Fetch pages from session
            setFetchingPages(true);
            fetch(`/api/auth/facebook/temp-pages?session_id=${fbSession}`)
                .then(res => res.json())
                .then(data => {
                    if (data.pages && data.pages.length > 0) {
                        setAvailablePages(data.pages);
                        // Auto-select all pages
                        setSelectedPages(new Set(data.pages.map((p: FacebookPageData) => p.id)));
                    } else {
                        setError('No Facebook pages found. Make sure you have admin access to at least one page.');
                    }
                })
                .catch(() => {
                    setError('Failed to fetch pages from session');
                })
                .finally(() => {
                    setFetchingPages(false);
                    // Clean URL
                    window.history.replaceState({}, '', window.location.pathname);
                });
        }
    }, []);

    const handleFacebookLogin = () => {
        // Redirect to Facebook OAuth with returnTo pointing back here
        // We use the current path as returnTo so callback redirects back to wizard
        window.location.href = `/api/auth/facebook/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    };

    const togglePage = (pageId: string) => {
        const newSelected = new Set(selectedPages);
        if (newSelected.has(pageId)) {
            newSelected.delete(pageId);
        } else {
            newSelected.add(pageId);
        }
        setSelectedPages(newSelected);
    };

    const handleConnectPages = async () => {
        if (selectedPages.size === 0) {
            setError('Please select at least one page');
            return;
        }

        setConnecting(true);
        setError(null);

        const pagesToConnect = availablePages.filter(p => selectedPages.has(p.id));
        let allSuccess = true;

        for (const page of pagesToConnect) {
            try {
                const res = await fetch('/api/facebook/pages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageId: page.id,
                        pageName: page.name,
                        pageAccessToken: page.access_token,
                        profilePic: page.picture,
                    }),
                });

                const data = await res.json();
                if (!data.success) {
                    allSuccess = false;
                    setError(`Failed to connect ${page.name}: ${data.error || 'Unknown error'}`);
                }
            } catch {
                allSuccess = false;
                setError(`Error connecting ${page.name}`);
            }
        }

        setConnecting(false);

        if (allSuccess) {
            setConnected(true);
            // Auto-proceed after successful connection
            setTimeout(() => {
                onNext({});
            }, 1500);
        }
    };

    const handleFinish = () => {
        onNext({});
    };

    // Show page selector if we have pages
    if (availablePages.length > 0 && !connected) {
        return (
            <div className="flex flex-col h-full justify-between text-center">
                <div className="space-y-6 flex flex-col items-center">
                    <div>
                        <h3 className="text-2xl font-extrabold text-[#112D29]">Select Pages to Connect</h3>
                        <p className="text-gray-500 mt-2 max-w-xs mx-auto">
                            Choose which Facebook pages to enable AI responses on.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm w-full">
                            {error}
                        </div>
                    )}

                    <div className="w-full space-y-3 max-h-64 overflow-y-auto">
                        {availablePages.map((page) => (
                            <button
                                key={page.id}
                                type="button"
                                onClick={() => togglePage(page.id)}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${selectedPages.has(page.id)
                                        ? 'border-emerald-500 bg-emerald-50'
                                        : 'border-gray-100 bg-white hover:border-gray-200'
                                    }`}
                            >
                                {page.picture ? (
                                    <img
                                        src={page.picture}
                                        alt={page.name}
                                        className="w-12 h-12 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                        <Facebook className="text-blue-600" size={24} />
                                    </div>
                                )}
                                <div className="flex-1 text-left">
                                    <p className="font-semibold text-gray-900">{page.name}</p>
                                    <p className="text-sm text-gray-500">ID: {page.id}</p>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedPages.has(page.id)
                                        ? 'bg-emerald-500 border-emerald-500'
                                        : 'border-gray-300'
                                    }`}>
                                    {selectedPages.has(page.id) && (
                                        <CheckCircle className="text-white" size={16} />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-6 space-y-3">
                    <button
                        onClick={handleConnectPages}
                        disabled={connecting || selectedPages.size === 0}
                        className="w-full py-4 bg-[#112D29] text-white rounded-xl font-bold hover:bg-emerald-900 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {connecting ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Connecting...
                            </>
                        ) : (
                            `Connect ${selectedPages.size} Page${selectedPages.size !== 1 ? 's' : ''}`
                        )}
                    </button>
                    <button
                        onClick={handleFinish}
                        disabled={connecting}
                        className="w-full py-3 text-gray-500 hover:text-gray-700 transition-colors text-sm"
                    >
                        Skip for now
                    </button>
                </div>
            </div>
        );
    }

    // Show success state
    if (connected) {
        return (
            <div className="flex flex-col h-full justify-center items-center text-center">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={40} />
                </div>
                <h3 className="text-2xl font-extrabold text-[#112D29]">Pages Connected!</h3>
                <p className="text-gray-500 mt-2">
                    Your AI assistant is now ready to respond to customers.
                </p>
            </div>
        );
    }

    // Loading pages from session
    if (fetchingPages) {
        return (
            <div className="flex flex-col h-full justify-center items-center text-center">
                <Loader2 className="animate-spin text-emerald-600 mb-4" size={40} />
                <p className="text-gray-500">Loading your Facebook pages...</p>
            </div>
        );
    }

    // Default state - show connect button
    return (
        <div className="flex flex-col h-full justify-between text-center">
            <div className="space-y-8 flex flex-col items-center justify-center flex-1">

                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <div>
                    <h3 className="text-2xl font-extrabold text-[#112D29]">All Set!</h3>
                    <p className="text-gray-500 mt-2 max-w-xs mx-auto">
                        Your AI assistant is configured and ready to take over.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm w-full max-w-sm">
                        {error}
                    </div>
                )}

                <div className="w-full max-w-sm">
                    <button
                        className="w-full py-3 bg-[#1877F2] text-white rounded-xl font-bold hover:bg-[#166fe5] shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 mb-3 group"
                        onClick={handleFacebookLogin}
                    >
                        <span className="bg-white/20 p-1 rounded group-hover:bg-white/30 transition-colors">
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                        </span>
                        Connect Facebook Page
                    </button>
                    <p className="text-xs text-gray-400">
                        Required to reply to your customers.
                    </p>
                </div>
            </div>

            <div className="pt-6">
                <button
                    onClick={handleFinish}
                    disabled={isLoading}
                    className="w-full py-4 border-2 border-gray-100 text-gray-600 bg-white hover:border-gray-300 hover:text-gray-800 rounded-xl font-bold transition-all duration-200"
                >
                    {isLoading ? 'Finishing...' : 'Skip for now'}
                </button>
            </div>
        </div>
    );
}
