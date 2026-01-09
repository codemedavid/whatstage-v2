'use client';

import { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Key, Mail, Lock, Bot } from 'lucide-react';

interface UserDetails {
    user: {
        id: string;
        email: string;
        created_at: string;
        last_sign_in_at: string | null;
    };
    settings: {
        bot_name: string;
        nvidia_api_key: string | null;
    } | null;
    pages: Array<{ page_id: string; page_name: string; is_active: boolean }>;
}

interface UserModalProps {
    mode: 'add' | 'edit';
    user?: UserDetails;
    onClose: () => void;
    onSave: (data: {
        email?: string;
        password?: string;
        bot_name?: string;
        nvidia_api_key?: string;
    }) => Promise<boolean>;
}

export default function UserModal({ mode, user, onClose, onSave }: UserModalProps) {
    const [email, setEmail] = useState(user?.user.email || '');
    const [password, setPassword] = useState('');
    const [botName, setBotName] = useState(user?.settings?.bot_name || '');
    const [apiKey, setApiKey] = useState(user?.settings?.nvidia_api_key || '');
    const [showPassword, setShowPassword] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (mode === 'add') {
            if (!email) {
                setError('Email is required');
                return;
            }
            if (!password || password.length < 6) {
                setError('Password must be at least 6 characters');
                return;
            }
        }

        setSaving(true);

        const data: {
            email?: string;
            password?: string;
            bot_name?: string;
            nvidia_api_key?: string;
        } = {};

        if (mode === 'add') {
            data.email = email;
            data.password = password;
        } else if (mode === 'edit') {
            // Only send changed values for edit
            if (email !== user?.user.email) data.email = email;
            if (password) data.password = password;
        }

        if (botName !== (user?.settings?.bot_name || '')) {
            data.bot_name = botName;
        }
        // Always send API key if changed (including clearing it)
        if (apiKey !== (user?.settings?.nvidia_api_key || '')) {
            data.nvidia_api_key = apiKey;
        }

        const success = await onSave(data);
        setSaving(false);

        if (!success) {
            setError('Failed to save. Please try again.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h2 className="text-2xl font-semibold text-gray-900">
                        {mode === 'add' ? 'Add New User' : 'Edit User'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">
                            {error}
                        </div>
                    )}

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Mail size={14} className="inline mr-1.5" />
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                            disabled={mode === 'edit'}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        {mode === 'edit' && (
                            <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
                        )}
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Lock size={14} className="inline mr-1.5" />
                            {mode === 'add' ? 'Password' : 'New Password (leave empty to keep current)'}
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={mode === 'add' ? 'Minimum 6 characters' : '••••••••'}
                                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Bot Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Bot size={14} className="inline mr-1.5" />
                            Bot Name
                        </label>
                        <input
                            type="text"
                            value={botName}
                            onChange={(e) => setBotName(e.target.value)}
                            placeholder="Assistant"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* NVIDIA API Key */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Key size={14} className="inline mr-1.5" />
                            NVIDIA API Key
                            <span className="text-gray-400 font-normal ml-1">(optional)</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showApiKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="nvapi-..."
                                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            User&apos;s dedicated API key. Falls back to shared pool if empty.
                        </p>
                    </div>

                    {/* User Info (edit mode only) */}
                    {mode === 'edit' && user && (
                        <div className="pt-4 border-t border-gray-100">
                            <p className="text-xs text-gray-400">
                                Created: {new Date(user.user.created_at).toLocaleDateString()}
                                {user.user.last_sign_in_at && (
                                    <> · Last sign in: {new Date(user.user.last_sign_in_at).toLocaleDateString()}</>
                                )}
                            </p>
                            {user.pages.length > 0 && (
                                <p className="text-xs text-gray-400 mt-1">
                                    Connected pages: {user.pages.map(p => p.page_name).join(', ')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-full hover:bg-black transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                mode === 'add' ? 'Create User' : 'Save Changes'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
