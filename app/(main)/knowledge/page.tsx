'use client';

import { useState } from "react";
import KnowledgeBase from "../../components/KnowledgeBase";
import ChatPreview from "../../components/ChatPreview";
import Header from "../../components/Header";
import DocumentEditor from "../../components/DocumentEditor";
import RulesEditor from "../../components/RulesEditor";

import FAQEditor from "../../components/FAQEditor";
import PaymentMethodEditor from "../../components/PaymentMethodEditor";
import { FileText, Bot, CreditCard } from "lucide-react";

interface Category {
  id: string;
  name: string;
  type: 'general' | 'qa' | 'payment_method';
  color: string;
}

export default function Home() {
  const [selectedDocText, setSelectedDocText] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'rules'>('documents');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isEditingDoc, setIsEditingDoc] = useState(false);

  const handleSaveDocument = async (text: string, categoryId?: string) => {
    try {
      if (selectedDocId) {
        // Update existing document
        await fetch('/api/knowledge', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedDocId, text, categoryId }),
        });
      } else {
        // Create new document
        await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, categoryId }),
        });
      }
      window.location.reload();
    } catch (error) {
      console.error('Failed to save document:', error);
    }
  };

  const handleCreateDocument = () => {
    setSelectedDocText('');
    setSelectedDocId(null);
    setSelectedCategory(null);
    setActiveTab('documents');
    setIsEditingDoc(true);
  };


  // Determine which editor to show based on selected category
  const renderEditor = () => {
    if (activeTab === 'rules') {
      return <RulesEditor />;
    }

    // If user explicitly selected a document, show document editor
    if (isEditingDoc) {
      return (
        <DocumentEditor
          initialText={selectedDocText}
          onSave={(text) => handleSaveDocument(text, selectedCategory?.id)}
        />
      );
    }

    // If a Q&A category is selected (and not editing a doc), show FAQ editor
    if (selectedCategory?.type === 'qa') {
      return (
        <FAQEditor
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
        />
      );
    }

    // If a Payment Method category is selected, show Payment Method editor
    if (selectedCategory?.type === 'payment_method') {
      return (
        <PaymentMethodEditor
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
        />
      );
    }

    // Default: show document editor (e.g. for general categories or no category)
    return (
      <DocumentEditor
        initialText={selectedDocText}
        onSave={(text) => handleSaveDocument(text, selectedCategory?.id)}
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Knowledge Base Sidebar */}
        <KnowledgeBase
          onSelect={(doc: { id: string; text: string }) => {
            setSelectedDocId(doc.id);
            setSelectedDocText(doc.text);
            setIsEditingDoc(true);
          }}
          onCategorySelect={(category: Category | null) => {
            setSelectedCategory(category);
            setIsEditingDoc(false);
          }}
          onCreateDocument={handleCreateDocument}
        />

        {/* Main Content Area with Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-1 flex-shrink-0">
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'documents'
                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              {selectedCategory?.type === 'payment_method' ? (
                <CreditCard size={16} />
              ) : (
                <FileText size={16} />
              )}
              {selectedCategory?.type === 'qa' ? 'FAQs' : selectedCategory?.type === 'payment_method' ? 'Payment Methods' : 'Documents'}
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'rules'
                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Bot size={16} />
              Bot Rules
            </button>
            {selectedCategory && (
              <span className="ml-2 text-sm text-gray-500">
                Category: <span className="font-medium text-gray-700">{selectedCategory.name}</span>
              </span>
            )}
            {!selectedCategory && (
              <span className="ml-2 text-sm text-gray-400">All Documents</span>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {renderEditor()}
          </div>
        </div>

        <ChatPreview />
      </div>
    </div>
  );
}
