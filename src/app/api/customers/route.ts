import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Long-lived in-memory cache
let cachedData: any = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bypassCache = searchParams.get("bypass_cache") === "true";

    const now = Date.now();
    if (cachedData && (now - cacheTime < CACHE_TTL) && !bypassCache) {
      return NextResponse.json(cachedData);
    }

    const supabase = createClient();

    // Fetch all 4 data sources concurrently — each fully paginated
    const [customers, stockMoves, adjustments, payments] = await Promise.all([
      fetchAllPages(supabase, "customers", "id, name, opening_balance"),
      fetchAllPages(supabase, "stock_moves", "customer_id, qty, price_per_unit", { kind: "sale" }),
      fetchAllPages(supabase, "bill_adjustments", "customer_id, type, amount"),
      fetchAllPages(supabase, "payments", "customer_id, amount", { party_type: "customer", direction: "in" }),
    ]);

    // Aggregate in memory using Maps
    const saleMap = new Map<number, number>();
    for (const sm of stockMoves) {
      if (!sm.customer_id) continue;
      const val = (Number(sm.qty) || 0) * (Number(sm.price_per_unit) || 0);
      saleMap.set(sm.customer_id, (saleMap.get(sm.customer_id) || 0) + val);
    }

    const adjMap = new Map<number, number>();
    for (const ba of adjustments) {
      if (!ba.customer_id) continue;
      const amt = Number(ba.amount) || 0;
      const val = String(ba.type || "").toLowerCase() === "discount" ? -amt : amt;
      adjMap.set(ba.customer_id, (adjMap.get(ba.customer_id) || 0) + val);
    }

    const payMap = new Map<number, number>();
    for (const p of payments) {
      if (!p.customer_id) continue;
      payMap.set(p.customer_id, (payMap.get(p.customer_id) || 0) + (Number(p.amount) || 0));
    }

    const results = customers.map((c: any) => {
      const cid = Number(c.id);
      const raw = (Number(c.opening_balance) || 0) 
        + (saleMap.get(cid) || 0) 
        + (adjMap.get(cid) || 0) 
        - (payMap.get(cid) || 0);
      const bal = Math.round(raw * 100) / 100;
      return { id: cid, name: c.name, balance: bal === -0 ? 0 : bal };
    });

    results.sort((a: any, b: any) => a.name.localeCompare(b.name));

    cachedData = results;
    cacheTime = Date.now();

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Error in /api/customers:", error);
    return NextResponse.json({ error: error.message || "Failed to load customers" }, { status: 500 });
  }
}

// Fetch ALL rows from a table, paginating in 1000-row chunks.
// Supports up to 50,000 rows (50 pages) to handle growing data safely.
async function fetchAllPages(
  supabase: any,
  table: string,
  select: string,
  filters?: Record<string, string>
): Promise<any[]> {
  const PAGE = 1000;
  const MAX_PAGES = 50; // Support up to 50k rows

  function buildQuery(from: number, to: number) {
    let q = supabase.from(table).select(select);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        q = q.eq(k, v);
      }
    }
    return q.range(from, to);
  }

  // Fetch first page
  const first = await buildQuery(0, PAGE - 1);
  if (first.error) throw first.error;
  const firstData = first.data ?? [];
  if (firstData.length < PAGE) return firstData;

  // Need more pages — fetch remaining concurrently
  const all = [...firstData];
  
  // Fire next few pages concurrently
  for (let batch = 1; batch < MAX_PAGES; batch += 5) {
    const promises = [];
    for (let p = batch; p < Math.min(batch + 5, MAX_PAGES); p++) {
      promises.push(buildQuery(p * PAGE, (p + 1) * PAGE - 1));
    }
    const results = await Promise.all(promises);
    let done = false;
    for (const res of results) {
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) { done = true; break; }
      all.push(...res.data);
      if (res.data.length < PAGE) { done = true; break; }
    }
    if (done) break;
  }
  
  return all;
}
