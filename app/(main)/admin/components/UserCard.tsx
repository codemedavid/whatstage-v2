'use client';

import { Edit2, Trash2, Key, Calendar, Globe } from 'lucide-react';

interface UserCardProps {
    user: {
        id: string;
        email: string;
        created_at: string;
        bot_name: string;
        has_api_key: boolean;
        pages_count: number;
    };
    onEdit: () => void;
    onDelete: () => void;
}

export default function UserCard({ user, onEdit, onDelete }: UserCardProps) {
    const createdDate = new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div className="group flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6 bg-white border border-gray-100 rounded-[24px] hover:shadow-lg transition-all duration-300 hover:border-gray-200">
            {/* User Avatar */}
            <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-semibold text-lg shadow-sm">
                    {user.email.charAt(0).toUpperCase()}
                </div>
                {user.has_api_key && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-4 border-white rounded-full flex items-center justify-center">
                        <Key size={10} className="text-white" />
                    </div>
                )}
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900 text-lg truncate">
                        {user.email}
                    </h3>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-700">{user.bot_name}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Calendar size={14} />
                        {createdDate}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Globe size={14} />
                        {user.pages_count} {user.pages_count === 1 ? 'page' : 'pages'}
                    </span>
                    {user.has_api_key ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-50 text-green-700 rounded-md text-xs font-medium">
                            <Key size={12} />
                            Has API Key
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                            Using Shared Pool
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <button
                    onClick={onEdit}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all text-sm font-medium"
                >
                    <Edit2 size={16} />
                    <span className="sm:hidden">Edit</span>
                </button>
                <button
                    onClick={onDelete}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all text-sm font-medium"
                >
                    <Trash2 size={16} />
                    <span className="sm:hidden">Delete</span>
                </button>
            </div>
        </div>
    );
}
