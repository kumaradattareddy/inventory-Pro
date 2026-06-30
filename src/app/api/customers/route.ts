import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Long-lived in-memory cache
let cachedData: any = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds — customers don't change that fast

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bypassCache = searchParams.get("bypass_cache") === "true";

    const now = Date.now();
    if (cachedData && (now - cacheTime < CACHE_TTL) && !bypassCache) {
      return NextResponse.json(cachedData);
    }

    const supabase = createClient();

    // Fetch all 4 tables concurrently — each with its own pagination
    const [customers, stockMoves, adjustments, payments] = await Promise.all([
      fetchAllPages(supabase, "customers", "id, name, opening_balance"),
      fetchAllPages(supabase, "stock_moves", "customer_id, qty, price_per_unit", { kind: "sale" }),
      fetchAllPages(supabase, "bill_adjustments", "customer_id, type, amount"),
      fetchAllPages(supabase, "payments", "customer_id, amount", { party_type: "customer", direction: "in" }),
    ]);

    // Aggregate in memory using Maps (fastest JS data structure for lookups)
    const saleMap = new Map<number, number>();
    for (let i = 0; i < stockMoves.length; i++) {
      const sm = stockMoves[i];
      if (!sm.customer_id) continue;
      const val = (Number(sm.qty) || 0) * (Number(sm.price_per_unit) || 0);
      saleMap.set(sm.customer_id, (saleMap.get(sm.customer_id) || 0) + val);
    }

    const adjMap = new Map<number, number>();
    for (let i = 0; i < adjustments.length; i++) {
      const ba = adjustments[i];
      if (!ba.customer_id) continue;
      const amt = Number(ba.amount) || 0;
      const val = String(ba.type || "").toLowerCase() === "discount" ? -amt : amt;
      adjMap.set(ba.customer_id, (adjMap.get(ba.customer_id) || 0) + val);
    }

    const payMap = new Map<number, number>();
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!p.customer_id) continue;
      payMap.set(p.customer_id, (payMap.get(p.customer_id) || 0) + (Number(p.amount) || 0));
    }

    const results = new Array(customers.length);
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      const cid = Number(c.id);
      const raw = (Number(c.opening_balance) || 0) 
        + (saleMap.get(cid) || 0) 
        + (adjMap.get(cid) || 0) 
        - (payMap.get(cid) || 0);
      const bal = Math.round(raw * 100) / 100;
      results[i] = { id: cid, name: c.name, balance: bal === -0 ? 0 : bal };
    }

    results.sort((a: any, b: any) => a.name.localeCompare(b.name));

    cachedData = results;
    cacheTime = Date.now();

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Error in /api/customers:", error);
    return NextResponse.json({ error: error.message || "Failed to load customers" }, { status: 500 });
  }
}

// Fetch all rows from a table, paginating in 1000-row chunks.
// First page is fetched, then remaining pages fire concurrently.
async function fetchAllPages(
  supabase: any,
  table: string,
  select: string,
  filters?: Record<string, string>
): Promise<any[]> {
  const PAGE = 1000;

  function buildQuery(from: number, to: number) {
    let q = supabase.from(table).select(select);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        q = q.eq(k, v);
      }
    }
    return q.range(from, to);
  }

  const first = await buildQuery(0, PAGE - 1);
  if (first.error) throw first.error;
  const firstData = first.data ?? [];
  if (firstData.length < PAGE) return firstData;

  // Need more — fire pages 1-9 concurrently (up to 10k rows total)
  const promises = [];
  for (let p = 1; p <= 9; p++) {
    promises.push(buildQuery(p * PAGE, (p + 1) * PAGE - 1));
  }
  const rest = await Promise.all(promises);
  const all = [...firstData];
  for (const res of rest) {
    if (res.error) throw res.error;
    if (!res.data || res.data.length === 0) break;
    all.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  return all;
}
