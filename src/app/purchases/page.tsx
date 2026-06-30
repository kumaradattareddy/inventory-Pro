"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import PurchaseForm from "./purchase-form";

type PurchaseItem = {
  id: number | null;
  date: string | null;
  supplier_name: string | null;
  product_name: string | null;
  product_id?: number | null;
  size?: string | null;
  unit: string | null;
  qty: number | null;
  total_amount: number | null;
};

export default function PurchasesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [recentItems, setRecentItems] = useState<PurchaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [daysBack, setDaysBack] = useState(4);
  const prevDaysBackRef = useRef(4);

  const fetchRecentItems = useCallback(async (days: number, append: boolean) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = format(fromDate, "yyyy-MM-dd");

    // When appending, only fetch the new date range (between old cutoff and new cutoff)
    let query = supabase
      .from("purchase_transactions")
      .select("*")
      .gte("date", fromDateStr)
      .order("date", { ascending: false })
      .limit(200);

    if (append) {
      const prevFromDate = new Date();
      prevFromDate.setDate(prevFromDate.getDate() - (days - 4));
      const prevFromDateStr = format(prevFromDate, "yyyy-MM-dd");
      query = supabase
        .from("purchase_transactions")
        .select("*")
        .gte("date", fromDateStr)
        .lt("date", prevFromDateStr)
        .order("date", { ascending: false })
        .limit(200);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching recent purchases:", error);
    } else {
      let items = data || [];
      if (items.length > 0) {
        const productIds = Array.from(new Set(items.map((item: any) => item.product_id).filter(id => id != null)));
        if (productIds.length > 0) {
          const { data: productsData } = await supabase
            .from("products")
            .select("id, size")
            .in("id", productIds);
          
          if (productsData) {
            const sizeMap = new Map(productsData.map((p: any) => [p.id, p.size]));
            items = items.map((item: any) => ({
              ...item,
              size: item.product_id ? sizeMap.get(item.product_id) : null
            }));
          }
        }
      }

      if (append) {
        setRecentItems((prev) => [...prev, ...items]);
      } else {
        setRecentItems(items);
      }
    }
    setIsLoading(false);
    setIsLoadingMore(false);
  }, [supabase]);

  // Initial load
  useEffect(() => {
    fetchRecentItems(4, false);
  }, [fetchRecentItems]);

  // Handle daysBack changes (load more)
  useEffect(() => {
    if (daysBack > prevDaysBackRef.current) {
      fetchRecentItems(daysBack, true);
      prevDaysBackRef.current = daysBack;
    }
  }, [daysBack, fetchRecentItems]);

  const handleSaveSuccess = useCallback(() => {
    prevDaysBackRef.current = daysBack;
    fetchRecentItems(daysBack, false);
  }, [daysBack, fetchRecentItems]);

  const loadMore = () => {
    setDaysBack((prev) => prev + 4);
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">New Purchase</h1>
      </div>

      <PurchaseForm onSaveSuccess={handleSaveSuccess} />

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recently Purchased Items</h2>
          <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
            Showing last {daysBack} days
          </span>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <table className="table" style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ width: "35%", color: "#64748b", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Supplier</th>
                <th style={{ width: "35%", color: "#64748b", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ width: "15%", textAlign: "center", color: "#64748b", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Quantity</th>
                <th style={{ width: "15%", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Total Amount</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="empty">
                    Loading history...
                  </td>
                </tr>
              ) : recentItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    No recent purchases found.
                  </td>
                </tr>
              ) : (
                recentItems.map((item, index) => {
                  const itemDateStr = item.date ? format(new Date(item.date), "do MMMM, yyyy") : "Unknown Date";
                  const prevItemDateStr = index > 0 && recentItems[index - 1].date ? format(new Date(recentItems[index - 1].date!), "do MMMM, yyyy") : null;
                  const showDateHeader = itemDateStr !== prevItemDateStr;

                  return (
                    <React.Fragment key={item.id}>
                      {showDateHeader && (
                        <tr>
                          <td colSpan={4} style={{ 
                            padding: "6px 12px", 
                            background: "#e2e8f0", 
                            fontWeight: 700, 
                            color: "#1e293b", 
                            fontSize: "12px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            borderBottom: "2px solid #cbd5e1"
                          }}>
                            {itemDateStr}
                          </td>
                        </tr>
                      )}
                      <tr style={{ transition: "background-color 0.2s ease" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>{item.supplier_name}</div>
                        </td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ color: "#475569", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 500 }}>
                            <span style={{ 
                              display: "inline-block", 
                              width: "5px", 
                              height: "5px", 
                              borderRadius: "50%", 
                              backgroundColor: "#cbd5e1" 
                            }}></span>
                            {item.product_name}
                            {item.size && (
                              <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "4px" }}>
                                ({item.size})
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9", textAlign: "center" }}>
                          <span style={{
                            background: "#f1f5f9",
                            color: "#334155",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "1px solid #e2e8f0",
                            display: "inline-flex",
                            alignItems: "baseline",
                            gap: "4px"
                          }}>
                            <span style={{ fontSize: "13px", color: "#0f172a" }}>{item.qty}</span> {item.unit}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 700, color: "#16a34a", fontSize: "14px" }}>
                          ₹{(item.total_amount ?? 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>

          {!isLoading && recentItems.length > 0 && (
            <div style={{ padding: "12px 16px", textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
              <button
                className="btn-secondary"
                onClick={loadMore}
                disabled={isLoadingMore}
                style={{ minWidth: "160px" }}
              >
                {isLoadingMore ? "Loading..." : `Load 4 More Days`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
