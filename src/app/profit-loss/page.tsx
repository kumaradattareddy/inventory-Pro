"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

type ViewMode = "overview" | "payables" | "receivables" | "stock";

export default function ProfitLossPage() {
  const supabase = createClient();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [loading, setLoading] = useState(true);

  // Raw Data
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);

  // Computed Totals
  const [totals, setTotals] = useState({
    receivables: 0,
    payables: 0,
    stockValue: 0,
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

        // Filter: Receivables only counts positive balances (Owed TO us)
        const rawCust = custData || [];
        const cleanCust = rawCust.map((c: any) => ({
             ...c,
             balance: Number(c.balance) || 0
        }));
        setCustomers(cleanCust);


        // 2. SUPPLIERS (Payables)
        // We need to aggregate transactions per supplier
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

        // Convert map to array
        const supList = Object.entries(supMap).map(([id, val]) => ({
            id: Number(id),
            name: val.name,
            balance: val.balance
        }));
        setSuppliers(supList);


        // 3. STOCK VALUE
        const { data: stockData } = await supabase
          .from("product_stock_live" as any)
          .select("id, name, current_stock")
          .gt("current_stock", 0); // Ignore 0 or negative stock

        const liveStock = (stockData || []) as any[];
        let processedStock: any[] = [];
        
        if (liveStock.length > 0) {
            const productIds = liveStock.map(s => s.id);
            // Fetch latest purchase price for these products
            const { data: moves } = await supabase
                .from("stock_moves")
                .select("product_id, price_per_unit, ts")
                .eq("kind", "purchase")
                .in("product_id", productIds)
                .order("ts", { ascending: false });

            // Map: ProductID -> Last Price
            const priceMap: Record<number, number> = {};
            (moves || []).forEach((m: any) => {
                // First one found is the latest due to sort
                if (m.product_id && priceMap[m.product_id] === undefined && m.price_per_unit) {
                    priceMap[m.product_id] = m.price_per_unit;
                }
            });

            // Calculate value
            processedStock = liveStock.map(item => {
                const price = priceMap[item.id] || 0;
                return {
                    ...item,
                    price: price,
                    totalValue: (Number(item.current_stock) * price)
                };
            }).sort((a, b) => b.totalValue - a.totalValue); // Rank by most valuable
        }
        setStock(processedStock);

        // 4. COMPUTE GRAND TOTALS
        setTotals({
            receivables: cleanCust.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0),
            payables: supList.reduce((sum, s) => sum + (s.balance || 0), 0), // Assuming positive sum = we owe them
            stockValue: processedStock.reduce((sum, s) => sum + s.totalValue, 0)
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
    // Only show customers with positive balance (Owings)
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
                          <th className="right">Last Cost Price</th>
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

  // --- VIEW: OVERVIEW (DASHBOARD) ---
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Profit & Loss Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        {/* Card 1: Payables */}
        <div className="db-card flex flex-col justify-between hover:shadow-lg transition-shadow border-l-4 border-l-red-500 overflow-visible relative">
           {/* Content */}
           <div className="p-6 pb-20">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-red-50 rounded-lg text-red-600">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                            <path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
                            <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V9.75Z" clipRule="evenodd" />
                            <path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total Payables</h3>
                </div>
                <div className="text-4xl font-extrabold text-gray-900 mt-2">
                    ₹{totals.payables.toLocaleString("en-IN")}
                </div>
                <div className="text-sm font-medium text-gray-400 mt-2">Owed to Suppliers</div>
           </div>
           
           {/* Action/Footer */}
           <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-gray-50/50">
                <button 
                  onClick={() => setViewMode("payables")}
                  className="w-full text-center text-sm font-bold text-red-600 hover:text-red-700 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    View Breakdown <span>→</span>
                </button>
           </div>
        </div>

        {/* Card 2: Receivables */}
        <div className="db-card flex flex-col justify-between hover:shadow-lg transition-shadow border-l-4 border-l-blue-500 overflow-visible relative">
           <div className="p-6 pb-20">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                            <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
                            <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total Receivables</h3>
                </div>
                <div className="text-4xl font-extrabold text-gray-900 mt-2">
                    ₹{totals.receivables.toLocaleString("en-IN")}
                </div>
                <div className="text-sm font-medium text-gray-400 mt-2">Pending from Customers</div>
           </div>
           <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-gray-50/50">
                <button 
                  onClick={() => setViewMode("receivables")}
                  className="w-full text-center text-sm font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    View Customers <span>→</span>
                </button>
           </div>
        </div>

        {/* Card 3: Stock Value */}
        <div className="db-card flex flex-col justify-between hover:shadow-lg transition-shadow border-l-4 border-l-purple-500 overflow-visible relative">
           <div className="p-6 pb-20">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                            <path fillRule="evenodd" d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 0 0 4.25 22.5h15.5a1.875 1.875 0 0 0 1.865-2.071l-1.263-12a1.875 1.875 0 0 0-1.865-1.679H16.5V6a4.5 4.5 0 1 0-9 0ZM12 3a3 3 0 0 0-3 3v.75h6V6a3 3 0 0 0-3-3Zm-3 8.25a3 3 0 1 0 6 0v-.75a.75.75 0 0 1 1.5 0v.75a4.5 4.5 0 1 1-9 0v-.75a.75.75 0 0 1 1.5 0v.75Z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total Stock Value</h3>
                </div>
                <div className="text-4xl font-extrabold text-gray-900 mt-2">
                    ₹{totals.stockValue.toLocaleString("en-IN")}
                </div>
                <div className="text-sm font-medium text-gray-400 mt-2">Current Inventory Worth</div>
           </div>
           <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-gray-50/50">
                <button 
                  onClick={() => setViewMode("stock")}
                  className="w-full text-center text-sm font-bold text-purple-600 hover:text-purple-700 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    Analyze Stock <span>→</span>
                </button>
           </div>
        </div>
      </div>
    </div>
  );
}
