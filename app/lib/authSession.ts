// In-memory store for temporary auth sessions
// In production, you might want to use Redis or a database

export interface AuthPageData {
    id: string;
    name: string;
    access_token?: string;
    [key: string]: unknown;
}

const authSessions = new Map<string, { pages: AuthPageData[], expires: number }>();

// Clean up expired sessions periodically
function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [key, value] of authSessions.entries()) {
        if (value.expires < now) {
            authSessions.delete(key);
        }
    }
}

// Generate a cryptographically secure session ID
function generateSessionId(): string {
    return crypto.randomUUID();
}

// Store pages data and return session ID
export function storeAuthSession(pages: AuthPageData[]): string {
    cleanupExpiredSessions();
    const sessionId = generateSessionId();
    authSessions.set(sessionId, {
        pages,
        expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    });
    return sessionId;
}

// Retrieve and delete pages data
export function retrieveAuthSession(sessionId: string): AuthPageData[] | null {
    cleanupExpiredSessions();
    const session = authSessions.get(sessionId);
    if (session) {
        authSessions.delete(sessionId); // One-time use
        return session.pages;
    }
    return null;
}
