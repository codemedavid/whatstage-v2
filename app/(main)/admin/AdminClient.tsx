'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Users, Key, Loader2, Search, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import UserCard from './components/UserCard';
import UserModal from './components/UserModal';

interface User {
    id: string;
    email: string;
    created_at: string;
    bot_name: string;
    has_api_key: boolean;
    pages_count: number;
}

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

export default function AdminClient() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (data.users) {
                setUsers(data.users);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchUsers();
    };

    const handleEditUser = async (userId: string) => {
        setLoadingDetails(true);
        try {
            const res = await fetch(`/api/admin/users/${userId}`);

            // Check HTTP status before parsing JSON
            if (!res.ok) {
                console.error(`Failed to fetch user details: HTTP ${res.status} ${res.statusText}`);
                return;
            }

            const data = await res.json();

            // Validate response shape - ensure user property exists with required fields
            if (
                data &&
                typeof data.user === 'object' &&
                data.user !== null &&
                typeof data.user.id === 'string' &&
                typeof data.user.email === 'string'
            ) {
                setEditingUser(data);
            } else {
                console.error('Invalid user data structure received:', data);
            }
        } catch (error) {
            console.error('Failed to fetch user details:', error);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleDeleteUser = async (userId: string, email: string) => {
        if (!confirm(`Are you sure you want to delete "${email}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                fetchUsers();
            } else {
                alert(data.error || 'Failed to delete user');
            }
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Failed to delete user');
        }
    };

    const handleSaveUser = async (userData: {
        email?: string;
        password?: string;
        bot_name?: string;
        nvidia_api_key?: string;
    }, userId?: string) => {
        try {
            const isEdit = !!userId;
            const url = isEdit ? `/api/admin/users/${userId}` : '/api/admin/users';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
            });

            const data = await res.json();
            if (data.success || data.user) {
                setShowAddModal(false);
                setEditingUser(null);
                fetchUsers();
                return true;
            } else {
                alert(data.error || 'Failed to save user');
                return false;
            }
        } catch (error) {
            console.error('Failed to save user:', error);
            alert('Failed to save user');
            return false;
        }
    };

    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.bot_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const usersWithKeys = users.filter(u => u.has_api_key).length;

    return (
        <div className="min-h-screen bg-white font-sans">
            <div className="max-w-6xl mx-auto p-8 lg:p-12 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <Link
                            href="/"
                            className="p-3 hover:bg-gray-50 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                            aria-label="Go back"
                        >
                            <ArrowLeft size={24} />
                        </Link>
                        <div>
                            <h1 className="text-4xl font-light text-gray-900 tracking-tight">Admin Dashboard</h1>
                            <p className="text-gray-500 mt-2 text-lg font-light">Manage users and API keys</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-full hover:bg-black hover:shadow-lg transition-all font-medium text-sm tracking-wide active:scale-95"
                    >
                        <Plus size={18} />
                        Add User
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl p-6 border border-blue-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500 text-white rounded-xl">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-3xl font-semibold text-gray-900">{users.length}</p>
                                <p className="text-gray-600 text-sm">Total Users</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-2xl p-6 border border-green-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-500 text-white rounded-xl">
                                <Key size={24} />
                            </div>
                            <div>
                                <p className="text-3xl font-semibold text-gray-900">{usersWithKeys}</p>
                                <p className="text-gray-600 text-sm">Users with API Keys</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-6 border border-purple-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-purple-500 text-white rounded-xl">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-3xl font-semibold text-gray-900">{users.length - usersWithKeys}</p>
                                <p className="text-gray-600 text-sm">Using Shared Pool</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search and Refresh */}
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search users by email or bot name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        />
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-3 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* User List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Loader2 className="animate-spin mb-3" size={32} />
                        <span className="font-light">Loading users...</span>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-gray-50/50 rounded-[32px] border border-dashed border-gray-200">
                        <div className="bg-white p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                            <Users size={24} className="text-gray-300" />
                        </div>
                        <h3 className="text-gray-900 font-medium mb-1">
                            {searchQuery ? 'No users found' : 'No users yet'}
                        </h3>
                        <p className="text-gray-500 text-sm max-w-sm mx-auto font-light">
                            {searchQuery
                                ? 'Try a different search term'
                                : 'Add your first user to get started'}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {filteredUsers.map((user) => (
                            <UserCard
                                key={user.id}
                                user={user}
                                onEdit={() => handleEditUser(user.id)}
                                onDelete={() => handleDeleteUser(user.id, user.email)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            {showAddModal && (
                <UserModal
                    mode="add"
                    onClose={() => setShowAddModal(false)}
                    onSave={(data) => handleSaveUser(data)}
                />
            )}

            {/* Edit User Modal */}
            {editingUser && (
                <UserModal
                    mode="edit"
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSave={(data) => handleSaveUser(data, editingUser.user.id)}
                />
            )}

            {/* Loading overlay for details */}
            {loadingDetails && (
                <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 shadow-xl">
                        <Loader2 className="animate-spin mx-auto" size={32} />
                        <p className="mt-2 text-gray-600">Loading user details...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
