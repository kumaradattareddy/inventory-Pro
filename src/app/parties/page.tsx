import { createClient } from "@/lib/supabase/server";
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

  // 2. Fetch Aggregated Purchases (Grouped by supplier_id ideally, but we fetch raw for now)
  // Optimization: In a larger app, use .rpc() or a view.
  const { data: purchases } = await supabase
    .from("stock_moves")
    .select("supplier_id, qty, price_per_unit")
    .eq("kind", "purchase");

  // 3. Fetch Aggregated Payments
  const { data: payments } = await supabase
    .from("payments")
    .select("party_id, amount, direction")
    .eq("party_type", "supplier");

  // 4. Aggregate Data in Memory
  const partyMap = new Map<number, { totalPurchases: number; totalPaid: number; opening: number }>();

  // Init Map
  suppliers.forEach((s) => {
    partyMap.set(s.id, { 
      totalPurchases: 0, 
      totalPaid: 0, 
      opening: s.opening_balance || 0 
    });
  });

  // Sum Purchases
  if (purchases) {
    purchases.forEach((p) => {
      if (!p.supplier_id) return;
      const current = partyMap.get(p.supplier_id);
      if (current) {
        current.totalPurchases += (p.qty || 0) * (p.price_per_unit || 0);
      }
    });
  }

  // Sum Payments
  if (payments) {
    payments.forEach((p) => {
      if (!p.party_id) return;
      const current = partyMap.get(p.party_id);
      if (current) {
        const amt = p.amount || 0;
        if (p.direction === 'out') {
           current.totalPaid += amt;
        } else {
           current.totalPaid -= amt;
        }
      }
    });
  }

  // format for client
  const partiesData = suppliers.map((s) => {
    const agg = partyMap.get(s.id)!;
    return {
      id: s.id,
      name: s.name || "Unknown",
      totalPurchases: agg.totalPurchases,
      totalPaid: agg.totalPaid,
      balance: agg.opening + agg.totalPurchases - agg.totalPaid
    };
  });

  return (
    <div className="page max-w-6xl mx-auto">
      <div className="page-header mb-6">
        <div>
           <h1 className="text-3xl font-bold text-gray-900">Parties & Accounts</h1>
           <p className="text-gray-500">Track supplier balances and record payments.</p>
        </div>
        
        {/* We can keep this link for creating new, or eventually make it a modal too */}
        {/* <Link href="/parties/new" className="btn btn-primary">Add Supplier</Link> */}
      </div>

      <PartiesList initialParties={partiesData} />
    </div>
  );
}
