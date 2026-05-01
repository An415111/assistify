
export enum ChatAction {
  REPLY = 'reply',
  SCHEDULE = 'schedule',
  HELP = 'help'
}

export interface Message {
  id: string;
  chat_id: string;
  user_name: string;
  text: string;
  is_bot: boolean;
  action?: ChatAction;
  timestamp: number;
  is_manual?: boolean; // True if sent by human admin from dashboard
}

export interface ChatSession {
  chat_id: string;
  user_name: string;
  status: 'active' | 'needs_help' | 'resolved';
  messages: Message[];
  isBotEnabled: boolean;
  lastActivity: number;
}

export interface Schedule {
  id: string;
  chat_id: string;
  user_name: string;
  proposed_time: string;
  status: 'pending' | 'done';
}

export interface AIResponse {
  action: ChatAction;
  reply_text: string;
  schedule_times?: string[];
  confidence: number;
  reasoning?: string;
}
