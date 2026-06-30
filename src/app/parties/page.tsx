import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import PartiesList from "./parties-list";

export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const supabase = await createClient();

  // 1. Fetch Suppliers
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, opening_balance")
    .order("name");

  if (!suppliers) return <div className="page">Error loading suppliers</div>;

  // Helper to fetch all rows ignoring the 1000 limit
  async function fetchAll(queryBuilder: any) {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await queryBuilder.range(page * pageSize, (page + 1) * pageSize - 1);
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < pageSize) break;
      page++;
    }
    return allData;
  }

  // 2. Fetch Purchases (ALL pages)
  const purchases = await fetchAll(
    supabase
      .from("stock_moves")
      .select("supplier_id, qty, qty_pcs, price_per_unit, products(material)")
      .eq("kind", "purchase")
  );

  // 3. Fetch Payments & Adjustments (ALL pages)
  const payments = await fetchAll(
    supabase
      .from("payments")
      .select("party_id, amount, direction")
      .eq("party_type", "supplier")
  );

  // 4. Aggregate Data in Memory
  const partyMap = new Map<number, { totalPurchases: number; totalPaid: number; opening: number }>();

  // Init Map
  suppliers.forEach((s) => {
    partyMap.set(s.id, { 
      totalPurchases: 0, 
      totalPaid: 0, 
      opening: Number(s.opening_balance) || 0 
    });
  });

  // Sum Purchases
  if (purchases) {
    purchases.forEach((p: any) => {
      if (!p.supplier_id) return;
      const current = partyMap.get(p.supplier_id);
      if (current) {
        // Handle granite qty_sqft vs qty
        const isGranite = p.products?.material?.toLowerCase() === "granite";
        const qtyToUse = isGranite ? (Number(p.qty_pcs || p.qty) || 0) : (Number(p.qty) || 0); // Need to use standard logic? Actually, in purchase-form, it's:
        // qty: isGranite ? Number(row.qty_sqft) || 0 : Number(row.qty) || 0,
        // So p.qty already holds sqft for Granite.
        const qty = Number(p.qty) || 0;
        const price = Number(p.price_per_unit) || 0;
        current.totalPurchases += (qty * price);
      }
    });
  }

  // Sum Payments & Adjustments
  if (payments) {
    payments.forEach((p: any) => {
      if (!p.party_id) return;
      const current = partyMap.get(p.party_id);
      if (current) {
        const amt = Number(p.amount) || 0;
        // Direction 'out' = We paid supplier (Reduces debt). Direction 'in' = Supplier gave us money or we owe them more.
        if (p.direction === 'out') {
           current.totalPaid += amt;
        } else {
           current.totalPaid -= amt;
        }
      }
    });
  }

  const partiesData = suppliers.map((s) => {
    const agg = partyMap.get(s.id)!;
    const purchases = Math.round(agg.totalPurchases * 100) / 100;
    const paid = Math.round(agg.totalPaid * 100) / 100;
    const rawBal = agg.opening + purchases - paid;
    const bal = Math.round(rawBal * 100) / 100;
    
    // Add temporary verification log
    if (s.id === 47 || s.name === "1200*600") {
      console.log(`[SUPPLIER LOG] ID: ${s.id} | Name: ${s.name} | Bought: ${purchases} | Paid: ${paid} | Opening: ${agg.opening} | Balance: ${bal}`);
    }
    
    return {
      id: s.id,
      name: s.name || "Unknown",
      totalPurchases: purchases,
      totalPaid: paid,
      balance: bal === -0 ? 0 : bal
    };
  });

  return (
    <div className="page">
      <PartiesList initialParties={partiesData} />
    </div>
  );
}
