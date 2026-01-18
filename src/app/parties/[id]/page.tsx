import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Consolidated Type
type LedgerItem = {
  id: string;
  date: string;
  type: "Purchase" | "Payment" | "Adjustment";
  details: string;
  amount_in: number; // Purchase / Charge (Increases Debt)
  amount_out: number; // Payment / Discount (Decreases Debt)
};

export default async function PartyDetailsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supplierId = Number(id);
  const supabase = await createClient();

  // 1. Fetch Supplier
  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .single();

  if (supplierError || !supplier) {
    return <div className="page">Error loading supplier</div>;
  }

  // 2. Fetch Purchases (Stock Moves)
  const { data: purchases } = await supabase
    .from("stock_moves")
    .select("id, ts, qty, price_per_unit, products(name, unit)")
    .eq("supplier_id", supplierId)
    .eq("kind", "purchase");

  // 3. Fetch Payments
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("party_id", supplierId); // Use party_id for Suppliers

  // 4. Transform & Merge
  const ledger: LedgerItem[] = [];

  // Add Purchases
  if (purchases) {
    purchases.forEach((p: any) => {
      const total = (p.qty || 0) * (p.price_per_unit || 0);
      ledger.push({
        id: `pur-${p.id}`,
        date: p.ts,
        type: "Purchase",
        details: `${p.qty} ${p.products?.unit || ''} of ${p.products?.name || 'Unknown Item'}`,
        amount_in: total,
        amount_out: 0,
      });
    });
  }

  // Add Payments
  if (payments) {
    payments.forEach((p: any) => {
      // Logic:
      // direction='out' -> We PAID them -> Reduces Debt -> amount_out
      // direction='in' -> Refund/Charge? -> Increases Debt?
      // Wait, 'out' reduces debt. 'in' increases debt (negative payment).
      
      // Notes: 
      // User might use 'in' for "Add Due/Charge".
      // User might use 'out' for "Reduce Due/Discount".
      
      const isOut = p.direction === "out";
      
      ledger.push({
        id: `pay-${p.id}`,
        date: p.ts,
        type: p.notes?.includes("Adjustment") ? "Adjustment" : "Payment",
        details: p.notes || `Payment (${p.method})`,
        amount_in: !isOut ? p.amount : 0,  // 'in' -> Increases Debt (e.g. Charge/Refund Reversed)
        amount_out: isOut ? p.amount : 0,  // 'out' -> Decreases Debt (We paid)
      });
    });
  }

  // Sort by Date Descending
  ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Compute Net Balance
  // Balance = Opening + Sum(In) - Sum(Out)
  const totalPurchases = ledger.reduce((sum, item) => sum + item.amount_in, 0);
  const totalPaid = ledger.reduce((sum, item) => sum + item.amount_out, 0);
  const currentBalance = (supplier.opening_balance || 0) + totalPurchases - totalPaid;

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
           <h1 className="page-title">{supplier.name}</h1>
           <p className="text-gray-500 text-sm">Supplier Ledger</p>
        </div>
        <Link href="/parties" className="btn btn-sm">
          ← Back
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100">
           <div className="text-gray-500 text-sm font-medium">Opening Balance</div>
           <div className="text-xl font-bold mt-1">₹{(supplier.opening_balance || 0).toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100">
           <div className="text-gray-500 text-sm font-medium">Total Billed (Credits)</div>
           <div className="text-xl font-bold mt-1 text-blue-600">+ ₹{totalPurchases.toLocaleString()}</div>
        </div>
         <div className="bg-white p-4 rounded-lg shadow border border-gray-100">
           <div className="text-gray-500 text-sm font-medium">Total Paid (Debits)</div>
           <div className="text-xl font-bold mt-1 text-green-600">- ₹{totalPaid.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-xl mt-4 border border-blue-100 flex justify-between items-center">
        <div>
            <div className="text-blue-800 font-semibold mb-1">Net Balance Due</div>
            <div className="text-3xl font-bold text-blue-900">₹{currentBalance.toLocaleString()}</div>
        </div>
        <Link href="/payments" className="btn bg-blue-600 text-white hover:bg-blue-700 border-none">
            Record Payment
        </Link>
      </div>

      <div className="card mt-6">
        <div className="card-body">
          <h2 className="section-title mb-4">Transaction History</h2>
          <table className="table w-full">
            <thead>
              <tr className="text-left border-b bg-gray-50">
                <th className="p-3">Date</th>
                <th className="p-3">Type</th>
                <th className="p-3">Details</th>
                <th className="p-3 text-right">Billed (+)</th>
                <th className="p-3 text-right">Paid (-)</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length ? (
                ledger.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-3">
                      {new Date(t.date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                            t.type === 'Purchase' ? 'bg-orange-100 text-orange-700' :
                            t.type === 'Payment' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                        }`}>
                            {t.type}
                        </span>
                    </td>
                    <td className="p-3 text-gray-700">{t.details}</td>
                    <td className="p-3 text-right font-medium text-orange-600">
                      {t.amount_in > 0 ? `₹${t.amount_in.toLocaleString()}` : "-"}
                    </td>
                    <td className="p-3 text-right font-medium text-green-600">
                      {t.amount_out > 0 ? `₹${t.amount_out.toLocaleString()}` : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
