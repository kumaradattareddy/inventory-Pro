"use client";

import { useEffect, useLayoutEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: number;
  name: string;
  balance: number;
};

const BATCH_SIZE = 50;

export default function CustomersPage() {
  const router = useRouter();

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  /* =======================
     Load customers once
  ======================= */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/customers");
        if (!res.ok) throw new Error("Failed to fetch customers");
        const data = await res.json();
        setAllCustomers(data);
      } catch (err) {
        console.error("Error loading customers:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* =======================
     Restore search, filter, and visible count
  ======================= */
  useEffect(() => {
    const savedQuery = sessionStorage.getItem("customers_query");
    const savedDue = sessionStorage.getItem("customers_only_due");
    const savedCount = sessionStorage.getItem("customers_visible_count");

    if (savedQuery !== null) {
      setQuery(savedQuery);
      sessionStorage.removeItem("customers_query");
    }
    if (savedDue !== null) {
      setOnlyDue(savedDue === "true");
      sessionStorage.removeItem("customers_only_due");
    }
    if (savedCount !== null) {
      setVisibleCount(Number(savedCount));
      sessionStorage.removeItem("customers_visible_count");
    }
  }, []);

  /* =======================
     Derived customers (memoized)
  ======================= */
  const visibleCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCustomers.filter((c) => {
      if (q) return c.name.toLowerCase().includes(q);
      if (onlyDue) return c.balance !== 0;
      return true;
    });
  }, [allCustomers, query, onlyDue]);

  // Reset visible count when filter/search changes
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [query, onlyDue]);

  // Rows to render in the DOM right now
  const displayedCustomers = visibleCustomers.slice(0, visibleCount);
  const hasMore = visibleCount < visibleCustomers.length;

  /* =======================
     View handler (client-side navigation)
  ======================= */
  const handleView = useCallback((id: number) => {
    sessionStorage.setItem("customers_query", query);
    sessionStorage.setItem("customers_only_due", String(onlyDue));
    sessionStorage.setItem("customers_visible_count", String(visibleCount));
    router.push(`/customers/${id}`);
  }, [query, onlyDue, visibleCount, router]);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <>
      {/* Header */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Customers</h2>
      </div>

      {/* SEARCH BAR & FILTER */}
      <div
        style={{
          padding: '0 16px 16px',
          display: "flex",
          gap: 25,
          alignItems: "center",
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
          {displayedCustomers.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty">
                No customers found.
              </td>
            </tr>
          ) : (
            displayedCustomers.map((c) => (
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

      {/* SHOW MORE */}
      {hasMore && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setVisibleCount((v) => v + BATCH_SIZE)}
            style={{ minWidth: 160 }}
          >
            Show more ({visibleCustomers.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </>
  );
}
