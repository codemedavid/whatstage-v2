'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, RotateCcw, Clock, AlertCircle } from 'lucide-react';

interface Message {
    role: 'user' | 'bot';
    content: string;
    timestamp?: number;
    responseTime?: number;
}

export default function ChatPreview() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [botName, setBotName] = useState('TestBot');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);

    // Fetch bot settings to get the actual bot name
    useEffect(() => {
        const fetchBotSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    if (data.botName) {
                        setBotName(data.botName);
                    }
                }
            } catch (err) {
                console.log('[ChatPreview] Could not fetch bot settings, using default name');
            }
        };
        fetchBotSettings();
    }, []);


    // Generate a NEW session ID only once on mount
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const newId = `web_test_${Date.now()}`;
        setSessionId(newId);
        setMessages([
            {
                role: 'bot',
                content: `Hi! I'm TestBot. Ask me anything to test how I'll respond to your customers.`,
                timestamp: Date.now()
            }
        ]);
        console.log('[ChatPreview] New test session:', newId);
    }, []);

    // Update the first message's content when botName is loaded (without resetting messages)
    useEffect(() => {
        if (botName && botName !== 'TestBot') {
            setMessages((prev) => {
                if (prev.length === 0) return prev;
                // Only update if the first message is the initial bot greeting
                const firstMsg = prev[0];
                if (firstMsg.role === 'bot' && firstMsg.content.includes("Ask me anything to test")) {
                    const updated = [...prev];
                    updated[0] = {
                        ...firstMsg,
                        content: `Hi! I'm ${botName}. Ask me anything to test how I'll respond to your customers.`
                    };
                    return updated;
                }
                return prev;
            });
        }
    }, [botName]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Clear chat and start fresh
    const handleClearChat = () => {
        const newId = `web_test_${Date.now()}`;
        setSessionId(newId);
        setError(null);
        setMessages([
            { role: 'bot', content: `Chat cleared! I'm ready for fresh questions. 😊`, timestamp: Date.now() }
        ]);
        console.log('[ChatPreview] Chat cleared, new session:', newId);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input;
        const startTime = Date.now();
        setInput('');
        setError(null);
        setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: startTime }]);
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage, sessionId }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Request failed with status ${res.status}`);
            }

            const data = await res.json();
            const responseTime = Date.now() - startTime;

            setMessages((prev) => [...prev, {
                role: 'bot',
                content: data.reply,
                timestamp: Date.now(),
                responseTime
            }]);

            // Track auth status - coerce to boolean
            if (data.userId !== undefined) {
                setIsAuthenticated(!!data.userId);
            }

            // Store session ID if returned
            if (data.sessionId && !sessionId) {
                setSessionId(data.sessionId);
            }
        } catch (err: any) {
            console.error('Chat error:', err);
            setError(err.message || 'An error occurred');
            setMessages((prev) => [...prev, {
                role: 'bot',
                content: `Sorry, I encountered an error: ${err.message || 'Please try again.'}`,
                timestamp: Date.now()
            }]);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full flex-shrink-0">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <Bot className="text-teal-600" size={20} />
                <div className="flex-1">
                    <h2 className="font-semibold text-gray-800">{botName}</h2>
                    <p className="text-xs text-gray-400">
                        {isAuthenticated ? 'Using your bot config' : 'Test Mode'}
                    </p>
                </div>
                <button
                    onClick={handleClearChat}
                    className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                    title="Clear chat & start fresh"
                >
                    <RotateCcw size={16} />
                </button>
            </div>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-xs text-red-600">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
                <div className="text-center text-xs text-gray-400 my-2">Today</div>

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gray-200' : 'bg-teal-600 text-white'
                            }`}>
                            {msg.role === 'user' ? 'U' : <Bot size={16} />}
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user'
                                ? 'bg-white text-gray-800 rounded-tr-none border border-gray-100'
                                : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
                                }`}>
                                {msg.content}
                            </div>
                            {msg.responseTime && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <Clock size={10} />
                                    <span>{(msg.responseTime / 1000).toFixed(1)}s</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0">
                            <Bot size={16} />
                        </div>
                        <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700"
                        disabled={loading}
                    />
                    <div className="absolute right-2 top-1.5 flex items-center gap-1">
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="p-1.5 text-teal-600 hover:text-teal-700 disabled:text-gray-300"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
