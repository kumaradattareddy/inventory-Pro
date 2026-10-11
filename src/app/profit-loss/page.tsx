"use client";

import React from "react";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import PLStatement, { periodRange, rangeOf, type Period } from "./statement";

type ViewMode = "overview" | "payables" | "receivables" | "stock" | "payouts";

export default function ProfitLossPage() {
  const supabase = useMemo(() => createClient(), []);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [loading, setLoading] = useState(true);

  // Selected period — shared by the P&L statement and the balance cards
  const [period, setPeriod] = useState<Period>("this-month");
  const [customFrom, setCustomFrom] = useState(() => periodRange("this-month").from);
  const [customTo, setCustomTo] = useState(() => periodRange("this-month").to);
  const range = rangeOf({ period, customFrom, customTo });

  // Raw rows, loaded once; balances are recalculated when the period changes
  const [raw, setRaw] = useState<{
    customers: any[];
    suppliers: any[];
    products: any[];
    moves: any[];
    adjustments: any[];
    payments: any[];
  } | null>(null);

  // Action states
  const [activeAction, setActiveAction] = useState<{type: string, id: number} | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionMethod, setActionMethod] = useState("cash");
  const [actionNotes, setActionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Payout detail
  const [selectedPayout, setSelectedPayout] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Reads every row (Supabase returns at most 1000 per request)
      const fetchAll = async (build: (from: number, to: number) => any) => {
          const all: any[] = [];
          for (let page = 0; page < 100; page++) {
              const { data, error } = await build(page * 1000, page * 1000 + 999);
              if (error) throw error;
              all.push(...(data || []));
              if (!data || data.length < 1000) break;
          }
          return all;
      };

      const [customers, suppliers, products, moves, adjustments, payments] = await Promise.all([
          fetchAll((a, b) => supabase.from("customers").select("id, name, opening_balance").order("id").range(a, b)),
          fetchAll((a, b) => supabase.from("suppliers").select("id, name, opening_balance").order("id").range(a, b)),
          fetchAll((a, b) => supabase.from("products").select("id, name").order("id").range(a, b)),
          fetchAll((a, b) => supabase.from("stock_moves").select("id, kind, product_id, customer_id, supplier_id, qty, price_per_unit, ts, bill_date").order("id").range(a, b)),
          fetchAll((a, b) => supabase.from("bill_adjustments").select("id, customer_id, type, amount, created_at").order("id").range(a, b)),
          fetchAll((a, b) => supabase.from("payments").select("id, ts, party_type, direction, customer_id, party_id, other_name, amount, notes, bill_no, method").order("id").range(a, b)),
      ]);

      setRaw({ customers, suppliers, products, moves, adjustments, payments });
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Balances as at the end of the selected period; payouts within the period.
  const { customers, suppliers, stock, payoutsList, totals } = useMemo(() => {
    const empty = { customers: [] as any[], suppliers: [] as any[], stock: [] as any[], payoutsList: [] as any[], totals: { receivables: 0, payables: 0, stockValue: 0, totalPayouts: 0, billed: 0, received: 0, bought: 0, paid: 0, stockIn: 0, stockOut: 0 } };
    if (!raw) return empty;

    // UTC timestamp -> IST calendar day "YYYY-MM-DD"
    const istDay = (ts: string | null | undefined) => {
        if (!ts) return "0000-01-01";
        const d = new Date(ts);
        if (isNaN(d.getTime())) return "0000-01-01";
        return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
    };
    const moveDay = (m: any) => (m.bill_date ? String(m.bill_date).slice(0, 10) : istDay(m.ts));
    // Only activity inside the selected period counts. Opening balances are
    // included only for "All Time" (no start date).
    const allTime = !range.from;
    const upTo = (day: string) => !range.to || day <= range.to;
    const within = (day: string) => (allTime || day >= range.from) && upTo(day);
    const round = (n: number) => { const v = Math.round(n * 100) / 100; return v === 0 ? 0 : v; };

    // 1. CUSTOMERS (Receivables): billed (sales + charges − discounts) − payments received
    let billed = 0;
    let received = 0;
    const custMap: Record<number, { name: string; balance: number }> = {};
    raw.customers.forEach((c: any) => { custMap[c.id] = { name: c.name, balance: allTime ? Number(c.opening_balance) || 0 : 0 }; });
    raw.moves.forEach((m: any) => {
        if (m.kind !== "sale" || !custMap[m.customer_id] || !within(moveDay(m))) return;
        const v = (Number(m.qty) || 0) * (Number(m.price_per_unit) || 0);
        custMap[m.customer_id].balance += v;
        billed += v;
    });
    raw.adjustments.forEach((a: any) => {
        if (!custMap[a.customer_id] || !within(istDay(a.created_at))) return;
        const amt = Number(a.amount) || 0;
        const v = String(a.type).toLowerCase() === "discount" ? -amt : amt;
        custMap[a.customer_id].balance += v;
        billed += v;
    });
    raw.payments.forEach((p: any) => {
        if (p.party_type !== "customer" || p.direction !== "in" || !custMap[p.customer_id] || !within(istDay(p.ts))) return;
        const v = Number(p.amount) || 0;
        custMap[p.customer_id].balance -= v;
        received += v;
    });
    const customers = Object.entries(custMap)
        .map(([id, c]) => ({ id: Number(id), name: c.name, balance: round(c.balance) }))
        .filter((c) => c.balance !== 0)
        .sort((a, b) => b.balance - a.balance);

    // 2. SUPPLIERS (Payables): purchases − (payments out − payments in)
    let bought = 0;
    let paid = 0;
    const supMap: Record<number, { name: string; balance: number }> = {};
    raw.suppliers.forEach((s: any) => { supMap[s.id] = { name: s.name || "Unknown", balance: allTime ? Number(s.opening_balance) || 0 : 0 }; });
    raw.moves.forEach((m: any) => {
        if (m.kind !== "purchase" || !supMap[m.supplier_id] || !within(moveDay(m))) return;
        const v = (Number(m.qty) || 0) * (Number(m.price_per_unit) || 0);
        supMap[m.supplier_id].balance += v;
        bought += v;
    });
    raw.payments.forEach((p: any) => {
        if (p.party_type !== "supplier" || !supMap[p.party_id] || !within(istDay(p.ts))) return;
        const amt = Number(p.amount) || 0;
        const v = p.direction === "out" ? amt : -amt;
        supMap[p.party_id].balance -= v;
        paid += v;
    });
    const suppliers = Object.entries(supMap)
        .map(([id, s]) => ({ id: Number(id), name: s.name, balance: round(s.balance) }))
        .filter((s) => s.balance !== 0);

    // 3. STOCK: quantity added − quantity sold in the period, valued at the most
    //    common purchase price (mode) of purchases up to the period end
    const qtyMap: Record<number, number> = {};
    const qtyIn: Record<number, number> = {};
    const qtyOut: Record<number, number> = {};
    const priceFrequency: Record<number, Record<number, number>> = {};
    raw.moves.forEach((m: any) => {
        if (!m.product_id || !upTo(moveDay(m))) return;
        if (m.kind === "purchase" && m.price_per_unit) {
            const f = (priceFrequency[m.product_id] ||= {});
            f[m.price_per_unit] = (f[m.price_per_unit] || 0) + 1;
        }
        if (!within(moveDay(m))) return;
        const q = Number(m.qty) || 0;
        if (m.kind === "purchase" || m.kind === "adjustment_in") {
            qtyMap[m.product_id] = (qtyMap[m.product_id] || 0) + q;
            qtyIn[m.product_id] = (qtyIn[m.product_id] || 0) + q;
        } else if (m.kind === "sale" || m.kind === "adjustment_out") {
            qtyMap[m.product_id] = (qtyMap[m.product_id] || 0) - q;
            qtyOut[m.product_id] = (qtyOut[m.product_id] || 0) + q;
        }
    });
    const modePrice = (pid: number) => {
        let maxFreq = 0;
        let price = 0;
        for (const [priceStr, count] of Object.entries(priceFrequency[pid] || {})) {
            const priceNum = Number(priceStr);
            if (count > maxFreq || (count === maxFreq && priceNum > price)) {
                maxFreq = count;
                price = priceNum;
            }
        }
        return price;
    };
    const productName: Record<number, string> = {};
    raw.products.forEach((p: any) => { productName[p.id] = p.name; });
    let stockIn = 0;
    let stockOut = 0;
    const stock = Object.entries(qtyMap)
        // All Time = stock on hand today; a period = net change (can be negative)
        .filter(([, q]) => (allTime ? q > 0 : q !== 0))
        .map(([id, q]) => {
            const pid = Number(id);
            const price = modePrice(pid);
            return { id: pid, name: productName[pid] || `#${pid}`, current_stock: round(q), price, totalValue: round(q * price) };
        })
        .sort((a, b) => b.totalValue - a.totalValue);
    Object.keys(qtyMap).forEach((id) => {
        const price = modePrice(Number(id));
        stockIn += (qtyIn[Number(id)] || 0) * price;
        stockOut += (qtyOut[Number(id)] || 0) * price;
    });

    // 4. PAYOUTS made within the period
    const payoutsList = raw.payments
        .filter((p: any) => p.party_type === "others" && p.direction === "out" && within(istDay(p.ts)))
        .map((p: any) => ({
            id: p.id,
            created_at: p.ts,
            other_name: p.other_name || "Unknown",
            amount: Number(p.amount) || 0,
            notes: p.notes,
            bill_no: p.bill_no,
            method: p.method
        }))
        .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));

    return {
        customers,
        suppliers,
        stock,
        payoutsList,
        totals: {
            // All Time: what is outstanding today. A period: net of that period's activity.
            receivables: allTime
                ? customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0)
                : billed - received,
            payables: allTime
                ? suppliers.reduce((sum, s) => sum + (s.balance > 0 ? s.balance : 0), 0)
                : bought - paid,
            stockValue: stock.reduce((sum, s) => sum + s.totalValue, 0),
            totalPayouts: payoutsList.reduce((sum: number, p: any) => sum + p.amount, 0),
            billed, received, bought, paid, stockIn, stockOut,
        },
    };
  }, [raw, range.from, range.to]);

  /* ---- Action Handlers ---- */
  const resetAction = () => {
    setActiveAction(null);
    setActionAmount("");
    setActionMethod("cash");
    setActionNotes("");
  };

  const handleSupplierPayment = async (supplierId: number, isAdjustment: boolean) => {
    if (!actionAmount || Number(actionAmount) <= 0) return alert("Please enter a valid amount");
    setSaving(true);
    try {
      const res = await fetch('/api/profit-loss/supplier-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          amount: Number(actionAmount),
          method: actionMethod,
          notes: actionNotes,
          isAdjustment,
        }),
      });
      if (res.ok) {
        alert("✅ Recorded successfully!");
        resetAction();
        fetchData();
      } else {
        const data = await res.json();
        alert("❌ Error: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("❌ Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleCustomerPayment = async (customerId: number) => {
    if (!actionAmount || Number(actionAmount) <= 0) return alert("Please enter a valid amount");
    setSaving(true);
    try {
      const res = await fetch('/api/profit-loss/customer-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          amount: Number(actionAmount),
          method: actionMethod,
          notes: actionNotes,
        }),
      });
      if (res.ok) {
        alert("✅ Payment recorded!");
        resetAction();
        fetchData();
      } else {
        const data = await res.json();
        alert("❌ Error: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("❌ Network error");
    } finally {
      setSaving(false);
    }
  };

  const isNumeric = (v: string) => v === "" || /^\d*\.?\d*$/.test(v);

  const fmt = (n: number) => `${Math.round(n) < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  };
  // e.g. "1 Sep – 30 Sep 2026"; All Time shows today's outstanding balances
  const periodLabel = range.from ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : "All time";
  const asOnLabel = range.from ? `• ${periodLabel}` : "as on today";
  const periodBreakdown = (a: string, x: number, b: string, y: number) =>
    range.from ? `${a} ${fmt(x)} − ${b} ${fmt(y)}` : null;

  if (loading) {
     return <div className="page p-8 text-center text-gray-500">Loading analysis...</div>;
  }

  // --- Inline action form ---
  const ActionForm = ({ id, type, onSubmit }: { id: number; type: string; onSubmit: () => void }) => {
    if (!activeAction || activeAction.id !== id || activeAction.type !== type) return null;
    const isAdj = type === "adjustment";
    return (
      <div style={{
        padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <input
          type="text"
          className="form-input"
          placeholder="Amount"
          value={actionAmount}
          onChange={e => isNumeric(e.target.value) && setActionAmount(e.target.value)}
          style={{ width: 120, fontSize: 14 }}
          autoFocus
        />
        <select className="form-select" value={actionMethod} onChange={e => setActionMethod(e.target.value)} style={{ width: 100, fontSize: 14 }}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="cheque">Cheque</option>
        </select>
        {isAdj && (
          <input
            type="text"
            className="form-input"
            placeholder="Note (e.g., Goods returned)"
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            style={{ flex: 1, minWidth: 150, fontSize: 14 }}
          />
        )}
        <button
          className="btn btn-primary btn-sm"
          onClick={onSubmit}
          disabled={saving}
          style={{ fontSize: 13, padding: '6px 14px' }}
        >
          {saving ? "Saving..." : isAdj ? "Save Adjustment" : "Save Payment"}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={resetAction} style={{ fontSize: 13, padding: '6px 14px' }}>
          Cancel
        </button>
      </div>
    );
  };

  // --- VIEW: PAYABLES ---
  if (viewMode === "payables") {
      const sortedSuppliers = [...suppliers].sort((a, b) => b.balance - a.balance);
      return (
        <div className="page">
            <div className="page-header flex gap-4 items-center">
                <button onClick={() => { setViewMode("overview"); resetAction(); }} className="btn-icon">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="page-title" style={{ margin: 0 }}>Total Payables</h1>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Owed to Suppliers • Record payments & adjustments</p>
                </div>
            </div>
            <div className="card mt-4" style={{ borderLeft: '4px solid #dc2626' }}>
              <div className="card-body" style={{ padding: '16px 20px', background: '#fef2f2' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding {asOnLabel}</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>{fmt(totals.payables)}</div>
              </div>
            </div>
            <div className="card mt-4">
              <div className="card-body" style={{ padding: 0 }}>
                <table className="db-table" style={{ marginBottom: 0 }}>
                    <thead>
                        <tr>
                            <th>Supplier</th>
                            <th className="right">Balance</th>
                            <th style={{ width: 220, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedSuppliers.map(s => (
                          <React.Fragment key={s.id}>
                            <tr>
                                <td style={{ fontWeight: 600 }}>{s.name}</td>
                                <td className="right" style={{ fontWeight: 700, color: s.balance > 0 ? '#dc2626' : '#16a34a' }}>
                                  {fmt(s.balance)}
                                </td>
                                <td className="right">
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button
                                      className="btn btn-primary btn-sm"
                                      style={{ fontSize: 12, padding: '4px 10px' }}
                                      onClick={() => { resetAction(); setActiveAction({ type: 'payment', id: s.id }); }}
                                    >
                                      💰 Pay
                                    </button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: 12, padding: '4px 10px' }}
                                      onClick={() => { resetAction(); setActiveAction({ type: 'adjustment', id: s.id }); }}
                                    >
                                      ✏️ Adjust
                                    </button>
                                  </div>
                                </td>
                            </tr>
                            <tr key={`action-${s.id}`} style={{ display: activeAction?.id === s.id ? 'table-row' : 'none' }}>
                              <td colSpan={3} style={{ padding: 0 }}>
                                <ActionForm 
                                  id={s.id} 
                                  type={activeAction?.type || 'payment'} 
                                  onSubmit={() => handleSupplierPayment(s.id, activeAction?.type === 'adjustment')} 
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                    </tbody>
                </table>
              </div>
            </div>
        </div>
      );
  }

  // --- VIEW: RECEIVABLES ---
  if (viewMode === "receivables") {
    const debtors = customers.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance);
    return (
      <div className="page">
          <div className="page-header flex gap-4 items-center">
              <button onClick={() => { setViewMode("overview"); resetAction(); }} className="btn-icon">
                  <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="page-title" style={{ margin: 0 }}>Total Receivables</h1>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Pending from Customers • Record payments</p>
              </div>
          </div>
          <div className="card mt-4" style={{ borderLeft: '4px solid #2563eb' }}>
            <div className="card-body" style={{ padding: '16px 20px', background: '#eff6ff' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Receivable {asOnLabel}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>{fmt(totals.receivables)}</div>
            </div>
          </div>
          <div className="card mt-4">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="db-table" style={{ marginBottom: 0 }}>
                  <thead>
                      <tr>
                          <th>Customer</th>
                          <th className="right">Balance Due</th>
                          <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                      {debtors.map(c => (
                        <React.Fragment key={c.id}>
                          <tr>
                              <td style={{ fontWeight: 600 }}>{c.name}</td>
                              <td className="right" style={{ fontWeight: 700, color: '#2563eb' }}>{fmt(c.balance)}</td>
                              <td className="right">
                                <button
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: 12, padding: '4px 10px' }}
                                  onClick={() => { resetAction(); setActiveAction({ type: 'payment', id: c.id }); }}
                                >
                                  💰 Record Payment
                                </button>
                              </td>
                          </tr>
                          <tr key={`action-${c.id}`} style={{ display: activeAction?.id === c.id ? 'table-row' : 'none' }}>
                            <td colSpan={3} style={{ padding: 0 }}>
                              <ActionForm 
                                id={c.id} 
                                type="payment" 
                                onSubmit={() => handleCustomerPayment(c.id)} 
                              />
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                      {debtors.length === 0 && <tr><td colSpan={3} className="text-center p-8 text-gray-400">No pending receivables</td></tr>}
                  </tbody>
              </table>
            </div>
          </div>
      </div>
    );
  }

  // --- VIEW: STOCK ---
  if (viewMode === "stock") {
    return (
      <div className="page">
          <div className="page-header flex gap-4 items-center">
              <button onClick={() => setViewMode("overview")} className="btn-icon">
                  <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="page-title" style={{ margin: 0 }}>Stock Valuation</h1>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Current inventory worth by most common purchase cost</p>
              </div>
          </div>
          <div className="card mt-4" style={{ borderLeft: '4px solid #9333ea' }}>
            <div className="card-body" style={{ padding: '16px 20px', background: '#faf5ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stock Value {asOnLabel}</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>{fmt(totals.stockValue)}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{stock.length} products in stock</div>
              </div>
            </div>
          </div>
          <div className="card mt-4">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="db-table" style={{ marginBottom: 0 }}>
                  <thead>
                      <tr>
                          <th>Product</th>
                          <th className="right">Qty</th>
                          <th className="right">Cost/Unit</th>
                          <th className="right">Total Value</th>
                      </tr>
                  </thead>
                  <tbody>
                      {stock.map(s => (
                          <tr key={s.id}>
                              <td style={{ fontWeight: 600 }}>{s.name}</td>
                              <td className="right" style={{ color: '#6b7280' }}>{s.current_stock}</td>
                              <td className="right" style={{ color: '#9ca3af' }}>{fmt(s.price)}</td>
                              <td className="right" style={{ fontWeight: 700, color: '#7c3aed' }}>{fmt(s.totalValue)}</td>
                          </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#faf5ff', borderTop: '2px solid #e9d5ff' }}>
                      <td colSpan={3} style={{ fontWeight: 800, textAlign: 'right', padding: '12px 16px' }}>Grand Total</td>
                      <td className="right" style={{ fontWeight: 900, color: '#7c3aed', fontSize: 16, padding: '12px 16px' }}>{fmt(totals.stockValue)}</td>
                    </tr>
                  </tfoot>
              </table>
            </div>
          </div>
      </div>
    );
  }

  // --- VIEW: PAYOUTS ---
  if (viewMode === "payouts") {
    // Group payouts by recipient
    const groups: Record<string, { name: string; total: number; count: number; items: any[] }> = {};
    payoutsList.forEach(p => {
      const name = p.other_name;
      if (!groups[name]) groups[name] = { name, total: 0, count: 0, items: [] };
      groups[name].total += p.amount;
      groups[name].count += 1;
      groups[name].items.push(p);
    });
    const groupedList = Object.values(groups).sort((a, b) => b.total - a.total);

    // Detail view for a selected recipient
    if (selectedPayout) {
      return (
        <div className="page">
          <div className="page-header flex gap-4 items-center">
            <button onClick={() => setSelectedPayout(null)} className="btn-icon">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>{selectedPayout.name}</h1>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Payout History • {selectedPayout.count} transactions</p>
            </div>
          </div>
          <div className="card mt-4" style={{ borderLeft: '4px solid #ea580c' }}>
            <div className="card-body" style={{ padding: '16px 20px', background: '#fff7ed' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Paid</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>{fmt(selectedPayout.total)}</div>
            </div>
          </div>
          <div className="card mt-4">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="db-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Details</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPayout.items.map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fmtDate(p.created_at)}</div>
                      </td>
                      <td>
                        <div style={{ color: '#374151' }}>{p.notes || "Payout"}</div>
                        {p.bill_no && <div style={{ fontSize: 11, color: '#9ca3af' }}>Ref Bill: {p.bill_no}</div>}
                        {p.method && <span style={{ fontSize: 10, textTransform: 'uppercase', border: '1px solid #e5e7eb', padding: '1px 6px', borderRadius: 4, color: '#9ca3af' }}>{p.method}</span>}
                      </td>
                      <td className="right" style={{ fontWeight: 700, color: '#ea580c' }}>{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="page">
        <div className="page-header flex gap-4 items-center">
          <button onClick={() => setViewMode("overview")} className="btn-icon">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>All Payouts</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Money paid to non-supplier recipients</p>
          </div>
        </div>
        <div className="card mt-4" style={{ borderLeft: '4px solid #ea580c' }}>
          <div className="card-body" style={{ padding: '16px 20px', background: '#fff7ed' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Payouts • {periodLabel}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>{fmt(totals.totalPayouts)}</div>
          </div>
        </div>
        <div className="card mt-4">
          <div className="card-body" style={{ padding: 0 }}>
            <table className="db-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th className="right">Transactions</th>
                  <th className="right">Total Amount</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {groupedList.map(g => (
                  <tr key={g.name} onClick={() => setSelectedPayout(g)} style={{ cursor: 'pointer' }} className="hover:bg-gray-50">
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td className="right" style={{ color: '#6b7280' }}>{g.count}</td>
                    <td className="right" style={{ fontWeight: 700, color: '#ea580c' }}>{fmt(g.total)}</td>
                    <td style={{ color: '#d1d5db', textAlign: 'right' }}>→</td>
                  </tr>
                ))}
                {groupedList.length === 0 && <tr><td colSpan={4} className="text-center p-8 text-gray-400">No payouts found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: OVERVIEW (DASHBOARD) ---
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Profit & Loss</h1>
      </div>

      <PLStatement
        period={period}
        setPeriod={setPeriod}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
      />

      <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: "8px 0 12px" }}>Balances</h2>
      <div className="pl-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {/* Card 1: Payables */}
        <div className="pl-card payables">
           <div className="pl-card-content">
                <div className="pl-icon-wrapper">
                    <svg style={{ width: 24, height: 24 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
                        <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V9.75Z" clipRule="evenodd" />
                        <path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" />
                    </svg>
                </div>
                <h3 className="pl-card-title">Total Payables</h3>
                <div className="pl-card-value" style={{ color: '#dc2626' }}>{fmt(Math.abs(totals.payables))}</div>
                <div className="pl-card-subtitle">Owed to Suppliers {asOnLabel}</div>
                {periodBreakdown("Bought", totals.bought, "Paid", totals.paid) && (
                  <div className="pl-card-subtitle" style={{ fontSize: 12 }}>{periodBreakdown("Bought", totals.bought, "Paid", totals.paid)}</div>
                )}
           </div>
           <div className="pl-card-footer">
                <button onClick={() => setViewMode("payables")} className="pl-action-btn">
                    View & Pay <span>→</span>
                </button>
           </div>
        </div>

        {/* Card 2: Receivables */}
        <div className="pl-card receivables">
           <div className="pl-card-content">
                <div className="pl-icon-wrapper">
                    <svg style={{ width: 24, height: 24 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
                        <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" />
                    </svg>
                </div>
                <h3 className="pl-card-title">Total Receivables</h3>
                <div className="pl-card-value" style={{ color: '#16a34a' }}>{fmt(Math.abs(totals.receivables))}</div>
                <div className="pl-card-subtitle">Pending from Customers {asOnLabel}</div>
                {periodBreakdown("Billed", totals.billed, "Received", totals.received) && (
                  <div className="pl-card-subtitle" style={{ fontSize: 12 }}>{periodBreakdown("Billed", totals.billed, "Received", totals.received)}</div>
                )}
           </div>
           <div className="pl-card-footer">
                <button onClick={() => setViewMode("receivables")} className="pl-action-btn">
                    View & Collect <span>→</span>
                </button>
           </div>
        </div>

        {/* Card 3: Stock Value */}
        <div className="pl-card stock">
           <div className="pl-card-content">
                <div className="pl-icon-wrapper">
                    <svg style={{ width: 24, height: 24 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 0 0 4.25 22.5h15.5a1.875 1.875 0 0 0 1.865-2.071l-1.263-12a1.875 1.875 0 0 0-1.865-1.679H16.5V6a4.5 4.5 0 1 0-9 0ZM12 3a3 3 0 0 0-3 3v.75h6V6a3 3 0 0 0-3-3Zm-3 8.25a3 3 0 1 0 6 0v-.75a.75.75 0 0 1 1.5 0v.75a4.5 4.5 0 1 1-9 0v-.75a.75.75 0 0 1 1.5 0v.75Z" clipRule="evenodd" />
                    </svg>
                </div>
                <h3 className="pl-card-title">{range.from ? "Stock Added (Net)" : "Total Stock Value"}</h3>
                <div className="pl-card-value">{fmt(totals.stockValue)}</div>
                <div className="pl-card-subtitle">{range.from ? `Inventory change ${asOnLabel}` : `Inventory Worth ${asOnLabel}`}</div>
                {periodBreakdown("Added", totals.stockIn, "Sold", totals.stockOut) && (
                  <div className="pl-card-subtitle" style={{ fontSize: 12 }}>{periodBreakdown("Added", totals.stockIn, "Sold", totals.stockOut)}</div>
                )}
           </div>
           <div className="pl-card-footer">
                <button onClick={() => setViewMode("stock")} className="pl-action-btn">
                    View Details <span>→</span>
                </button>
           </div>
        </div>

        {/* Card 4: Payouts */}
        <div className="pl-card" style={{ borderLeft: '6px solid #ea580c' }}>
           <div className="pl-card-content">
                <div className="pl-icon-wrapper" style={{ background: '#fff7ed', color: '#ea580c' }}>
                    <svg style={{ width: 24, height: 24 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                </div>
                <h3 className="pl-card-title">Total Payouts</h3>
                <div className="pl-card-value">{fmt(totals.totalPayouts)}</div>
                <div className="pl-card-subtitle">Paid to Others • {periodLabel}</div>
           </div>
           <div className="pl-card-footer">
                <button 
                  onClick={() => setViewMode("payouts")}
                  className="pl-action-btn"
                  style={{ color: '#ea580c' }}
                >
                    View Details <span>→</span>
                </button>
           </div>
        </div>
      </div>
    </div>
  );
}
