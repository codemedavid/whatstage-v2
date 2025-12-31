'use client';

import { useState } from 'react';
import {
    Search,
    Filter,
    RefreshCw,
    Package,
    Eye,
    Download,
    User
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import DigitalOrderDetailsModal from './DigitalOrderDetailsModal';

interface DigitalOrder {
    id: string;
    digital_product_id: string;
    lead_id: string | null;
    facebook_psid: string | null;
    purchase_date: string;
    access_expires_at: string | null;
    status: 'active' | 'expired' | 'cancelled' | 'pending';
    amount_paid: number | null;
    payment_method: string | null;
    created_at: string;
    digital_product?: {
        id: string;
        title: string;
        price: number | null;
        currency: string;
        thumbnail_url: string | null;
        payment_type: string;
    };
    lead?: {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        sender_id: string | null;
        profile_pic: string | null;
    };
    form_submission?: {
        id: string;
        submitted_data: Record<string, any>;
        created_at: string;
        form?: {
            id: string;
            title: string;
            settings?: Record<string, any>;
            fields?: Array<{
                id: string;
                label: string;
                field_type: string;
                display_order: number;
            }>;
        };
    };
}

interface Props {
    initialOrders: DigitalOrder[];
}

export default function DigitalOrdersClient({ initialOrders }: Props) {
    const router = useRouter();
    const [orders, setOrders] = useState<DigitalOrder[]>(initialOrders);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Modal state
    const [selectedOrder, setSelectedOrder] = useState<DigitalOrder | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        router.refresh(); // Triggers server-side re-fetch
        // Give a brief delay to show the refresh animation
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const handleUpdateStatus = async (orderId: string, status: string) => {
        try {
            const res = await fetch('/api/digital-orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, status }),
            });

            if (res.ok) {
                const updatedOrder = await res.json();
                setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: updatedOrder.status } : o));

                if (selectedOrder && selectedOrder.id === orderId) {
                    setSelectedOrder(prev => prev ? { ...prev, status: updatedOrder.status } : null);
                }

                // Refresh to get updated data from server
                router.refresh();
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    const handleViewOrder = (order: DigitalOrder) => {
        setSelectedOrder(order);
        setIsModalOpen(true);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatCurrency = (amount: number | null, currency: string = 'PHP') => {
        if (amount === null) return 'Free';
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            active: 'bg-green-100 text-green-800 border-green-200',
            pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            expired: 'bg-gray-100 text-gray-800 border-gray-200',
            cancelled: 'bg-red-100 text-red-800 border-red-200',
        };

        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || 'bg-gray-100 text-gray-800 border-gray-200'} capitalize`}>
                {status}
            </span>
        );
    };

    // Filtering
    const filteredOrders = orders.filter(order => {
        const customerName = order.lead?.name || '';
        const customerEmail = order.lead?.email || '';
        const productTitle = order.digital_product?.title || '';

        const matchesSearch =
            order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
            productTitle.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Digital Orders</h1>
                        <p className="text-gray-500 mt-1">Track digital product purchases and subscriptions</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="p-2.5 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                            title="Refresh Orders"
                        >
                            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by Product, Customer, ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 text-black pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                        />
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-400" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl focus:ring-teal-500 focus:border-teal-500 block w-full sm:w-auto p-2.5 px-4 cursor-pointer outline-none"
                            >
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="pending">Pending</option>
                                <option value="expired">Expired</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-2xl font-bold text-gray-900">{orders.length}</div>
                        <div className="text-sm text-gray-500">Total Purchases</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-2xl font-bold text-green-600">{orders.filter(o => o.status === 'active').length}</div>
                        <div className="text-sm text-gray-500">Active</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-2xl font-bold text-yellow-600">{orders.filter(o => o.status === 'pending').length}</div>
                        <div className="text-sm text-gray-500">Pending</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-2xl font-bold text-gray-900">
                            {formatCurrency(orders.filter(o => o.status === 'active').reduce((sum, o) => sum + (o.amount_paid || 0), 0))}
                        </div>
                        <div className="text-sm text-gray-500">Active Revenue</div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    {filteredOrders.length === 0 ? (
                        <div className="text-center py-24">
                            <div className="bg-gray-50 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                                <Download size={32} className="text-gray-400" />
                            </div>
                            <h3 className="text-gray-900 font-medium text-lg">No digital orders found</h3>
                            <p className="text-gray-500 text-sm mt-1">Purchases will appear here when customers buy digital products</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                        <th className="px-6 py-4">Product</th>
                                        <th className="px-6 py-4">Customer</th>
                                        <th className="px-6 py-4">Source</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Amount</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredOrders.map((order) => {
                                        const customerName = order.lead?.name || 'Unknown';
                                        const customerEmail = order.lead?.email;
                                        const isFromMessenger = !!order.facebook_psid;

                                        return (
                                            <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {order.digital_product?.thumbnail_url ? (
                                                            <img
                                                                src={order.digital_product.thumbnail_url}
                                                                alt=""
                                                                className="w-10 h-10 rounded-lg object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                                                                <Package size={18} className="text-white" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="font-medium text-gray-900 text-sm">
                                                                {order.digital_product?.title || 'Unknown Product'}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {order.digital_product?.payment_type === 'recurring' ? 'Subscription' : 'One-time'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {order.lead?.profile_pic ? (
                                                            <img
                                                                src={order.lead.profile_pic}
                                                                alt=""
                                                                className="w-8 h-8 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                                <User size={14} className="text-gray-400" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="font-medium text-gray-900 text-sm">{customerName}</div>
                                                            {customerEmail && <div className="text-xs text-gray-500">{customerEmail}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {isFromMessenger ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.906 1.445 5.508 3.706 7.209V22l3.088-1.697c.826.228 1.7.354 2.606.354 5.523 0 10-4.145 10-9.243C22 6.145 17.523 2 12 2z" />
                                                            </svg>
                                                            Messenger
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                                                            Web Form
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                                                    {formatDate(order.created_at)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(order.status)}
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-900">
                                                    {formatCurrency(order.amount_paid, order.digital_product?.currency)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handleViewOrder(order)}
                                                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                                                        title="View Details"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <DigitalOrderDetailsModal
                isOpen={isModalOpen}
                order={selectedOrder}
                onClose={() => setIsModalOpen(false)}
                onUpdateStatus={handleUpdateStatus}
            />
        </div>
    );
}
