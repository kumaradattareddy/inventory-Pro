import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  if (!query) return NextResponse.json([], { status: 200 });

  // Base customers
  const { data: customers, error: cErr } = await supabase
    .from("customers")
    .select("id, name, opening_balance")
    .ilike("name", `%${query}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!customers?.length) return NextResponse.json([], { status: 200 });

  // Merge in balances from view
  const ids = customers.map((c) => c.id);
  const { data: totals, error: tErr } = await supabase
    .from("customer_totals")
    .select("id, balance")
    .in("id", ids);

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  const map = new Map<number, number>();
  (totals || []).forEach((t) => map.set(t.id as number, t.balance as number));

  const merged = customers.map((c) => ({
    id: c.id,
    name: c.name,
    opening_balance: c.opening_balance ?? 0,
    balance: map.get(c.id) ?? null,
  }));

  return NextResponse.json(merged, { status: 200 });
}
