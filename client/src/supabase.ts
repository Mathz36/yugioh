import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { deckService } from '@duel/deck-service';

declare const __SUPABASE_URL__: string | undefined;
declare const __SUPABASE_KEY__: string | undefined;

// Robust resolution supporting Vite define, import.meta.env, and process.env across all Vercel integration formats
const resolvedUrl: string =
  (typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__) ||
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_SUPABASE_URL ||
      import.meta.env?.SUPABASE_URL ||
      import.meta.env?.NEXT_PUBLIC_SUPABASE_URL)) ||
  (typeof process !== 'undefined' &&
    (process.env?.VITE_SUPABASE_URL ||
      process.env?.SUPABASE_URL ||
      process.env?.NEXT_PUBLIC_SUPABASE_URL)) ||
  '';

const resolvedKey: string =
  (typeof __SUPABASE_KEY__ !== 'undefined' && __SUPABASE_KEY__) ||
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_SUPABASE_ANON_KEY ||
      import.meta.env?.SUPABASE_ANON_KEY ||
      import.meta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      import.meta.env?.SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.SUPABASE_SERVICE_ROLE_KEY ||
      import.meta.env?.SUPABASE_SECRET_KEY ||
      import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY)) ||
  (typeof process !== 'undefined' &&
    (process.env?.VITE_SUPABASE_ANON_KEY ||
      process.env?.SUPABASE_ANON_KEY ||
      process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env?.SUPABASE_PUBLISHABLE_KEY ||
      process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env?.SUPABASE_SERVICE_ROLE_KEY ||
      process.env?.SUPABASE_SECRET_KEY ||
      process.env?.VITE_SUPABASE_SERVICE_ROLE_KEY)) ||
  '';

export const SUPABASE_URL = String(resolvedUrl || '').trim();
export const SUPABASE_ANON_KEY = String(resolvedKey || '').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Shared Supabase Client instance for the browser client.
 * Configured with session persistence in localStorage and automatic token refresh.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (supabase) {
  deckService.setSupabaseClient(supabase);
}
