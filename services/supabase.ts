import { createClient } from '@supabase/supabase-js';

// Ensure these are set in your environment
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Check your environment variables (SUPABASE_URL, SUPABASE_ANON_KEY).");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * REQUIRED SQL SCHEMA FOR SUPABASE:
 * 
 * create table public.chat_sessions (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users not null,
 *   title text,
 *   messages jsonb default '[]'::jsonb,
 *   last_updated timestamptz default now()
 * );
 * 
 * -- Enable Row Level Security (RLS)
 * alter table public.chat_sessions enable row level security;
 * 
 * -- Create Policy
 * create policy "User can manage their own sessions"
 * on public.chat_sessions
 * for all
 * using (auth.uid() = user_id);
 */