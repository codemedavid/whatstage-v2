'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, FileText, MoreHorizontal, Folder, FolderPlus, ChevronRight, ChevronDown, Move, Trash2, X, CheckSquare, Square, Tag, HelpCircle, Edit2, CreditCard, Upload } from 'lucide-react';
import CategoryModal from './CategoryModal';
import DocumentUploadModal from './DocumentUploadModal';

interface Category {
  id: string;
  name: string;
  type: 'general' | 'qa' | 'payment_method';
  color: string;
}

interface KnowledgeItem {
  id: string;
  text: string;
  createdAt: string;
  folderId?: string;
  categoryId?: string;
}

interface FolderItem {
  id: string;
  name: string;
  isOpen: boolean;
  categoryId?: string;
}

interface KnowledgeBaseProps {
  onSelect: (text: string) => void;
  onCategorySelect?: (category: Category | null) => void;
  onCreateDocument: () => void;
}

const COLORS = [
  { name: 'gray', text: 'text-gray-600', bg: 'bg-gray-100' },
  { name: 'blue', text: 'text-blue-600', bg: 'bg-blue-100' },
  { name: 'green', text: 'text-green-600', bg: 'bg-green-100' },
  { name: 'purple', text: 'text-purple-600', bg: 'bg-purple-100' },
  { name: 'orange', text: 'text-orange-600', bg: 'bg-orange-100' },
  { name: 'pink', text: 'text-pink-600', bg: 'bg-pink-100' },
];

