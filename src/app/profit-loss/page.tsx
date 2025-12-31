"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProfitLossPage() {
  const supabase = createClient();

  const [stats, setStats] = useState({
    receivables: 0,
    payables: 0,
    stockValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // 1. Total Receivables: Sum of all customer balances
        // We use the customer_totals VIEW which already has the calculated balance per customer
        const { data: customers, error: custError } = await supabase
          .from("customer_totals")
          .select("balance");
        
        const totalReceivables = (customers || []).reduce(
          (sum: number, c: any) => sum + (Number(c.balance) || 0),
          0
        );

        // 2. Total Payables: Sum of amounts owed to suppliers
        // We calculate this from supplier_transactions to be safe
        const { data: supplierTx, error: supError } = await supabase
          .from("supplier_transactions" as any) // View
          .select("total_amount");

        const totalPayables = (supplierTx || []).reduce(
          (sum: number, tx: any) => sum + (Number(tx.total_amount) || 0),
          0
        );

        // 3. Total Stock Value: Sum of (Current Stock * Last Purchase Price)
        // First, get live stock
        const { data: stockData, error: stockError } = await supabase
          .from("product_stock_live" as any)
          .select("id, current_stock")
          .gt("current_stock", 0); // Only positive stock

        const stock = stockData as any[] | null;
        
        let totalStockVal = 0;
        
        if (stock && stock.length > 0) {
            // Get all purchase moves for these products to determine Last Purchase Price
            // We fetch simple fields to minimize load
            const productIds = stock.map(s => s.id);
            const { data: moves } = await supabase
                .from("stock_moves")
                .select("product_id, price_per_unit, ts")
                .eq("kind", "purchase")
                .in("product_id", productIds)
                .order("ts", { ascending: false }); // Latest first

            // Create a map of ProductID -> Last Price
            const priceMap: Record<number, number> = {};
            
            if (moves) {
                for (const m of moves) {
                    if (m.product_id && priceMap[m.product_id] === undefined && m.price_per_unit) {
                        priceMap[m.product_id] = m.price_per_unit;
                    }
                }
            }

            // Calculate total value
            for (const item of stock) {
                const price = priceMap[item.id] || 0;
                totalStockVal += (Number(item.current_stock) * price);
            }
        }

        setStats({
          receivables: totalReceivables,
          payables: totalPayables,
          stockValue: totalStockVal,
        });
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
        <div className="page">
            <div className="page-header"><h1 className="page-title">Profit & Loss</h1></div>
            <div className="p-8 text-center text-gray-500">Loading analysis...</div>
        </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Profit & Loss</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Card 1: Total Payables (Suppliers) */}
        <div className="db-card p-6 flex flex-col gap-2 border-l-4 border-l-red-500">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Payables</h3>
            <div className="text-3xl font-bold text-gray-900">
                ₹{stats.payables.toLocaleString("en-IN")}
            </div>
            <div className="text-sm text-gray-400 mt-1">To Suppliers</div>
        </div>

        {/* Card 2: Total Receivables (Customers) */}
        <div className="db-card p-6 flex flex-col gap-2 border-l-4 border-l-blue-500">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Receivables</h3>
            <div className="text-3xl font-bold text-gray-900">
                ₹{stats.receivables.toLocaleString("en-IN")}
            </div>
            <div className="text-sm text-gray-400 mt-1">From Customers</div>
        </div>

        {/* Card 3: Stock Value */}
        <div className="db-card p-6 flex flex-col gap-2 border-l-4 border-l-purple-500">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Stock Value</h3>
            <div className="text-3xl font-bold text-gray-900">
                ₹{stats.stockValue.toLocaleString("en-IN")}
            </div>
            <div className="text-sm text-gray-400 mt-1">@ Cost Price</div>
        </div>
      </div>
    </div>
  );
}
