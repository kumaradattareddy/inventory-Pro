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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomers() {
      const { data, error } = await supabase
        .from("customer_totals") // ✅ use view with balance
        .select("id, name, balance")
        .order("name");

      if (error) {
        console.error("Error fetching customers:", error);
      } else {
        setCustomers(
          (data ?? []).map((c: any) => ({
            id: Number(c.id),
            name: c.name ?? "",
            balance: c.balance ?? 0,
          }))
        );
      }
      setLoading(false);
    }
    fetchCustomers();
  }, [supabase]);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
      </div>

      <div className="card">
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    No customers found.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>₹{c.balance}</td>
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
        </div>
      </div>
    </div>
  );
}
