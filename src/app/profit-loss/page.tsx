"use client";

import React from "react";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

type ViewMode = "overview" | "payables" | "receivables" | "stock" | "executives" | "payouts";

export default function ProfitLossPage() {
  const supabase = useMemo(() => createClient(), []);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [loading, setLoading] = useState(true);

  // Raw Data
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [executives, setExecutives] = useState<{name: string, sales: number, bills: any[]}[]>([]);
  const [payoutsList, setPayoutsList] = useState<any[]>([]);

  // Computed Totals
  const [totals, setTotals] = useState({
    receivables: 0,
    payables: 0,
    stockValue: 0,
    topExecName: "—",
    topExecSales: 0,
    totalPayouts: 0,
  });

  // Action states
  const [activeAction, setActiveAction] = useState<{type: string, id: number} | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionMethod, setActionMethod] = useState("cash");
  const [actionNotes, setActionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Payout detail
  const [selectedPayout, setSelectedPayout] = useState<any>(null);
  const [selectedExecutive, setSelectedExecutive] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. CUSTOMERS (Receivables)
      const { data: custData } = await supabase
        .from("customer_totals")
        .select("id, name, balance")
        .order("balance", { ascending: false });

      const rawCust = custData || [];
      const cleanCust = rawCust.map((c: any) => {
           const bal = Number(c.balance) || 0;
           return {
               ...c,
               balance: Math.round(bal * 100) / 100 === -0 ? 0 : Math.round(bal * 100) / 100
           };
      });
      setCustomers(cleanCust);

      // 2. SUPPLIERS (Payables)
      const { data: supTx } = await supabase
        .from("supplier_transactions" as any)
        .select("supplier_id, supplier_name, total_amount");

      const supMap: Record<number, { name: string; balance: number }> = {};
      (supTx || []).forEach((tx: any) => {
          const id = tx.supplier_id;
          const amt = Number(tx.total_amount) || 0;
          if (!supMap[id]) {
              supMap[id] = { name: tx.supplier_name, balance: 0 };
          }
          supMap[id].balance += amt;
      });

      const supList = Object.entries(supMap).map(([id, val]) => {
          const bal = Math.round(val.balance * 100) / 100;
          return {
              id: Number(id),
              name: val.name,
              balance: bal === -0 ? 0 : bal
          };
      });
      setSuppliers(supList);

      // 3. STOCK VALUE (Mode Price Logic)
      const { data: stockData } = await supabase
        .from("product_stock_live" as any)
        .select("id, name, current_stock")
        .gt("current_stock", 0);

      const liveStock = (stockData || []) as any[];
      let processedStock: any[] = [];
      
      if (liveStock.length > 0) {
          const productIds = liveStock.map(s => s.id);
          const { data: moves } = await supabase
              .from("stock_moves")
              .select("product_id, price_per_unit")
              .eq("kind", "purchase")
              .in("product_id", productIds);

          const priceFrequency: Record<number, Record<number, number>> = {};
          (moves || []).forEach((m: any) => {
              if (!m.product_id || !m.price_per_unit) return;
              if (!priceFrequency[m.product_id]) priceFrequency[m.product_id] = {};
              const p = m.price_per_unit;
              priceFrequency[m.product_id][p] = (priceFrequency[m.product_id][p] || 0) + 1;
          });

          const priceMap: Record<number, number> = {};
          for (const pid of productIds) {
              const freqs = priceFrequency[pid];
              if (!freqs) {
                  priceMap[pid] = 0;
                  continue;
              }
              let maxFreq = 0;
              let modePrice = 0;
              for (const [priceStr, count] of Object.entries(freqs)) {
                  const countNum = count as number; 
                  const priceNum = Number(priceStr);
                  if (countNum > maxFreq || (countNum === maxFreq && priceNum > modePrice)) {
                      maxFreq = countNum;
                      modePrice = priceNum;
                  }
              }
              priceMap[pid] = modePrice;
          }

          processedStock = liveStock.map(item => {
              const price = priceMap[item.id] || 0;
              const totalValue = Math.round((Number(item.current_stock) * price) * 100) / 100;
              return {
                  ...item,
                  price: price,
                  totalValue: totalValue === -0 ? 0 : totalValue
              };
          }).sort((a, b) => b.totalValue - a.totalValue);
      }
      setStock(processedStock);

      // 4. EXECUTIVE SALES
      const [ledgerResult, adjResult, paymentsResult, customersResult] = await Promise.all([
          supabase.from("bill_transaction_ledger").select("*"),
          supabase.from("bill_adjustments").select("bill_no, details, type").ilike("type", "executive"),
          supabase.from("payments").select("bill_no, amount, direction").eq("party_type", "customer").not("bill_no", "is", null),
          supabase.from("customers").select("id, name")
      ]);

      const ledgerData = ledgerResult.data || [];
      const adjustmentData = adjResult.data || [];
      const paymentsData = paymentsResult.data || [];
      const customersData = customersResult.data || [];

      const customerMap: Record<number, string> = {};
      customersData.forEach((c: any) => customerMap[c.id] = c.name);

      const billPayments: Record<string, number> = {};
      paymentsData.forEach((p: any) => {
          if (p.bill_no && p.direction === "in") {
              billPayments[p.bill_no] = (billPayments[p.bill_no] || 0) + Number(p.amount);
          }
      });

      const execMap: Record<string, { total: number, bills: any[] }> = {};
      const billSales: Record<string, { total: number, customerId: number | null, date: string | null }> = {};
      const billExecs: Record<string, Set<string>> = {};

      adjustmentData.forEach((row: any) => {
          const billNo = row.bill_no ? String(row.bill_no).trim() : "—";
          const execName = row.details ? String(row.details).trim() : "";
          if (billNo !== "—" && execName) {
              if (!billExecs[billNo]) billExecs[billNo] = new Set();
              billExecs[billNo].add(execName);
          }
      });

      ledgerData.forEach((row: any) => {
           const billNo = row.bill_no ? String(row.bill_no).trim() : "—";
           if (billNo === "—") return;
           const t = row.type || "";
           if (["Sale", "Charge", "Discount"].includes(t)) {
               if (!billSales[billNo]) billSales[billNo] = { total: 0, customerId: row.customer_id, date: row.date };
               const amt = Number(row.amount) || 0;
               billSales[billNo].total += amt;
           }
      });

      Object.keys(billSales).forEach(billNo => {
           const { total: sales, customerId, date } = billSales[billNo];
           if (sales <= 0) return;
           const execs = billExecs[billNo];
           if (execs && execs.size > 0) {
               execs.forEach(execName => {
                   if (!execMap[execName]) execMap[execName] = { total: 0, bills: [] };
                   
                   const paid = billPayments[billNo] || 0;
                   const customerName = customerId && customerMap[customerId] ? customerMap[customerId] : "Unknown";
                   
                   execMap[execName].total += sales;
                   execMap[execName].bills.push({ 
                       billNo, 
                       amount: sales,
                       paid: paid,
                       customerName,
                       date
                   });
               });
           }
      });

      const execList = Object.entries(execMap)
          .map(([name, data]) => {
              const roundedSales = Math.round(data.total * 100) / 100;
              return { name, sales: roundedSales === -0 ? 0 : roundedSales, bills: data.bills };
          })
          .sort((a, b) => b.sales - a.sales);
      setExecutives(execList);

      // 5. PAYOUTS
      const { data: payoutsData } = await supabase
        .from("payments")
        .select("id, ts, other_name, amount, notes, bill_no, method")
        .eq("party_type", "others")
        .eq("direction", "out")
        .order("ts", { ascending: false });

      const payouts = (payoutsData || []).map((p: any) => ({
        id: p.id,
        created_at: p.ts,
        other_name: p.other_name || "Unknown",
        amount: Number(p.amount) || 0,
        notes: p.notes,
        bill_no: p.bill_no,
        method: p.method
      }));
      setPayoutsList(payouts);

      // 6. COMPUTE GRAND TOTALS
      const totalPayoutsVal = payouts.reduce((sum: number, p: any) => sum + p.amount, 0);
      setTotals({
          receivables: cleanCust.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0),
          payables: supList.reduce((sum, s) => sum + (s.balance || 0), 0),
          stockValue: processedStock.reduce((sum, s) => sum + s.totalValue, 0),
          topExecName: execList.length > 0 ? execList[0].name : "—",
          topExecSales: execList.length > 0 ? execList[0].sales : 0,
          totalPayouts: totalPayoutsVal,
      });

    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  };

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
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Receivable</div>
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
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stock Value</div>
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

  // --- VIEW: EXECUTIVES ---
  if (viewMode === "executives") {
    if (selectedExecutive) {
      return (
        <div className="page">
          <div className="page-header flex gap-4 items-center">
            <button onClick={() => setSelectedExecutive(null)} className="btn-icon">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>{selectedExecutive.name}</h1>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Sales History • {selectedExecutive.bills.length} bills generated</p>
            </div>
          </div>
          <div className="card mt-4" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="card-body" style={{ padding: '16px 20px', background: '#ecfdf5' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Sales</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>{fmt(selectedExecutive.sales)}</div>
            </div>
          </div>
          <div className="card mt-4">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="db-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bill Number</th>
                    <th>Customer Name</th>
                    <th className="right">Sale Amount</th>
                    <th className="right">Paid</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedExecutive.bills.map((b: any, i: number) => {
                    const isPaid = b.paid >= b.amount;
                    const isPartial = b.paid > 0 && b.paid < b.amount;
                    return (
                      <tr key={i}>
                        <td style={{ color: '#6b7280', fontSize: 13 }}>{b.date ? fmtDate(b.date) : "—"}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#374151' }}>{b.billNo}</div>
                        </td>
                        <td style={{ fontWeight: 500 }}>{b.customerName}</td>
                        <td className="right" style={{ fontWeight: 700, color: '#059669' }}>{fmt(b.amount)}</td>
                        <td className="right" style={{ color: isPaid ? '#059669' : '#6b7280' }}>{fmt(b.paid)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                            background: isPaid ? '#dcfce7' : isPartial ? '#fef9c3' : '#fee2e2',
                            color: isPaid ? '#166534' : isPartial ? '#854d0e' : '#991b1b',
                            border: `1px solid ${isPaid ? '#bbf7d0' : isPartial ? '#fef08a' : '#fecaca'}`
                          }}>
                            {isPaid ? "Paid" : isPartial ? "Partial" : "Unpaid"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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
                <h1 className="page-title" style={{ margin: 0 }}>Executive Sales Performance</h1>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>Total sales generated by each executive</p>
              </div>
          </div>
          <div className="card mt-4">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="db-table" style={{ marginBottom: 0 }}>
                  <thead>
                      <tr>
                          <th>Executive</th>
                          <th className="right">Total Sales</th>
                      </tr>
                  </thead>
                  <tbody>
                      {executives.map((e, idx) => (
                          <tr key={idx} onClick={() => setSelectedExecutive(e)} style={{ cursor: 'pointer' }} className="hover:bg-gray-50">
                              <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: idx === 0 ? '#fef3c7' : '#ecfdf5',
                                        color: idx === 0 ? '#92400e' : '#065f46',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: 12,
                                        border: `1px solid ${idx === 0 ? '#fde68a' : '#a7f3d0'}`,
                                      }}>{idx + 1}</div>
                                      <span style={{ fontWeight: 600 }}>{e.name}</span>
                                      {idx === 0 && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 700, border: '1px solid #fde68a' }}>Top Performer</span>}
                                  </div>
                              </td>
                              <td className="right" style={{ fontWeight: 700, color: '#059669' }}>{fmt(e.sales)}</td>
                          </tr>
                      ))}
                      {executives.length === 0 && <tr><td colSpan={2} className="text-center p-8 text-gray-400">No sales records found</td></tr>}
                  </tbody>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Payouts</div>
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
        <h1 className="page-title">Profit & Loss Overview</h1>
      </div>

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
                <div className="pl-card-value">{fmt(totals.payables)}</div>
                <div className="pl-card-subtitle">Owed to Suppliers</div>
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
                <div className="pl-card-value">{fmt(totals.receivables)}</div>
                <div className="pl-card-subtitle">Pending from Customers</div>
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
                <h3 className="pl-card-title">Total Stock Value</h3>
                <div className="pl-card-value">{fmt(totals.stockValue)}</div>
                <div className="pl-card-subtitle">Current Inventory Worth</div>
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
                <div className="pl-card-subtitle">Paid to Others (All Time)</div>
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

        {/* Card 5: Top Executive */}
        <div className="pl-card" style={{ borderLeft: '6px solid #10b981' }}>
           <div className="pl-card-content">
                <div className="pl-icon-wrapper" style={{ background: '#ecfdf5', color: '#059669' }}>
                    <svg style={{ width: 24, height: 24 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                    </svg>
                </div>
                <h3 className="pl-card-title">Top Sales Exec</h3>
                <div className="pl-card-value" style={{ fontSize: '24px' }}>
                    {totals.topExecName}
                </div>
                <div className="pl-card-subtitle" style={{ color: '#059669', fontWeight: 700 }}>
                    {fmt(totals.topExecSales)}
                </div>
           </div>
           <div className="pl-card-footer">
                <button 
                  onClick={() => setViewMode("executives")}
                  className="pl-action-btn"
                  style={{ color: '#059669' }}
                >
                    View All Staff <span>→</span>
                </button>
           </div>
        </div>
      </div>
    </div>
  );
}
