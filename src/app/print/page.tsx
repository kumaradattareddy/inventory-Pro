"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: number;
  name: string;
  size: string;
  unit: string;
  current_stock: number;
  supplier_name: string | null;
};

export default function PrintPage() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("product_stock_live" as any)
          .select("id, name, size, unit, current_stock, supplier_name")
          .eq("size", "1200*600")
          .eq("supplier_name", "DGF")
          .neq("current_stock", 0)
          .order("name");

        if (error) throw error;
        setProducts(
          (data || []).map((r: any) => ({
            id: Number(r.id),
            name: r.name ?? "",
            size: r.size ?? "",
            unit: r.unit ?? "",
            current_stock: Number(r.current_stock ?? 0),
            supplier_name: r.supplier_name ?? null,
          }))
        );
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => {
    if (!debouncedQuery) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(debouncedQuery)
    );
  }, [products, debouncedQuery]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading items...</div>;
  }

  return (
    <div className="page" style={{ padding: "20px" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-header { display: block !important; margin-bottom: 20px; }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th, .print-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "20px" }}>
        <a href="/products" className="link no-print" style={{ fontSize: 14 }}>
          ← Products
        </a>
        <h2 style={{ margin: 0, fontSize: 22, flex: 1 }}>
          📦 1200*600 (DGF) Stock List
        </h2>
        <span className="badge">{filtered.length} items</span>
        <button
          className="btn btn-secondary no-print"
          onClick={() => window.print()}
        >
          🖨️ Print
        </button>
      </div>

      {/* Search */}
      <div className="no-print" style={{ marginBottom: "16px" }}>
        <input
          type="search"
          placeholder="Search items..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid #d0d7de",
            fontSize: 15,
            outline: "none",
          }}
        />
      </div>

      <table className="table print-table">
        <thead>
          <tr>
            <th>NAME</th>
            <th>SIZE</th>
            <th>CURRENT STOCK</th>
            <th>UNIT</th>
            <th>SUPPLIER</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
                No items found.
              </td>
            </tr>
          ) : (
            filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.size}</td>
                <td style={{ fontWeight: 600, color: p.current_stock < 0 ? "#d32f2f" : undefined }}>{p.current_stock}</td>
                <td>
                  <span className="badge">{p.unit}</span>
                </td>
                <td>{p.supplier_name ?? "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
