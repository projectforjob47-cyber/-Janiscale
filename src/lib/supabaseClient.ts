// ============================================================
// SMART DC — Supabase Client Configuration
// Central Cloud Database for Real-time Multi-Device Sync
// ============================================================

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('SMART_DC_SUPABASE_URL')) ||
  'https://lbneotgqarngzbwzruvw.supabase.co';

export const SUPABASE_ANON_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('SMART_DC_SUPABASE_KEY')) ||
  'sb_publishable_xCKtn3xUuB0boaII-HxcHQ_W15-NZ5L';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});
