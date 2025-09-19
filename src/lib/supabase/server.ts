// src/lib/supabase/server.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export function createClient() {
  // ✅ Important: NO async, NO await here
  const cookieStorePromise = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookieStore = await cookieStorePromise;
          return cookieStore.get(name)?.value;
        },
        async set(name: string, value: string, options: CookieOptions) {
          try {
            const cookieStore = await cookieStorePromise;
            cookieStore.set({ name, value, ...options });
          } catch {
            // ignore inside server components
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            const cookieStore = await cookieStorePromise;
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // ignore inside server components
          }
        },
      },
    }
  );
}
