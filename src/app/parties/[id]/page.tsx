import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type LedgerItem = {
  id: string;
  date: string;
  type: "Purchase" | "Payment" | "Adjustment";
  details: string;
  amount_in: number;
  amount_out: number;
  running_balance?: number;
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

  // 2. Fetch Purchases (Stock Moves)
  const purchases = await fetchAll(
    supabase
      .from("stock_moves")
      .select("id, ts, qty, price_per_unit, products(name, unit)")
      .eq("supplier_id", supplierId)
      .eq("kind", "purchase")
      .order("ts", { ascending: true })
  );

  // 3. Fetch Payments & Adjustments
  const payments = await fetchAll(
    supabase
      .from("payments")
      .select("*")
      .eq("party_id", supplierId)
      .order("ts", { ascending: true })
  );

  // 4. Transform & Group
  const ledger: LedgerItem[] = [];

  // 4a. Find customer names for any bill_nos in payments
  const billNos = Array.from(new Set(
    (payments || [])
      .map(p => p.bill_no)
      .filter(Boolean)
  )) as string[];

  const billCustomerMap = new Map<string, string>();
  if (billNos.length > 0) {
    const { data: moveCustomers } = await supabase
      .from("stock_moves")
      .select("bill_no, customers(name)")
      .in("bill_no", billNos)
      .not("customers", "is", null);

    if (moveCustomers) {
      for (const m of moveCustomers) {
        if (m.bill_no && m.customers && (m.customers as any).name) {
          billCustomerMap.set(m.bill_no, (m.customers as any).name);
        }
      }
    }
  }

  // Group purchases by exact timestamp to form "Bills"
  if (purchases && purchases.length > 0) {
    const purchaseGroups = new Map<string, { total: number, itemsCount: number, firstItemId: string, items: string[] }>();
    
    purchases.forEach((p: any) => {
      const ts = p.ts;
      const total = (Number(p.qty) || 0) * (Number(p.price_per_unit) || 0);
      const productName = p.products?.name || "Unknown Item";
      const qtyStr = `${p.qty} ${p.products?.unit || ''}`.trim();
      
      if (!purchaseGroups.has(ts)) {
        purchaseGroups.set(ts, { total: 0, itemsCount: 0, firstItemId: p.id, items: [] });
      }
      
      const group = purchaseGroups.get(ts)!;
      group.total += total;
      group.itemsCount += 1;
      group.items.push(`${productName} (${qtyStr})`);
    });

    for (const [ts, group] of purchaseGroups.entries()) {
      ledger.push({
        id: `pur-${group.firstItemId}`,
        date: ts,
        type: "Purchase",
        details: group.items.join(", "),
        amount_in: group.total,
        amount_out: 0,
      });
    }
  }

  // Add payments and adjustments
  if (payments) {
    payments.forEach((p: any) => {
      const isOut = p.direction === "out";
      const isAdjustment = p.notes?.includes("[Adjustment]");
      
      let detailsStr = p.notes || `Payment (${p.method})`;
      if (!p.notes && p.bill_no) {
        const cName = billCustomerMap.get(p.bill_no);
        if (cName) {
          detailsStr = `Payout from Sale #${p.bill_no} (${cName}) (${p.method})`;
        } else {
          detailsStr = `Payout from Sale #${p.bill_no} (${p.method})`;
        }
      }

      ledger.push({
        id: `pay-${p.id}`,
        date: p.ts,
        type: isAdjustment ? "Adjustment" : "Payment",
        details: detailsStr,
        amount_in: !isOut ? Number(p.amount) : 0, // direction 'in' means we owe them more (e.g. debit adjustment) or refund
        amount_out: isOut ? Number(p.amount) : 0, // direction 'out' means we paid them (reduces debt)
      });
    });
  }

  // Sort chronological
  ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate running balance exactly
  let runningBal = Number(supplier.opening_balance) || 0;
  
  for (const item of ledger) {
    const rawRunning = runningBal + item.amount_in - item.amount_out;
    runningBal = Math.round(rawRunning * 100) / 100;
    item.running_balance = runningBal === -0 ? 0 : runningBal;
    
    // Round display amounts too
    item.amount_in = Math.round(item.amount_in * 100) / 100;
    item.amount_out = Math.round(item.amount_out * 100) / 100;
  }

  // Reverse sort for display (newest first)
  ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPurchases = ledger.reduce((sum, item) => sum + item.amount_in, 0);
  const totalPaid = ledger.reduce((sum, item) => sum + item.amount_out, 0);
  const currentBalance = runningBal;
  const isDue = currentBalance > 0;

  return (
    <div className="page" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/parties" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 10,
              background: "#f1f5f9", border: "1px solid #e2e8f0",
              color: "#64748b", textDecoration: "none", fontSize: 16,
              transition: "all 0.15s",
            }}>←</Link>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.02em" }}>
                {supplier.name}
              </h1>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: "2px 0 0", fontWeight: 500 }}>
                Supplier Ledger & Transactions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 24 }}>
        <div style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "16px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Opening Balance
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#334155", marginTop: 4 }}>
            ₹{(supplier.opening_balance || 0).toLocaleString("en-IN")}
          </div>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          border: "1px solid #bfdbfe",
          borderRadius: 12,
          padding: "16px 20px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Billed
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1d4ed8", marginTop: 4 }}>
            +₹{totalPurchases.toLocaleString("en-IN")}
          </div>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
          border: "1px solid #bbf7d0",
          borderRadius: 12,
          padding: "16px 20px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Paid
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#15803d", marginTop: 4 }}>
            −₹{totalPaid.toLocaleString("en-IN")}
          </div>
        </div>

        <div style={{
          background: isDue
            ? "linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)"
            : "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
          border: `1px solid ${isDue ? "#fecdd3" : "#bbf7d0"}`,
          borderRadius: 12,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
            color: isDue ? "#9f1239" : "#166534",
          }}>
            Net Balance
          </div>
          <div style={{
            fontSize: 22, fontWeight: 800, marginTop: 4,
            color: isDue ? "#be123c" : "#15803d",
          }}>
            ₹{currentBalance.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="card" style={{ overflow: "hidden", marginTop: 24 }}>
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid #f1f5f9",
          background: "#fafbfc",
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>
            Ledger History
          </h2>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
            {ledger.length} consolidated transaction{ledger.length !== 1 ? "s" : ""}
          </p>
        </div>

        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Date</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Details</th>
              <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Billed (+)</th>
              <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid (−)</th>
              <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length ? (
              ledger.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "16px 20px", fontSize: 13, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>
                    {new Date(t.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      background: t.type === 'Purchase' ? '#fff7ed' : t.type === 'Payment' ? '#f0fdf4' : '#f1f5f9',
                      color: t.type === 'Purchase' ? '#c2410c' : t.type === 'Payment' ? '#15803d' : '#475569',
                      border: `1px solid ${t.type === 'Purchase' ? '#fed7aa' : t.type === 'Payment' ? '#bbf7d0' : '#e2e8f0'}`,
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px", fontSize: 13, color: "#334155", fontWeight: 500 }}>
                    {t.details}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", fontSize: 14, fontWeight: 600, color: t.amount_in > 0 ? "#c2410c" : "#d1d5db" }}>
                    {t.amount_in > 0 ? `₹${t.amount_in.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", fontSize: 14, fontWeight: 600, color: t.amount_out > 0 ? "#15803d" : "#d1d5db" }}>
                    {t.amount_out > 0 ? `₹${t.amount_out.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                    ₹{(t.running_balance || 0).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ padding: 64, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
                  No transactions found for this supplier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
