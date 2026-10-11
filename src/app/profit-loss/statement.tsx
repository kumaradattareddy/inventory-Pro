"use client";

import React, { useCallback, useEffect, useState } from "react";

export type Period = "this-month" | "last-month" | "this-fy" | "last-fy" | "all" | "custom";
type Tab = "monthly" | "products" | "bills";

type Statement = {
  from: string;
  to: string;
  summary: {
    sales: number;
    discounts: number;
    netSales: number;
    cost: number;
    profit: number;
    margin: number;
    billCount: number;
    purchased: number;
    purchaseCount: number;
    customerCharges: { label: string; amount: number }[];
  };
  warnings: { missingCostLines: number; missingCostRevenue: number };
  months: { month: string; purchased: number; netSales: number; cost: number; profit: number; margin: number }[];
  products: { id: number; name: string; size: string | null; unit: string | null; qty: number; avgSellRate: number; avgBuyRate: number; revenue: number; cost: number; profit: number; margin: number; missingCost: boolean }[];
  bills: { billNo: string; date: string; customer: string; discount: number; netSales: number; cost: number; profit: number; margin: number; missingCost: boolean }[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1; // Indian FY: 1 Apr – 31 Mar
  switch (p) {
    case "this-month":
      return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
    case "last-month":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "this-fy":
      return { from: `${fyStart}-04-01`, to: ymd(now) };
    case "last-fy":
      return { from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` };
    default:
      return { from: "", to: "" };
  }
}

const fmt = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};
const fmtMonth = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};
const profitColor = (n: number) => (n > 0 ? "#059669" : n < 0 ? "#dc2626" : "#6b7280");

// The selected period is owned by the page so the balance cards below follow it too.
export type PeriodState = {
  period: Period;
  setPeriod: (p: Period) => void;
  customFrom: string;
  setCustomFrom: (d: string) => void;
  customTo: string;
  setCustomTo: (d: string) => void;
};

export function rangeOf(ps: Pick<PeriodState, "period" | "customFrom" | "customTo">) {
  return ps.period === "custom" ? { from: ps.customFrom, to: ps.customTo } : periodRange(ps.period);
}

export default function PLStatement({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }: PeriodState) {
  const [tab, setTab] = useState<Tab>("monthly");
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<"all" | "loss">("all");

  const range = rangeOf({ period, customFrom, customTo });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (range.from) qs.set("from", range.from);
      if (range.to) qs.set("to", range.to);
      const res = await fetch(`/api/profit-loss/statement?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  const periodBtn = (p: Period, label: string) => (
    <button
      key={p}
      onClick={() => setPeriod(p)}
      className={`btn btn-sm ${period === p ? "btn-primary" : "btn-secondary"}`}
      style={{ fontSize: 13, padding: "6px 12px" }}
    >
      {label}
    </button>
  );

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        padding: "10px 16px", fontSize: 14, fontWeight: 600, background: "none", border: "none",
        borderBottom: `2px solid ${tab === t ? "#2563eb" : "transparent"}`,
        color: tab === t ? "#2563eb" : "#6b7280", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const Kpi = ({ title, value, sub, color, bg }: { title: string; value: string; sub?: string; color: string; bg: string }) => (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, margin: 0 }}>
      <div className="card-body" style={{ padding: "14px 18px", background: bg }}>
        <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#111827", marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );

  const productsShown = (data?.products || []).filter((p) => productFilter === "all" || p.profit < 0);

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Period selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        {periodBtn("this-month", "This Month")}
        {periodBtn("last-month", "Last Month")}
        {periodBtn("this-fy", "This FY")}
        {periodBtn("last-fy", "Last FY")}
        {periodBtn("all", "All Time")}
        {periodBtn("custom", "Custom")}
        {period === "custom" && (
          <>
            <input type="date" className="form-input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 150, fontSize: 13 }} />
            <span style={{ color: "#9ca3af" }}>to</span>
            <input type="date" className="form-input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 150, fontSize: 13 }} />
          </>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280" }}>
          {range.from ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : "All time"}
          {s ? ` • ${s.billCount} bills` : ""}
        </span>
      </div>

      {error && <div className="card" style={{ padding: 16, color: "#991b1b", background: "#fef2f2" }}>Could not load profit: {error}</div>}
      {loading && !data && <div className="p-8 text-center text-gray-500">Calculating profit...</div>}

      {s && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
          {/* Purchased vs Sold in the period (simple totals, not matched item by item) */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Purchased vs Sold</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 20 }}>
            <Kpi title="Total Purchased" value={fmt(s.purchased)} sub={`${s.purchaseCount} purchase entries`} color="#ea580c" bg="#fff7ed" />
            <Kpi title="Total Sold" value={fmt(s.netSales)} sub={`${s.billCount} bills${s.discounts > 0 ? ` • after ${fmt(s.discounts)} discounts` : ""}`} color="#2563eb" bg="#eff6ff" />
            <Kpi
              title="Sold − Purchased"
              value={fmt(s.netSales - s.purchased)}
              sub={s.netSales >= s.purchased ? "Sold more than bought" : "Bought more than sold"}
              color={profitColor(s.netSales - s.purchased)}
              bg="#f9fafb"
            />
          </div>

          {/* Profit on items sold */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Profit on items sold</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <Kpi title="Sold For" value={fmt(s.netSales)} sub={s.discounts > 0 ? `After ${fmt(s.discounts)} discounts` : undefined} color="#2563eb" bg="#eff6ff" />
            <Kpi title="Bought For" value={fmt(s.cost)} sub="Purchase price of items sold" color="#7c3aed" bg="#faf5ff" />
            <Kpi
              title={s.profit >= 0 ? "Profit" : "Loss"}
              value={fmt(s.profit)}
              sub={`${pct(s.margin)} margin`}
              color={s.profit >= 0 ? "#059669" : "#dc2626"}
              bg={s.profit >= 0 ? "#ecfdf5" : "#fef2f2"}
            />
          </div>

          {data!.warnings.missingCostLines > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 13 }}>
              ⚠️ {data!.warnings.missingCostLines} sold item(s) worth {fmt(data!.warnings.missingCostRevenue)} have <b>no purchase price</b> recorded, so their profit can’t be worked out correctly.
              Look for “no purchase price” in the By Product tab.
            </div>
          )}

          {s.customerCharges.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
              Not counted in profit (customer pays these): {s.customerCharges.map((c) => `${c.label} ${fmt(c.amount)}`).join(" • ")}
            </div>
          )}

          {/* Breakdown tabs */}
          <div className="card mt-4">
            <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", overflowX: "auto" }}>
              {tabBtn("monthly", "By Month")}
              {tabBtn("products", "By Product")}
              {tabBtn("bills", "By Bill")}
            </div>
            <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
              {tab === "monthly" && (
                <table className="db-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="right">Purchased</th>
                      <th className="right">Sold For</th>
                      <th className="right">Bought For</th>
                      <th className="right">Profit</th>
                      <th className="right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data!.months].reverse().map((m) => (
                      <tr key={m.month}>
                        <td style={{ fontWeight: 600 }}>{fmtMonth(m.month)}</td>
                        <td className="right" style={{ color: "#ea580c" }}>{fmt(m.purchased)}</td>
                        <td className="right">{fmt(m.netSales)}</td>
                        <td className="right" style={{ color: "#6b7280" }}>{fmt(m.cost)}</td>
                        <td className="right" style={{ fontWeight: 800, color: profitColor(m.profit) }}>{fmt(m.profit)}</td>
                        <td className="right" style={{ color: profitColor(m.profit) }}>{pct(m.margin)}</td>
                      </tr>
                    ))}
                    {data!.months.length === 0 && <tr><td colSpan={6} className="text-center p-8 text-gray-400">No sales in this period</td></tr>}
                  </tbody>
                </table>
              )}

              {tab === "products" && (
                <>
                  <div style={{ padding: "10px 16px", display: "flex", gap: 8 }}>
                    <button className={`btn btn-sm ${productFilter === "all" ? "btn-primary" : "btn-secondary"}`} style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setProductFilter("all")}>All products</button>
                    <button className={`btn btn-sm ${productFilter === "loss" ? "btn-primary" : "btn-secondary"}`} style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setProductFilter("loss")}>
                      Sold below purchase price ({data!.products.filter((p) => p.profit < 0).length})
                    </button>
                  </div>
                  <table className="db-table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="right">Qty Sold</th>
                        <th className="right">Bought @</th>
                        <th className="right">Sold @</th>
                        <th className="right">Profit</th>
                        <th className="right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsShown.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              {[p.size, p.unit].filter(Boolean).join(" • ")}
                              {p.missingCost && <span style={{ marginLeft: 6, color: "#b45309", fontWeight: 700 }}>no purchase price</span>}
                            </div>
                          </td>
                          <td className="right" style={{ color: "#6b7280" }}>{p.qty.toLocaleString("en-IN")}</td>
                          <td className="right" style={{ color: "#6b7280" }}>{p.missingCost && p.avgBuyRate === 0 ? "—" : fmt(p.avgBuyRate)}</td>
                          <td className="right">{fmt(p.avgSellRate)}</td>
                          <td className="right" style={{ fontWeight: 700, color: profitColor(p.profit) }}>{fmt(p.profit)}</td>
                          <td className="right" style={{ color: profitColor(p.profit) }}>{pct(p.margin)}</td>
                        </tr>
                      ))}
                      {productsShown.length === 0 && <tr><td colSpan={6} className="text-center p-8 text-gray-400">No products to show</td></tr>}
                    </tbody>
                  </table>
                </>
              )}

              {tab === "bills" && (
                <table className="db-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bill</th>
                      <th>Customer</th>
                      <th className="right">Sold For</th>
                      <th className="right">Bought For</th>
                      <th className="right">Profit</th>
                      <th className="right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.bills.map((b) => (
                      <tr key={b.billNo}>
                        <td style={{ color: "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</td>
                        <td style={{ fontWeight: 600 }}>
                          {b.billNo}
                          {b.missingCost && <span style={{ marginLeft: 6, fontSize: 11, color: "#b45309", fontWeight: 700 }}>no purchase price</span>}
                        </td>
                        <td>{b.customer}</td>
                        <td className="right">
                          {fmt(b.netSales)}
                          {b.discount > 0 && <div style={{ fontSize: 11, color: "#9ca3af" }}>disc. {fmt(b.discount)}</div>}
                        </td>
                        <td className="right" style={{ color: "#6b7280" }}>{fmt(b.cost)}</td>
                        <td className="right" style={{ fontWeight: 700, color: profitColor(b.profit) }}>{fmt(b.profit)}</td>
                        <td className="right" style={{ color: profitColor(b.profit) }}>{pct(b.margin)}</td>
                      </tr>
                    ))}
                    {data!.bills.length === 0 && <tr><td colSpan={7} className="text-center p-8 text-gray-400">No bills in this period</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
