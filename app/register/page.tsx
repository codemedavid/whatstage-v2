'use client';

import Link from 'next/link';
import { Globe } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabaseClient';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [success, setSuccess] = useState(false);
    const [initError, setInitError] = useState('');
    const [initUserId, setInitUserId] = useState<string | null>(null);
    const [retrying, setRetrying] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Validate passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        // Validate password strength
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        try {
            // Sign up with Supabase
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (signUpError) {
                setError(signUpError.message);
                setLoading(false);
                return;
            }

            if (data.user) {
                // Initialize user data (pipeline stages, bot settings, etc.)
                try {
                    const initResponse = await fetch('/api/auth/initialize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: data.user.id }),
                    });

                    if (!initResponse.ok) {
                        console.error('Failed to initialize user data');
                        setInitError('Failed to set up your account. You can retry below.');
                        setInitUserId(data.user.id);
                    }
                } catch (initErr) {
                    console.error('Error initializing user:', initErr);
                    setInitError('Failed to set up your account. You can retry below.');
                    setInitUserId(data.user.id);
                }

                // Check if email confirmation is required
                if (data.session) {
                    // User is logged in immediately (email confirmation disabled)
                    router.push('/');
                    router.refresh();
                } else {
                    // Email confirmation required
                    setSuccess(true);
                }
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleRetryInit = async () => {
        if (!initUserId) return;
        setRetrying(true);
        try {
            const response = await fetch('/api/auth/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: initUserId }),
            });
            if (response.ok) {
                setInitError('');
                setInitUserId(null);
            } else {
                setInitError('Retry failed. Please try again or contact support.');
            }
        } catch (err) {
            setInitError('Retry failed. Please try again or contact support.');
        } finally {
            setRetrying(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#F0FDF4] font-sans flex flex-col items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 md:p-10 text-center">
                    <div className="w-16 h-16 bg-[#86EFAC] rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
                    <p className="text-gray-500 text-sm mb-6">
                        We&apos;ve sent a confirmation link to<br />
                        <span className="font-semibold text-gray-900">{email}</span>
                    </p>
                    <p className="text-gray-400 text-xs mb-6">
                        Click the link in your email to verify your account and get started.
                    </p>
                    <Link
                        href="/login"
                        className="inline-block w-full bg-[#86EFAC] hover:bg-[#4ADE80] text-gray-900 font-semibold py-3 rounded-lg shadow-sm transition-all text-sm"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F0FDF4] font-sans relative overflow-hidden flex flex-col relative">
            {/* Decorative Background Elements - Doodles */}
            <div className="absolute top-1/3 left-20 opacity-60">
                <svg width="100" height="50" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 25 C 30 10, 50 40, 70 25 S 90 10, 110 25" stroke="#333" strokeWidth="1" fill="none" />
                </svg>
            </div>
            <div className="absolute top-40 right-40 opacity-60 hidden md:block">
                <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
                    <path d="M10 30 C 40 10, 60 50, 90 30" stroke="#333" strokeWidth="1" />
                    <circle cx="110" cy="10" r="3" fill="none" stroke="#333" />
                </svg>
            </div>
            <div className="absolute bottom-20 left-40 opacity-80 hidden lg:block">
                <div className="w-16 h-24 border border-gray-800 flex items-center justify-center bg-white transform -rotate-12">
                    <div className="w-12 h-0.5 bg-gray-800"></div>
                </div>
            </div>
            <div className="absolute bottom-40 right-20 opacity-60 hidden md:block">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <path d="M10 70 Q 40 40 70 10" stroke="#333" strokeWidth="1" />
                    <path d="M70 10 L 60 15 M 70 10 L 65 20" stroke="#333" strokeWidth="1" />
                </svg>
            </div>

            {/* Pattern Boxes */}
            <div className="absolute bottom-0 left-[15%] w-24 h-32 bg-[#86EFAC] flex flex-wrap gap-4 p-2 content-start opacity-90 hidden lg:flex">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-black"></div>
                ))}
            </div>
            <div className="absolute bottom-20 right-[20%] w-20 h-24 bg-[#86EFAC] flex flex-wrap gap-4 p-2 content-start opacity-90 hidden lg:flex">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-black"></div>
                ))}
            </div>


            {/* Header */}
            <header className="px-6 py-6 md:px-12 flex justify-between items-center z-10">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tanaw AI</h1>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        Sales@TanawAI.com <span className="text-gray-400">→</span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <button className="p-2 text-gray-600 hover:text-gray-900">
                        <Globe className="w-5 h-5" />
                    </button>
                    <button className="px-6 py-2.5 bg-[#86EFAC] text-gray-900 text-sm font-medium rounded shadow-sm hover:bg-[#4ADE80] transition-colors">
                        Request Demo
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4 z-10 relative">

                {/* Illustration Placeholders */}
                <div className="absolute right-[15%] top-1/2 transform -translate-y-1/2 hidden xl:block w-64 h-64 pointer-events-none">
                    <div className="bg-white border border-gray-800 w-32 h-32 absolute bottom-0 right-10 z-0"></div>
                </div>


                <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 md:p-10 relative">
                    <div className="absolute -right-8 -top-8 w-18 h-12 opacity-50 hidden md:block">
                        <svg viewBox="0 0 50 50" className="w-full h-full overflow-visible">
                            <path d="M0 25 C 10 10, 30 10, 40 25" stroke="#333" fill="none" />
                        </svg>
                    </div>

                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Account</h2>
                        <p className="text-gray-500 text-sm">
                            Get started with Tanaw AI<br />
                            Create your account to begin
                        </p>
                    </div>

                    {initError && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-sm">
                            <p className="mb-2">{initError}</p>
                            <button
                                type="button"
                                onClick={handleRetryInit}
                                disabled={retrying}
                                className="px-3 py-1 bg-yellow-200 hover:bg-yellow-300 text-yellow-900 text-xs font-medium rounded transition-colors disabled:opacity-50"
                            >
                                {retrying ? 'Retrying...' : 'Retry Setup'}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <input
                                type="email"
                                placeholder="Enter Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#86EFAC]/50 focus:border-[#86EFAC] text-sm transition-all text-black"
                            />
                        </div>

                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#86EFAC]/50 focus:border-[#86EFAC] text-sm transition-all text-black"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800"
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>

                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#86EFAC]/50 focus:border-[#86EFAC] text-sm transition-all text-black"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#86EFAC] hover:bg-[#4ADE80] text-gray-900 font-semibold py-3 rounded-lg shadow-sm transition-all mt-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-xs text-gray-500">
                            Already have an account? <Link href="/login" className="font-bold text-gray-900 hover:underline">Sign In</Link>
                        </p>
                    </div>

                </div>
            </main>

            <footer className="py-6 text-center text-xs text-gray-500 z-10">
                <p>Copyright © Tanaw AI {new Date().getFullYear()} | Privacy Policy</p>
            </footer>
        </div>
    );
}
