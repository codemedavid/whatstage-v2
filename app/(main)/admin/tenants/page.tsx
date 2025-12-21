'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Globe, CheckCircle, XCircle, Loader2, Building2, Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface TenantRoute {
    id: string;
    page_id: string;
    tenant_name: string;
    destination_url: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export default function TenantsPage() {
    const [tenants, setTenants] = useState<TenantRoute[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        page_id: '',
        tenant_name: '',
        destination_url: '',
    });

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/central-router/register');
            const data = await res.json();
            setTenants(data.tenants || []);
        } catch (error) {
            console.error('Failed to fetch tenants:', error);
            showMessage('error', 'Failed to load tenants');
        } finally {
            setLoading(false);
        }
    };

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const res = await fetch('/api/central-router/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (data.success) {
                showMessage('success', `"${formData.tenant_name}" registered successfully!`);
                setFormData({ page_id: '', tenant_name: '', destination_url: '' });
                setShowForm(false);
                fetchTenants();
            } else {
                showMessage('error', data.error || 'Registration failed');
            }
        } catch (error) {
            showMessage('error', 'Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeactivate = async (identifier: string, name: string) => {
        if (!confirm(`Deactivate routing for "${name}"? Messages to this page will no longer be forwarded.`)) {
            return;
        }

        try {
            // Use page_id if it looks like a Facebook ID (long number), otherwise use id
            const isPageId = /^\d{10,}$/.test(identifier);
            const param = isPageId ? `page_id=${identifier}` : `id=${identifier}`;
            const res = await fetch(`/api/central-router/register?${param}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (data.success) {
                showMessage('success', `"${name}" deactivated`);
                fetchTenants();
            } else {
                showMessage('error', data.error || 'Failed to deactivate');
            }
        } catch (error) {
            showMessage('error', 'Network error');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showMessage('success', 'Copied to clipboard!');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="max-w-6xl mx-auto p-8 lg:p-12 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link
                            href="/"
                            className="p-3 hover:bg-white rounded-full text-gray-400 hover:text-gray-900 transition-all hover:shadow-md"
                        >
                            <ArrowLeft size={24} />
                        </Link>
                        <div>
                            <h1 className="text-4xl font-light text-gray-900 tracking-tight">Customer Routes</h1>
                            <p className="text-gray-500 mt-1 text-lg font-light">Central Webhook Router Management</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-full hover:bg-teal-700 hover:shadow-lg transition-all font-medium text-sm active:scale-95"
                    >
                        <Plus size={20} />
                        Add Customer
                    </button>
                </div>

                {/* Message */}
                {message && (
                    <div className={`p-4 rounded-2xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${message.type === 'success'
                        ? 'bg-green-50 text-green-800 border border-green-100'
                        : 'bg-red-50 text-red-800 border border-red-100'
                        }`}>
                        {message.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                        {message.text}
                    </div>
                )}

                {/* Add Customer Form */}
                {showForm && (
                    <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100 animate-in fade-in slide-in-from-top-4">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Register New Customer</h2>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Customer Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.tenant_name}
                                        onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                                        placeholder="e.g., ABC Shoe Store"
                                        required
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Facebook Page ID <span className="text-gray-400 font-normal">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.page_id}
                                        onChange={(e) => setFormData({ ...formData, page_id: e.target.value })}
                                        placeholder="Customer will link their own page"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-gray-900 font-mono text-sm"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Leave empty if customer will connect their own page</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Webhook Destination URL
                                    </label>
                                    <input
                                        type="url"
                                        value={formData.destination_url}
                                        onChange={(e) => setFormData({ ...formData, destination_url: e.target.value })}
                                        placeholder="https://customer-abc.vercel.app/api/webhook"
                                        required
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-gray-900 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-6 py-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white rounded-full hover:bg-teal-700 transition-all font-medium disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="animate-spin" size={18} />
                                            Registering...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={18} />
                                            Register Customer
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Tenants Table */}
                <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Loader2 className="animate-spin mb-3" size={32} />
                            <span className="font-light">Loading customers...</span>
                        </div>
                    ) : tenants.length === 0 ? (
                        <div className="text-center py-20 px-8">
                            <div className="bg-gray-50 p-5 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                                <Building2 size={32} className="text-gray-300" />
                            </div>
                            <h3 className="text-xl font-medium text-gray-900 mb-2">No customers registered</h3>
                            <p className="text-gray-500 max-w-md mx-auto font-light">
                                Add your first customer to start routing webhooks automatically.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50/80 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Customer</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Page ID</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Destination</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                                        <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {tenants.map((tenant) => (
                                        <tr key={tenant.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                                                        {tenant.tenant_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-medium text-gray-900">{tenant.tenant_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                {tenant.page_id ? (
                                                    <div className="flex items-center gap-2">
                                                        <code className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-mono">
                                                            {tenant.page_id}
                                                        </code>
                                                        <button
                                                            onClick={() => copyToClipboard(tenant.page_id)}
                                                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-md">
                                                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                                                        Pending Connection
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <Globe size={16} className="text-gray-400" />
                                                    <span className="text-sm text-gray-600 truncate max-w-xs">{tenant.destination_url}</span>
                                                    <a
                                                        href={tenant.destination_url.replace('/api/webhook', '')}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1 text-gray-400 hover:text-teal-600 transition-colors"
                                                    >
                                                        <ExternalLink size={14} />
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                {tenant.is_active ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                                        Inactive
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button
                                                    onClick={() => handleDeactivate(tenant.page_id || tenant.id, tenant.tenant_name)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Deactivate"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Info Footer */}
                <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
                    <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
                    <p className="text-blue-700 text-sm leading-relaxed">
                        When a message arrives at your Master Facebook App webhook, the router looks up the Page ID in this table
                        and forwards the event to the customer's destination URL. Each customer receives only their own messages.
                    </p>
                </div>
            </div>
        </div>
    );
}
