export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // Base64 string
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  attachments?: Attachment[];
  isThinking?: boolean;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  avatar?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: Message[];
  lastUpdated: number;
}

export interface ChatConfig {
  deepThink: boolean;
  analyzeMode: boolean; // New mode
  model: string;
}

export interface GeminResponse {
  text: string;
}