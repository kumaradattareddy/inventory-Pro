// src/lib/supabase/client.ts

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function createClient() {
  // Pass the <Database> generic type to the client
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}