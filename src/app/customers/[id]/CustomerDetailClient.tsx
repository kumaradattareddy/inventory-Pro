"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: number;
  name: string;
  balance: number;
};

type Transaction = {
  id: string;
  date: string;
  type: "sale" | "payment";
  product_name?: string;
  other_name?: string;
  amount: number;
  direction: "credit" | "debit";
  running_balance: number;
};

export default function CustomerDetailClient({ id }: { id: string }) {
  const supabase = createClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const customerId = Number(id);

      // ✅ fetch customer with balance from view
      const { data: cust, error: custErr } = await supabase
        .from("customer_totals")
        .select("id, name, balance")
        .eq("id", customerId)
        .single();

      if (custErr) {
        console.error("Customer fetch error:", custErr);
      } else if (cust) {
        setCustomer({
          id: Number(cust.id),
          name: cust.name ?? "",
          balance: cust.balance ?? 0,
        });
      }

      // ✅ fetch transactions
      const { data: txns, error: txnErr } = await supabase
        .from("customer_transactions_detailed")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true });

      if (txnErr) {
        console.error("Transactions fetch error:", txnErr);
      } else {
        const mapped: Transaction[] = (txns ?? []).map((t: any) => ({
          id: t.id?.toString() ?? "",
          date: t.date ?? "",
          type: (t.type ?? "sale") as "sale" | "payment",
          product_name: t.product_name ?? undefined,
          other_name: t.other_name ?? undefined,
          amount: t.amount ?? 0,
          direction: (t.direction ?? "debit") as "credit" | "debit",
          running_balance: t.running_balance ?? 0,
        }));
        setTransactions(mapped);
      }

      setLoading(false);
    }

    fetchData();
  }, [id, supabase]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!customer) return <div className="p-4">Customer not found</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{customer.name}</h1>
        <p className="text-gray-600">Opening Balance: ₹{customer.balance}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Transaction History</h2>
        </div>
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Product</th>
                <th>Other Name</th>
                <th>Amount</th>
                <th>Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date ? new Date(t.date).toLocaleDateString("en-IN") : "-"}</td>
                    <td>{t.type}</td>
                    <td>{t.product_name ?? "-"}</td>
                    <td>{t.other_name ?? "-"}</td>
                    <td className={t.direction === "credit" ? "text-green-600" : "text-red-600"}>
                      {t.direction === "credit" ? "+" : "-"}₹{t.amount}
                    </td>
                    <td>₹{t.running_balance}</td>
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
