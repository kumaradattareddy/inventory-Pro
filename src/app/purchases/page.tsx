"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import PurchaseForm from "./purchase-form";

type PurchaseItem = {
  id: number | null;
  date: string | null;
  supplier_name: string | null;
  product_name: string | null;
  unit: string | null;
  qty: number | null;
  total_amount: number | null;
};

export default function PurchasesPage() {
  const supabase = createClient();
  const [recentItems, setRecentItems] = useState<PurchaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRecentItems = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("purchase_transactions")
      .select("*")
      .limit(10);

    if (error) {
      console.error("Error fetching recent purchases:", error);
    } else {
      setRecentItems(data || []);
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchRecentItems();
  }, [fetchRecentItems]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">New Purchase</h1>
      </div>

      <PurchaseForm onSaveSuccess={fetchRecentItems} />

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recently Purchased Items</h2>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Total Amount</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Loading history...
                  </td>
                </tr>
              ) : recentItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No recent purchases found.
                  </td>
                </tr>
              ) : (
                recentItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.date
                        ? format(new Date(item.date), "dd MMM, yyyy")
                        : "N/A"}
                    </td>
                    <td>{item.supplier_name}</td>
                    <td>{item.product_name}</td>
                    <td>{item.unit}</td>
                    <td>{item.qty}</td>
                    <td>₹{(item.total_amount ?? 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
