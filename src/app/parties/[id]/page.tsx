import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Consolidated Type
type LedgerItem = {
  id: string;
  date: string;
  type: "Purchase" | "Payment" | "Adjustment";
  details: string;
  amount_in: number;
  amount_out: number;
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
    .eq("party_id", supplierId);

  // 4. Transform & Merge
  const ledger: LedgerItem[] = [];

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

  if (payments) {
    payments.forEach((p: any) => {
      const isOut = p.direction === "out";
      ledger.push({
        id: `pay-${p.id}`,
        date: p.ts,
        type: p.notes?.includes("Adjustment") ? "Adjustment" : "Payment",
        details: p.notes || `Payment (${p.method})`,
        amount_in: !isOut ? p.amount : 0,
        amount_out: isOut ? p.amount : 0,
      });
    });
  }

  ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPurchases = ledger.reduce((sum, item) => sum + item.amount_in, 0);
  const totalPaid = ledger.reduce((sum, item) => sum + item.amount_out, 0);
  const currentBalance = (supplier.opening_balance || 0) + totalPurchases - totalPaid;
  const isDue = currentBalance > 0;

  return (
    <div className="page" style={{ maxWidth: 1000, margin: "0 auto" }}>
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
                Supplier Ledger
              </p>
            </div>
          </div>
        </div>
        <Link href="/payments" style={{
          padding: "10px 20px",
          background: "#111827",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 10,
          textDecoration: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          Record Payment
        </Link>
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
            Transaction History
          </h2>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
            {ledger.length} transaction{ledger.length !== 1 ? "s" : ""}
          </p>
        </div>

        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Date</th>
              <th style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</th>
              <th style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Details</th>
              <th style={{ padding: "12px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Billed (+)</th>
              <th style={{ padding: "12px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid (−)</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length ? (
              ledger.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "14px 20px", fontSize: 13, color: "#64748b", fontWeight: 500 }}>
                    {new Date(t.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "3px 10px",
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
                  <td style={{ padding: "14px 20px", fontSize: 13, color: "#334155", fontWeight: 500 }}>
                    {t.details}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right", fontSize: 14, fontWeight: 600, color: t.amount_in > 0 ? "#c2410c" : "#d1d5db" }}>
                    {t.amount_in > 0 ? `₹${t.amount_in.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right", fontSize: 14, fontWeight: 600, color: t.amount_out > 0 ? "#15803d" : "#d1d5db" }}>
                    {t.amount_out > 0 ? `₹${t.amount_out.toLocaleString("en-IN")}` : "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
