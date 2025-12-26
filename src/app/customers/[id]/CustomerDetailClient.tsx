"use client";

// React
import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { useRouter } from "next/navigation";

/* =======================
   Types
======================= */

type Customer = {
  id: number;
  name: string;
  opening_balance: number | null;
};

type LedgerRow = {
  bill_no: string | null;
  customer_id: number | null;
  date: string;
  type: "Sale" | "Payment" | "Payout" | "Charge" | "Discount" | "Executive";
  details: string;
  qty?: number | null;
  price_per_unit?: number | null;
  amount: number; // signed from view
};

type Transaction = LedgerRow & {
  running_balance?: number;
};

type Grouped = Record<string, Transaction[]>;

type BillGroup = {
  billNo: string;
  execs: string[];
  items: Transaction[];
  summary: {
    billNet: number;
    totalPaid: number;
    billBalance: number;
  };
};

/* =======================
   Component
======================= */

export default function CustomerDetailClient({ id }: { id: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [billGroups, setBillGroups] = useState<BillGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);
      const customerId = Number(id);

      /* -----------------------
         1) Fetch customer
      ------------------------ */
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("id, name, opening_balance")
        .eq("id", customerId)
        .single();

      if (custErr) {
        console.error(custErr);
        setLoading(false);
        return;
      }

      setCustomer(cust);

      /* -----------------------
         2) Fetch ledger
      ------------------------ */
      const { data, error: ledErr } = await supabase
        .from("bill_transaction_ledger")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true });

      if (ledErr) {
        console.error(ledErr);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as LedgerRow[];

      /* -----------------------
         3) Running balance
      ------------------------ */
      let running = cust.opening_balance ?? 0;

      const withRunning: Transaction[] = rows.map((r) => {
        running += r.amount;
        return { ...r, running_balance: running };
      });

      setCurrentBalance(
        withRunning.length > 0
          ? withRunning[withRunning.length - 1].running_balance!
          : cust.opening_balance ?? 0
      );

      /* -----------------------
         4) Group by bill
      ------------------------ */
      const grouped: Grouped = withRunning.reduce((acc, t) => {
        const key = t.bill_no ?? "No Bill";
        (acc[key] ||= []).push(t);
        return acc;
      }, {} as Grouped);

      const groups: BillGroup[] = Object.entries(grouped).map(
        ([billNo, itemsRaw]) => {
          const execs = Array.from(
            new Set(
              itemsRaw
                .filter((i) => i.type === "Executive")
                .map((i) => i.details)
                .filter(Boolean)
            )
          );

          const items = itemsRaw.filter((i) => i.type !== "Executive");

          /* -----------------------
             Bill summary (CORRECT)
          ------------------------ */
          const billNet = items
            .filter((i) => ["Sale", "Charge", "Discount"].includes(i.type))
            .reduce((s, i) => s + i.amount, 0);

          const totalPaid = items
            .filter((i) => i.type === "Payment" || i.type === "Payout")
            .reduce((s, i) => s + Math.abs(i.amount), 0);

          const billBalance = billNet - totalPaid;

          return {
            billNo,
            execs,
            items,
            summary: { billNet, totalPaid, billBalance },
          };
        }
      );

      groups.sort(
        (a, b) =>
          new Date(a.items[0]?.date || 0).getTime() -
          new Date(b.items[0]?.date || 0).getTime()
      );

      setBillGroups(groups);
      setLoading(false);
    }

    run();
  }, [id, supabase]);

  /* =======================
     Render
======================= */

  if (loading) return <div className="p-4">Loading...</div>;
  if (!customer) return <div className="p-4">Customer not found</div>;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => router.back()}
          style={{ marginRight: 12 }}
        >
          ← Back
        </button>

        <h1 className="page-title">{customer.name}</h1>

        <div className="page-header-balances">
          <div className="balance-item">
            <div className="label">Opening Balance</div>
            <div className="value">
              ₹{(customer.opening_balance ?? 0).toLocaleString("en-IN")}
            </div>
          </div>

          <div className="balance-item">
            <div className="label">Current Balance</div>
            <div
              className={`value ${
                currentBalance !== null && currentBalance > 0 ? "is-due" : ""
              }`}
            >
              {currentBalance !== null
                ? `₹${currentBalance.toLocaleString("en-IN")}`
                : "…"}
            </div>
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Transaction History</h2>
        </div>

        <div className="card-body">
          {billGroups.length === 0 ? (
            <div className="empty">No transactions found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {billGroups.map(({ billNo, items, summary, execs }) => (
                <div key={billNo} className="bill-group">
                  <div className="bill-header">
                    <div className="bill-no">
                      {billNo === "No Bill"
                        ? "Standalone Transactions"
                        : `Bill No: ${billNo}`}
                    </div>

                    {execs.length > 0 && billNo !== "No Bill" && (
                      <div className="exec-wrap">
                        <span className="exec-label">EXECUTIVE</span>
                        <div className="exec-badges">
                          {execs.map((name) => (
                            <span key={name} className="exec-badge">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {billNo !== "No Bill" && (
                      <div className="bill-summary">
                        <div className="summary-item">
                          <span>Net Bill:</span>
                          <span className="value">
                            ₹{summary.billNet.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="summary-item">
                          <span>Amount Paid:</span>
                          <span className="value positive">
                            ₹{summary.totalPaid.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="summary-item">
                          <span>Bill Balance:</span>
                          <span className="value negative">
                            ₹{summary.billBalance.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Details</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Rate</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                        <th style={{ textAlign: "right" }}>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t, i) => {
                        const sign = t.amount < 0 ? "−" : "+";
                        return (
                          <tr key={i}>
                            <td>
                              {new Date(t.date).toLocaleDateString("en-IN")}
                            </td>
                            <td>{t.type}</td>
                            <td>{t.details}</td>
                            <td style={{ textAlign: "right" }}>
                              {t.qty ?? "—"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {t.price_per_unit
                                ? `₹${t.price_per_unit.toLocaleString("en-IN")}`
                                : "—"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {sign}₹
                              {Math.abs(t.amount).toLocaleString("en-IN")}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              ₹
                              {(t.running_balance ?? 0).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
