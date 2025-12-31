'use client';

import {
    X,
    Package,
    User,
    Phone,
    Mail,
    Calendar,
    Clock,
    CreditCard,
    ExternalLink,
    CheckCircle,
    FileText,
    Image as ImageIcon
} from 'lucide-react';

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
    isOpen: boolean;
    order: DigitalOrder | null;
    onClose: () => void;
    onUpdateStatus: (orderId: string, status: string) => Promise<void>;
}

export default function DigitalOrderDetailsModal({ isOpen, order, onClose, onUpdateStatus }: Props) {
    if (!isOpen || !order) return null;

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (amount: number | null, currency: string = 'PHP') => {
        if (amount === null) return 'Free';
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            active: 'bg-green-500',
            pending: 'bg-yellow-500',
            expired: 'bg-gray-500',
            cancelled: 'bg-red-500',
        };
        return colors[status] || 'bg-gray-500';
    };

    const handleStatusChange = async (newStatus: string) => {
        await onUpdateStatus(order.id, newStatus);
    };

    const isFromMessenger = !!order.facebook_psid;

    // Helper to check if a string is likely an image URL
    const isImageUrl = (value: any): boolean => {
        if (typeof value !== 'string') return false;
        const urlLower = value.toLowerCase();
        return urlLower.includes('cloudinary.com') ||
            urlLower.includes('/upload/') ||
            urlLower.match(/\.(jpg|jpeg|png|gif|webp)($|\?)/i) !== null;
    };

    // Get sorted form fields for display
    const getFormFields = () => {
        const submission = order.form_submission;
        if (!submission?.submitted_data) return [];

        const fields = submission.form?.fields || [];
        const submittedData = submission.submitted_data;

        // Create display items from either field definitions or raw data
        const displayItems: Array<{ label: string; value: any; fieldType: string }> = [];

        if (fields.length > 0) {
            // Sort fields by display_order and map to display items
            [...fields]
                .sort((a, b) => a.display_order - b.display_order)
                .forEach(field => {
                    const value = submittedData[field.id];
                    if (value !== undefined && value !== null && value !== '') {
                        displayItems.push({
                            label: field.label,
                            value,
                            fieldType: field.field_type
                        });
                    }
                    // Also check for _receipt suffix (payment section uploads)
                    const receiptValue = submittedData[`${field.id}_receipt`];
                    if (receiptValue) {
                        displayItems.push({
                            label: `${field.label} - Receipt`,
                            value: receiptValue,
                            fieldType: 'file'
                        });
                    }
                });
        } else {
            // Fallback: display raw keys/values
            Object.entries(submittedData)
                .filter(([key]) => !key.startsWith('_')) // Skip internal fields
                .forEach(([key, value]) => {
                    displayItems.push({
                        label: key,
                        value,
                        fieldType: isImageUrl(value) ? 'file' : 'text'
                    });
                });
        }

        return displayItems;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Purchase Details</h2>
                        <p className="text-sm text-gray-500 font-mono">#{order.id.slice(0, 8)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Product Info */}
                    <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl p-4 border border-teal-100">
                        <div className="flex items-start gap-4">
                            {order.digital_product?.thumbnail_url ? (
                                <img
                                    src={order.digital_product.thumbnail_url}
                                    alt=""
                                    className="w-20 h-20 rounded-lg object-cover shadow-sm"
                                />
                            ) : (
                                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-sm">
                                    <Package size={32} className="text-white" />
                                </div>
                            )}
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {order.digital_product?.title || 'Unknown Product'}
                                </h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    {order.digital_product?.payment_type === 'recurring' ? 'Subscription' : 'One-time purchase'}
                                </p>
                                <div className="flex items-center gap-4 mt-3">
                                    <span className="text-2xl font-bold text-teal-600">
                                        {formatCurrency(order.amount_paid, order.digital_product?.currency)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Customer Info */}
                    <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Customer</h4>
                        <div className="flex items-center gap-4">
                            {order.lead?.profile_pic ? (
                                <img
                                    src={order.lead.profile_pic}
                                    alt=""
                                    className="w-12 h-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                                    <User size={20} className="text-gray-500" />
                                </div>
                            )}
                            <div className="flex-1">
                                <div className="font-medium text-gray-900">{order.lead?.name || 'Unknown'}</div>
                                <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-600">
                                    {order.lead?.email && (
                                        <div className="flex items-center gap-1.5">
                                            <Mail size={14} className="text-gray-400" />
                                            <span>{order.lead.email}</span>
                                        </div>
                                    )}
                                    {order.lead?.phone && (
                                        <div className="flex items-center gap-1.5">
                                            <Phone size={14} className="text-gray-400" />
                                            <span>{order.lead.phone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {isFromMessenger && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.906 1.445 5.508 3.706 7.209V22l3.088-1.697c.826.228 1.7.354 2.606.354 5.523 0 10-4.145 10-9.243C22 6.145 17.523 2 12 2z" />
                                    </svg>
                                    From Messenger
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Purchase Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <Calendar size={14} />
                                <span>Purchase Date</span>
                            </div>
                            <div className="font-medium text-gray-900">
                                {formatDate(order.created_at)}
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <Clock size={14} />
                                <span>Access Expires</span>
                            </div>
                            <div className="font-medium text-gray-900">
                                {order.access_expires_at
                                    ? formatDate(order.access_expires_at)
                                    : 'Lifetime Access'}
                            </div>
                        </div>
                    </div>

                    {/* Form Submission Data */}
                    {order.form_submission && getFormFields().length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4">
                            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <FileText size={14} />
                                Form Submission Details
                            </h4>
                            <div className="space-y-4">
                                {getFormFields().map((item, index) => (
                                    <div key={index} className="border-b border-gray-200 last:border-0 pb-3 last:pb-0">
                                        <div className="text-xs font-medium text-gray-500 mb-1">
                                            {item.label}
                                        </div>
                                        {item.fieldType === 'file' || isImageUrl(item.value) ? (
                                            <div className="mt-1">
                                                <a
                                                    href={item.value}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-block"
                                                >
                                                    <img
                                                        src={item.value}
                                                        alt={item.label}
                                                        className="max-w-[200px] max-h-[150px] rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                                                    />
                                                </a>
                                                <a
                                                    href={item.value}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
                                                >
                                                    <ExternalLink size={12} />
                                                    View full size
                                                </a>
                                            </div>
                                        ) : item.fieldType === 'checkbox' ? (
                                            <div className="text-gray-900 font-medium">
                                                {item.value ? '✓ Yes' : '✗ No'}
                                            </div>
                                        ) : (
                                            <div className="text-gray-900 font-medium whitespace-pre-wrap">
                                                {String(item.value)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Status Management */}
                    <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Status</h4>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(order.status)}`}></div>
                            <span className="font-medium text-gray-900 capitalize">{order.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {['active', 'pending', 'expired', 'cancelled'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => handleStatusChange(status)}
                                    disabled={order.status === status}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${order.status === status
                                        ? 'bg-teal-100 text-teal-700 border-2 border-teal-500'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                                        }`}
                                >
                                    {order.status === status && <CheckCircle size={14} className="inline mr-1.5" />}
                                    <span className="capitalize">{status}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Facebook PSID (for reference) */}
                    {order.facebook_psid && (
                        <div className="text-xs text-gray-400 font-mono">
                            Facebook PSID: {order.facebook_psid}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-black transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
