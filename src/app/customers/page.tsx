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

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [loading, setLoading] = useState(true);

  // Initial load (all customers)
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const { data, error } = await supabase
        .from("customer_totals")
        .select("id, name, balance")
        .order("name");

      if (error) {
        console.error(error);
      } else {
        setCustomers(
          (data ?? []).map((c: any) => ({
            id: Number(c.id),
            name: c.name ?? "",
            balance: Number(c.balance ?? 0),
          }))
        );
      }
      setLoading(false);
    }

    fetchAll();
  }, [supabase]);

  // Live search
  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/customers/search?q=${query}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setCustomers(data ?? []);
      } catch (_) {}
      setLoading(false);
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const visibleCustomers = customers.filter(
    (c) => !onlyDue || c.balance > 0
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
      </div>

      <div className="card">
        <div className="card-body">
          {/* Search + Filter */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <input
              type="text"
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
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={onlyDue}
                onChange={(e) => setOnlyDue(e.target.checked)}
              />
              Due only
            </label>
          </div>

          {loading ? (
            <div className="p-4">Loading...</div>
          ) : (
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
                        <Link
                          href={`/customers/${c.id}`}
                          className="btn btn-sm btn-primary"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
