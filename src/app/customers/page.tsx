"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  /* -----------------------
     Fetch once
  ------------------------ */
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("customer_totals")
        .select("id, name, balance")
        .order("name");

      if (!error && data) {
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

  /* -----------------------
     Derived list (FAST)
  ------------------------ */
  const visibleCustomers = allCustomers.filter((c) => {
    // search always wins
    if (query.trim()) {
      return c.name.toLowerCase().includes(query.toLowerCase());
    }

    // due-only applies only when NOT searching
    if (onlyDue) {
      return c.balance > 0;
    }

    return true;
  });

  /* -----------------------
     Save scroll before nav
  ------------------------ */
  function handleView(id: number) {
    sessionStorage.setItem(
      "customers_scroll",
      String(window.scrollY)
    );
    window.location.href = `/customers/${id}`;
  }

  /* -----------------------
     Restore scroll
  ------------------------ */
  useEffect(() => {
    const y = sessionStorage.getItem("customers_scroll");
    if (y) {
      window.scrollTo(0, Number(y));
      sessionStorage.removeItem("customers_scroll");
    }
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
      </div>

      <div className="card">
        <div className="card-body">
          {/* Search + Due */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Search customers..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1 }}
            />

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: query ? 0.5 : 1,
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
