import { User, ChatSession, Message } from '../types';
import { generateId } from '../utils';

const LOCAL_STORAGE_KEY = 'roblox_ai_sessions_v1';

const getLocalSessions = (): ChatSession[] => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error reading local storage", e);
    return [];
  }
};

const saveLocalSessions = (sessions: ChatSession[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("Error saving to local storage", e);
  }
};

export const authService = {
  // Always return a static guest user
  getCurrentUser: async (): Promise<User | null> => {
    return {
      id: 'guest_dev',
      username: 'Developer',
      avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=RobloxDev'
    };
  },
  
  // No-ops for login/signup/logout since we are using local storage only
  login: async () => { throw new Error("Local mode only"); },
  signup: async () => { throw new Error("Local mode only"); },
  logout: async () => { /* Optional: Clear local storage here if desired */ }
};

export const dbService = {
  getSessions: async (userId: string): Promise<ChatSession[]> => {
    // Return all sessions sorted by date
    const sessions = getLocalSessions();
    return sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  },

  createSession: async (userId: string, firstMessage: Message): Promise<ChatSession> => {
    const sessions = getLocalSessions();
    const title = firstMessage.content.slice(0, 30) + (firstMessage.content.length > 30 ? '...' : '');
    
    const newSession: ChatSession = {
      id: generateId(),
      userId, // Kept for type compatibility
      title: title || 'New Chat',
      messages: [firstMessage],
      lastUpdated: Date.now()
    };

    sessions.push(newSession);
    saveLocalSessions(sessions);
    return newSession;
  },

  updateSession: async (sessionId: string, newMessages: Message[]) => {
    const sessions = getLocalSessions();
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      sessions[index].messages = newMessages;
      sessions[index].lastUpdated = Date.now();
      saveLocalSessions(sessions);
    }
  },

  deleteSession: async (sessionId: string) => {
    let sessions = getLocalSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    saveLocalSessions(sessions);
  }
};