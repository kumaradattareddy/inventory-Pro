"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

type ViewMode = "overview" | "payables" | "receivables" | "stock" | "executives";

export default function ProfitLossPage() {
  const supabase = createClient();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [loading, setLoading] = useState(true);

  // Raw Data
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [executives, setExecutives] = useState<{name: string, sales: number}[]>([]);

  // Computed Totals
  const [totals, setTotals] = useState({
    receivables: 0,
    payables: 0,
    stockValue: 0,
    topExecName: "—",
    topExecSales: 0,
  });

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // 1. CUSTOMERS (Receivables)
        const { data: custData } = await supabase
          .from("customer_totals")
          .select("id, name, balance")
          .order("balance", { ascending: false });

        const rawCust = custData || [];
        const cleanCust = rawCust.map((c: any) => ({
             ...c,
             balance: Number(c.balance) || 0
        }));
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

        const supList = Object.entries(supMap).map(([id, val]) => ({
            id: Number(id),
            name: val.name,
            balance: val.balance
        }));
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
                return {
                    ...item,
                    price: price,
                    totalValue: (Number(item.current_stock) * price)
                };
            }).sort((a, b) => b.totalValue - a.totalValue);
        }
        setStock(processedStock);


        // 4. EXECUTIVE SALES (New Logic)
        // Fetch all ledger transactions
        const { data: ledgerData } = await supabase
            .from("bill_transaction_ledger")
            .select("*");
        
        const execMap: Record<string, number> = {};
        const billGroups: Record<string, any[]> = {};

        // Group by Bill No
        (ledgerData || []).forEach((row: any) => {
            if (row.bill_no && row.bill_no !== "—") {
                if (!billGroups[row.bill_no]) billGroups[row.bill_no] = [];
                billGroups[row.bill_no].push(row);
            }
        });

        // Process each bill
        Object.values(billGroups).forEach(items => {
            // Find executives
            const execs = items
                .filter(i => i.type === "Executive" && i.details)
                .map(i => i.details as string);
            
            // Calculate Bill Net (Sales Only)
            const billNet = items
                .filter(i => ["Sale", "Charge", "Discount"].includes(i.type))
                .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

            // Attribute to executives (shared credit)
            if (execs.length > 0 && billNet > 0) {
                 const uniqueExecs = Array.from(new Set(execs));
                 uniqueExecs.forEach(exec => {
                     execMap[exec] = (execMap[exec] || 0) + billNet;
                 });
            }
        });

        const execList = Object.entries(execMap)
            .map(([name, sales]) => ({ name, sales }))
            .sort((a, b) => b.sales - a.sales);
        
        setExecutives(execList);


        // 5. COMPUTE GRAND TOTALS
        setTotals({
            receivables: cleanCust.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0),
            payables: supList.reduce((sum, s) => sum + (s.balance || 0), 0),
            stockValue: processedStock.reduce((sum, s) => sum + s.totalValue, 0),
            topExecName: execList.length > 0 ? execList[0].name : "—",
            topExecSales: execList.length > 0 ? execList[0].sales : 0,
        });

      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
     return <div className="page p-8 text-center text-gray-500">Loading analysis...</div>;
  }

  // --- VIEW: PAYABLES ---
  if (viewMode === "payables") {
      const sortedSuppliers = [...suppliers].sort((a, b) => b.balance - a.balance);
      return (
        <div className="page">
            <div className="page-header flex gap-4 items-center">
                <button onClick={() => setViewMode("overview")} className="btn-icon">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <h1 className="page-title">Total Payables (Suppliers)</h1>
            </div>
            <div className="card mt-6">
                <table className="db-table">
                    <thead>
                        <tr>
                            <th>Supplier Name</th>
                            <th className="right">Amount Owed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedSuppliers.map(s => (
                            <tr key={s.id}>
                                <td>{s.name}</td>
                                <td className="right font-bold text-red-600">₹{s.balance.toLocaleString("en-IN")}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
              <button onClick={() => setViewMode("overview")} className="btn-icon">
                  <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <h1 className="page-title">Total Receivables (Customers)</h1>
          </div>
          <div className="card mt-6">
              <table className="db-table">
                  <thead>
                      <tr>
                          <th>Customer Name</th>
                          <th className="right">Balance Due</th>
                      </tr>
                  </thead>
                  <tbody>
                      {debtors.map(c => (
                          <tr key={c.id}>
                              <td>{c.name}</td>
                              <td className="right font-bold text-blue-600">₹{c.balance.toLocaleString("en-IN")}</td>
                          </tr>
                      ))}
                      {debtors.length === 0 && <tr><td colSpan={2} className="text-center p-8 text-gray-400">No pending receivables</td></tr>}
                  </tbody>
              </table>
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
              <h1 className="page-title">Stock Valuation</h1>
          </div>
          <div className="card mt-6">
              <table className="db-table">
                  <thead>
                      <tr>
                          <th>Product</th>
                          <th className="right">Qty</th>
                          <th className="right">Most Common Cost</th>
                          <th className="right">Total Value</th>
                      </tr>
                  </thead>
                  <tbody>
                      {stock.map(s => (
                          <tr key={s.id}>
                              <td>{s.name}</td>
                              <td className="right text-gray-600">{s.current_stock}</td>
                              <td className="right text-gray-500">₹{s.price.toLocaleString("en-IN")}</td>
                              <td className="right font-bold text-purple-700">₹{s.totalValue.toLocaleString("en-IN")}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
    );
  }

  // --- VIEW: EXECUTIVES ---
  if (viewMode === "executives") {
    return (
      <div className="page">
          <div className="page-header flex gap-4 items-center">
              <button onClick={() => setViewMode("overview")} className="btn-icon">
                  <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <h1 className="page-title">Executive Sales Performance</h1>
          </div>
          <div className="card mt-6">
              <table className="db-table">
                  <thead>
                      <tr>
                          <th>Executive Name</th>
                          <th className="right">Total Sales Generated</th>
                      </tr>
                  </thead>
                  <tbody>
                      {executives.map((e, idx) => (
                          <tr key={idx}>
                              <td>
                                  <div className="flex items-center gap-3">
                                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200">
                                          {idx + 1}
                                      </div>
                                      <span className="font-medium text-gray-900">{e.name}</span>
                                      {idx === 0 && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full border border-yellow-200">Top Performer</span>}
                                  </div>
                              </td>
                              <td className="right font-bold text-emerald-600">₹{e.sales.toLocaleString("en-IN")}</td>
                          </tr>
                      ))}
                      {executives.length === 0 && <tr><td colSpan={2} className="text-center p-8 text-gray-400">No sales records found</td></tr>}
                  </tbody>
              </table>
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

      <div className="pl-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
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
                <div className="pl-card-value">
                    ₹{totals.payables.toLocaleString("en-IN")}
                </div>
                <div className="pl-card-subtitle">Owed to Suppliers</div>
           </div>
           <div className="pl-card-footer">
                <button onClick={() => setViewMode("payables")} className="pl-action-btn">
                    View Breakdown <span>→</span>
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
                <div className="pl-card-value">
                    ₹{totals.receivables.toLocaleString("en-IN")}
                </div>
                <div className="pl-card-subtitle">Pending from Customers</div>
           </div>
           <div className="pl-card-footer">
                <button onClick={() => setViewMode("receivables")} className="pl-action-btn">
                    View Customers <span>→</span>
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
                <div className="pl-card-value">
                    ₹{totals.stockValue.toLocaleString("en-IN")}
                </div>
                <div className="pl-card-subtitle">Current Inventory Worth</div>
           </div>
           <div className="pl-card-footer">
                <button onClick={() => setViewMode("stock")} className="pl-action-btn">
                    Analyze Stock <span>→</span>
                </button>
           </div>
        </div>

        {/* Card 4: Top Executive */}
        <div className="pl-card executives" style={{ borderLeft: '6px solid #10b981' }}>
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
                <div className="pl-card-subtitle text-emerald-600 font-bold">
                    ₹{totals.topExecSales.toLocaleString("en-IN")}
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