export default function KnowledgeBase({ onSelect, onCategorySelect, onCreateDocument }: KnowledgeBaseProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);

  // UI States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null); // categoryId or 'uncategorized'
  const [newFolderName, setNewFolderName] = useState('');

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'doc' | 'folder' | 'category'; id: string; align: 'top' | 'bottom' } | null>(null);
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    await Promise.all([
      fetchCategories(),
      fetchFolders(),
      fetchKnowledge()
    ]);
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (Array.isArray(data)) setCategories(data);
    } catch (error) { console.error('Failed to fetch categories', error); }
  };

  const fetchKnowledge = async () => {
    try {
      const res = await fetch('/api/knowledge');
      const data = await res.json();
      setKnowledge(data);
    } catch (error) { console.error('Failed to fetch knowledge', error); }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      if (Array.isArray(data)) setFolders(data);
    } catch (error) { console.error('Failed to fetch folders', error); }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setShowMoveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateCategory = async (name: string, type: 'general' | 'qa' | 'payment_method', color: string) => {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, color }),
      });
      if (res.ok) fetchCategories();
    } catch (error) { console.error('Failed to create category:', error); }
  };

  const handleCreateFolder = async (targetCategoryId: string | null) => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName, categoryId: targetCategoryId }),
      });
      if (res.ok) {
        await fetchFolders();
        setCreatingFolderIn(null);
        setNewFolderName('');
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const deleteItem = async (type: 'doc' | 'folder' | 'category', id: string) => {
    if (!confirm(`Delete this ${type === 'doc' ? 'document' : type}?`)) return;
    try {
      const endpoint = type === 'doc' ? '/api/knowledge' : type === 'folder' ? '/api/folders' : '/api/categories';
      await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' });

      if (type === 'doc') setKnowledge(prev => prev.filter(k => k.id !== id));
      if (type === 'folder') setFolders(prev => prev.filter(f => f.id !== id));
      if (type === 'category') setCategories(prev => prev.filter(c => c.id !== id));

      setContextMenu(null);
    } catch (error) {
      console.error(`Failed to delete ${type}:`, error);
    }
  };

  const moveTo = async (docId: string, target: { folderId?: string | null, categoryId?: string | null }) => {
    try {
      await fetch('/api/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, ...target }),
      });
      setKnowledge(prev => prev.map(k =>
        k.id === docId ? { ...k, folderId: target.folderId || undefined, categoryId: target.categoryId || undefined } : k
      ));
    } catch (error) {
      console.error('Failed to move document:', error);
    }
    setContextMenu(null);
    setShowMoveMenu(null);
  };

  const bulkMoveTo = async (target: { folderId?: string | null, categoryId?: string | null }) => {
    try {
      await Promise.all(
        Array.from(selectedDocs).map(id =>
          fetch('/api/knowledge', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...target }),
          })
        )
      );
      setKnowledge(prev => prev.map(k =>
        selectedDocs.has(k.id) ? { ...k, folderId: target.folderId || undefined, categoryId: target.categoryId || undefined } : k
      ));
    } catch (error) {
      console.error('Failed to bulk move:', error);
    }
    setSelectedDocs(new Set());
    setBulkMode(false);
  };

  const handleMoveSelectChange = (value: string) => {
    if (!value) return;
    const [type, id] = value.split(':');

    if (type === 'root') { // Unfiled
      bulkMoveTo({ folderId: null, categoryId: null });
    } else if (type === 'cat') {
      bulkMoveTo({ folderId: null, categoryId: id });
    } else if (type === 'folder') {
      const folder = folders.find(f => f.id === id);
      bulkMoveTo({ folderId: id, categoryId: folder?.categoryId || null });
    }
  };

  const toggleCategory = (id: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCategories(newSet);
  };

  const toggleFolder = (id: string) => {
    setFolders(folders.map(f => f.id === id ? { ...f, isOpen: !f.isOpen } : f));
  };


  const toggleDocSelection = (id: string) => {
    const newSet = new Set(selectedDocs);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedDocs(newSet);
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'doc' | 'folder' | 'category', id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const heightEstimate = 300;
    const align = (window.innerHeight - e.clientY) < heightEstimate ? 'bottom' : 'top';

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      id,
      align
    });
  };

  // Helper to get color classes
  const getColor = (colorName: string) => COLORS.find(c => c.name === colorName) || COLORS[0];

  // Render Helpers
  const renderDocItem = (item: KnowledgeItem, inFolder = false) => (
    <div
      key={item.id}
      onClick={() => bulkMode ? toggleDocSelection(item.id) : onSelect(item.text)}
      onContextMenu={(e) => handleContextMenu(e, 'doc', item.id)}
      className={`group flex items-center justify-between px-3 py-1.5 ml-2 hover:bg-gray-100 rounded cursor-pointer ${selectedDocs.has(item.id) ? 'bg-teal-50 text-teal-700' : 'text-gray-600'
        }`}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {bulkMode && (
          <div onClick={(e) => { e.stopPropagation(); toggleDocSelection(item.id); }}>
            {selectedDocs.has(item.id) ? <CheckSquare size={14} className="text-teal-600" /> : <Square size={14} className="text-gray-300" />}
          </div>
        )}
        <FileText size={14} className="flex-shrink-0 opacity-70" />
        <span className="text-sm truncate">{item.text.substring(0, 25)}{item.text.length > 25 ? '...' : ''}</span>
      </div>
    </div>
  );

  const renderFolder = (folder: FolderItem) => {
    const docsInFolder = knowledge.filter(k => k.folderId === folder.id);
    return (
      <div key={folder.id} className="ml-2">
        <div
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
          className="flex items-center gap-2 px-2 py-1.5 text-gray-700 hover:bg-gray-100 rounded cursor-pointer group"
        >
          {folder.isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <Folder size={16} className="text-teal-600/80" />
          <span className="text-sm font-medium flex-1 truncate">{folder.name}</span>
          <span className="text-xs text-gray-400">{docsInFolder.length}</span>
        </div>

        {folder.isOpen && (
          <div className="ml-4 border-l border-gray-100 pl-1">
            {docsInFolder.map(doc => renderDocItem(doc, true))}
            {docsInFolder.length === 0 && (
              <div className="px-4 py-1 text-xs text-gray-400 italic">Empty</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-72 flex flex-col h-full bg-white border-r border-gray-200 flex-shrink-0">
      {/* Search Header */}
      <div className="p-3 border-b border-gray-100 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border text-black border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
          />
        </div>
        <button
          onClick={() => setBulkMode(!bulkMode)}
          className={`p-1.5 rounded-md transition-colors shadow-sm ${bulkMode ? 'bg-teal-100 text-teal-700' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
          title={bulkMode ? "Exit Selection Mode" : "Select Items"}
        >
          <CheckSquare size={16} />
        </button>

        <button
          onClick={() => setShowUploadModal(true)}
          className="p-1.5 bg-white text-gray-600 rounded-md hover:bg-gray-100 transition-colors shadow-sm border border-gray-200"
          title="Upload Document"
        >
          <Upload size={16} />
        </button>

        <button
          onClick={onCreateDocument}
          className="p-1.5 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors shadow-sm"
          title="New Document"
        >
          <Plus size={16} />
        </button>

      </div>

      {/* Bulk Actions Bar */}
      {bulkMode && selectedDocs.size > 0 && (
        <div className="p-2 bg-teal-50 border-b border-teal-100 flex items-center gap-2 animate-in slide-in-from-top-2">
          <span className="text-xs text-teal-700 font-medium whitespace-nowrap">{selectedDocs.size} selected</span>
          <div className="flex-1 min-w-0">
            <select
              onChange={(e) => handleMoveSelectChange(e.target.value)}
              className="w-full text-xs border border-teal-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-teal-400"
              defaultValue=""
            >
              <option value="" disabled>Move to...</option>
              <option value="root">Unfiled</option>
              <optgroup label="Categories">
                {categories.map(c => <option key={c.id} value={`cat:${c.id}`}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Folders">
                {folders.map(f => <option key={f.id} value={`folder:${f.id}`}>{f.name}</option>)}
              </optgroup>
            </select>
          </div>
          <button
            onClick={() => {
              Array.from(selectedDocs).forEach(id => deleteItem('doc', id));
              setSelectedDocs(new Set());
              setBulkMode(false);
            }}
            className="p-1 text-red-600 hover:bg-red-100 rounded flex-shrink-0"
            title="Delete selected"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Categories */}
        {categories.map(cat => {
          const catFolders = folders.filter(f => f.categoryId === cat.id);
          const catDocs = knowledge.filter(k => k.categoryId === cat.id && !k.folderId);
          const color = getColor(cat.color);
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="space-y-1">
              <div
                className="flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 cursor-pointer group"
                onClick={() => {
                  toggleCategory(cat.id);
                  if (onCategorySelect) onCategorySelect(cat);
                }}
                onContextMenu={(e) => handleContextMenu(e, 'category', cat.id)}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${color.bg.replace('bg-', 'bg-').replace('100', '500')}`}></span>
                  <span>{cat.name}</span>
                  {cat.type === 'qa' && <span className="px-1 py-px bg-blue-50 text-blue-600 rounded text-[10px] border border-blue-100">FAQ</span>}
                  {cat.type === 'payment_method' && <span className="px-1 py-px bg-teal-50 text-teal-600 rounded text-[10px] border border-teal-100">Payment</span>}
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCreatingFolderIn(cat.id); }}
                    className="p-1 hover:bg-gray-200 rounded text-gray-500"
                    title="Add Folder"
                  >
                    <FolderPlus size={14} />
                  </button>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </div>

              {/* New Folder Input */}
              {creatingFolderIn === cat.id && (
                <div className="ml-4 px-2 py-1 flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                  <Folder size={14} className="text-gray-400" />
                  <input
                    className="w-full text-sm border-b border-teal-500 focus:outline-none px-1 py-px bg-transparent"
                    placeholder="Folder Name"
                    autoFocus
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateFolder(cat.id);
                      if (e.key === 'Escape') setCreatingFolderIn(null);
                    }}
                    onBlur={() => { if (!newFolderName) setCreatingFolderIn(null); }}
                  />
                </div>
              )}

              {/* Contents */}
              {(isExpanded || true) && (
                <div className="space-y-0.5">
                  {catFolders.map(renderFolder)}
                  {catDocs.map(doc => renderDocItem(doc))}
                  {catFolders.length === 0 && catDocs.length === 0 && !creatingFolderIn && (
                    <div className="px-4 py-2 text-xs text-gray-400 italic">No items</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Uncategorized */}
        <div className="pt-4 border-t border-gray-100 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <div className="flex items-center gap-2">
              <HelpCircle size={12} />
              <span>Uncategorized</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setCreatingFolderIn('uncategorized'); }}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
              title="Add Folder"
            >
              <FolderPlus size={14} />
            </button>
          </div>

          {/* New Folder Input for Uncategorized */}
          {creatingFolderIn === 'uncategorized' && (
            <div className="ml-4 px-2 py-1 flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
              <Folder size={14} className="text-gray-400" />
              <input
                className="w-full text-sm border-b border-teal-500 focus:outline-none px-1 py-px bg-transparent"
                placeholder="Folder Name"
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateFolder(null); // Null categoryId
                  if (e.key === 'Escape') setCreatingFolderIn(null);
                }}
                onBlur={() => { if (!newFolderName) setCreatingFolderIn(null); }}
              />
            </div>
          )}

          {folders.filter(f => !f.categoryId).map(renderFolder)}
          {knowledge.filter(k => !k.categoryId && !k.folderId).map(doc => renderDocItem(doc))}
        </div>

        {/* Add Category Button */}
        <button
          onClick={() => setShowCategoryModal(true)}
          className="w-full py-2 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 transition-all mt-6 mb-2 group"
        >
          <Plus size={16} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
          <span className="font-medium">Add Category</span>
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            transform: contextMenu.align === 'bottom' ? 'translateY(-100%)' : 'none'
          }}
        >
          {contextMenu.type === 'doc' && (
            <>
              <button
                onClick={() => setShowMoveMenu(contextMenu.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Move size={14} />
                Move to...
              </button>
              {showMoveMenu === contextMenu.id && (
                <div className="border-t border-gray-100 py-1 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => moveTo(contextMenu.id, { folderId: null, categoryId: null })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 bg-gray-50/50"
                  >
                    <span>Unfiled</span>
                  </button>
                  {categories.map(c => {
                    const cFolders = folders.filter(f => f.categoryId === c.id);
                    return (
                      <div key={c.id}>
                        <button
                          onClick={() => moveTo(contextMenu.id, { folderId: null, categoryId: c.id })}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${getColor(c.color).bg.replace('100', '500')}`} />
                          {c.name}
                        </button>
                        {cFolders.map(f => (
                          <button
                            key={f.id}
                            onClick={() => moveTo(contextMenu.id, { folderId: f.id, categoryId: c.id })}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 pl-6"
                          >
                            <Folder size={12} className="text-gray-400" />
                            {f.name}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-gray-100 my-1" />
            </>
          )}

          <button
            onClick={() => deleteItem(contextMenu.type, contextMenu.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}

      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSave={handleCreateCategory}
      />

      <DocumentUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          fetchData();
          setShowUploadModal(false);
        }}
        categories={categories}
      />
    </div>
  );
}
