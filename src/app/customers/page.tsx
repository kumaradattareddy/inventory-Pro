"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: number;
  name: string;
  balance: number;
};

export default function CustomersPage() {
  const supabase = createClient();

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [loading, setLoading] = useState(true);

  /* =======================
     Load customers once
  ======================= */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("customer_totals")
        .select("id, name, balance")
        .order("name");

      if (data) {
        setAllCustomers(
          data.map((c: any) => ({
            id: Number(c.id),
            name: c.name,
            balance: Number(c.balance ?? 0),
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  /* =======================
     Restore search + filter
  ======================= */
  useEffect(() => {
    const savedQuery = sessionStorage.getItem("customers_query");
    const savedDue = sessionStorage.getItem("customers_only_due");

    if (savedQuery !== null) setQuery(savedQuery);
    if (savedDue !== null) setOnlyDue(savedDue === "true");
  }, []);

  /* =======================
     Restore scroll (FIXED)
  ======================= */
  useLayoutEffect(() => {
    const y = sessionStorage.getItem("customers_scroll");
    if (y) {
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(y));
        sessionStorage.removeItem("customers_scroll");
      });
    }
  }, []);

  /* =======================
     Derived customers
  ======================= */
  const visibleCustomers = allCustomers.filter((c) => {
    if (query.trim()) {
      return c.name.toLowerCase().includes(query.toLowerCase());
    }
    if (onlyDue) return c.balance > 0;
    return true;
  });

  /* =======================
     View handler
  ======================= */
  function handleView(id: number) {
    sessionStorage.setItem("customers_scroll", String(window.scrollY));
    sessionStorage.setItem("customers_query", query);
    sessionStorage.setItem("customers_only_due", String(onlyDue));
    window.location.href = `/customers/${id}`;
  }

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="page">
      {/* TITLE ABOVE */}
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
      </div>

      <div className="card">
        <div className="card-body">
          {/* SEARCH BAR ABOVE TABLE */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            {/* Search */}
            <div style={{ position: "relative", flex: 1 }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6b7280",
                }}
              >
                <path
                  fill="currentColor"
                  d="M21 20l-5.6-5.6a7 7 0 1 0-1.4 1.4L20 21zM5 10a5 5 0 1 1 5 5a5 5 0 0 1-5-5"
                />
              </svg>

              <input
                placeholder="Search customers…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 36px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  outline: "none",
                  fontSize: 14,
                }}
              />
            </div>

            {/* Due only */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                color: query ? "#9ca3af" : "#111827",
                cursor: query ? "not-allowed" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={onlyDue}
                disabled={!!query}
                onChange={(e) => setOnlyDue(e.target.checked)}
              />
              Due only
            </label>
          </div>

          {/* TABLE */}
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    No customers found.
                  </td>
                </tr>
              ) : (
                visibleCustomers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>₹{c.balance.toLocaleString("en-IN")}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleView(c.id)}
                      >
                        View
                      </button>
                    </td>
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
