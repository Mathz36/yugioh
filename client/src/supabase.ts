import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { deckService } from '@duel/deck-service';

function getEnvVar(key: string): string {
  try {
    const metaEnv = new Function('try { return import.meta.env; } catch (e) { return undefined; }')();
    if (metaEnv && metaEnv[key]) {
      return String(metaEnv[key]).trim();
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return String(process.env[key]).trim();
    }
  } catch {}
  return '';
}

export const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY');

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
