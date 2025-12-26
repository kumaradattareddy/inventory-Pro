"use client";
// React
import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

/* Types */
type Customer = { id: number; name: string; opening_balance: number };
type LedgerRow = {
  bill_no: string | null;
  customer_id: number | null;
  date: string;
  type: "Sale" | "Payment" | "Payout" | "Charge" | "Discount" | "Executive";
  details: string;
  qty?: number | null;
  price_per_unit?: number | null;
  amount: number; // from view: Payment, Payout & Discount negative, Sale/Charge positive
};
type Transaction = LedgerRow & { running_balance?: number };
type Grouped = Record<string, Transaction[]>;
type BillGroup = {
  billNo: string;
  execs: string[];
  items: Transaction[];
  summary: { totalSaleAndCharges: number; totalPaid: number; billBalance: number };
};

export default function CustomerDetailClient({ id }: { id: string }) {
  const supabase = createClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [billGroups, setBillGroups] = useState<BillGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);
      const customerId = Number(id);

      // 1) customer
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

      // 2) full ledger rows (already signed)
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

      // running balance: opening + sum(amount)
      let running = cust.opening_balance ?? 0;
      const withRun: Transaction[] = rows.map((r) => {
        running += r.amount;
        return { ...r, running_balance: running };
      });

      // also reflect this in the header "Current Balance"
      const lastRunning =
        withRun.length > 0
          ? withRun[withRun.length - 1].running_balance!
          : cust.opening_balance ?? 0;
      setCurrentBalance(lastRunning);

      // group by bill; collect executives; drop executive rows from items
      const grouped: Grouped = withRun.reduce((acc, t) => {
        const key = t.bill_no ?? "No Bill";
        (acc[key] ||= []).push(t);
        return acc;
      }, {} as Grouped);

      const groups: BillGroup[] = Object.entries(grouped).map(([billNo, itemsRaw]) => {
        const execs = Array.from(
          new Set(
            itemsRaw
              .filter((i) => i.type === "Executive")
              .map((i) => i.details)
              .filter(Boolean)
          )
        );
        const items = itemsRaw.filter((i) => i.type !== "Executive");

        const totalSaleAndCharges = items
          .filter((i) => ["Sale", "Charge", "Discount"].includes(i.type))
          .reduce((s, i) => s + i.amount, 0);

        const totalPaid = items
          .filter((i) => i.type === "Payment" || i.type === "Payout")
          .reduce((s, i) => s + Math.abs(i.amount), 0);

        const billBalance = totalSaleAndCharges - totalPaid;

        return { billNo, execs, items, summary: { totalSaleAndCharges, totalPaid, billBalance } };
      });

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

  if (loading) return <div className="p-4">Loading...</div>;
  if (!customer) return <div className="p-4">Customer not found</div>;

  return (
    <div className="page">
      <div className="page-header">
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

                    {/* Executive badges */}
                    {execs.length > 0 && billNo !== "No Bill" && (
                      <div className="exec-wrap">
                        <span className="exec-label">EXECUTIVE</span>
                        <div className="exec-badges">
                          {execs.map((name) => (
                            <span key={name} className="exec-badge">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  fill="currentColor"
                                  d="M12 12a5 5 0 1 0-5-5a5 5 0 0 0 5 5Zm0 2c-4.003 0-7 2.239-7 5v1h14v-1c0-2.761-2.997-5-7-5Z"
                                />
                              </svg>
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {billNo !== "No Bill" && (
                      <div className="bill-summary">
                        <div className="summary-item">
                          <span>Total Sale:</span>
                          <span className="value">
                            ₹{summary.totalSaleAndCharges.toLocaleString("en-IN")}
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
                        const signed = t.amount;
                        const sign = signed < 0 ? "−" : "+";
                        return (
                          <tr key={i}>
                            <td>
                              {new Date(t.date).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </td>
                            <td>
                              <span
                                className={`type-badge ${t.type.toLowerCase()}`}
                              >
                                {t.type}
                              </span>
                            </td>
                            <td>{t.details}</td>
                            <td style={{ textAlign: "right" }}>
                              {["Sale", "Charge", "Discount"].includes(t.type) &&
                              t.qty
                                ? t.qty
                                : "—"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {["Sale", "Charge", "Discount"].includes(t.type) &&
                              t.price_per_unit
                                ? `₹${t.price_per_unit.toLocaleString("en-IN")}`
                                : "—"}
                            </td>
                            <td
                              style={{ textAlign: "right", fontWeight: 500 }}
                              className={signed < 0 ? "credit" : ""}
                            >
                              {sign}₹{Math.abs(signed).toLocaleString("en-IN")}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              ₹{(t.running_balance ?? 0).toLocaleString("en-IN")}
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

      {/* Styles for executive badges */}
      <style jsx>{`
        .exec-wrap {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.25rem;
        }
        .exec-label {
          font-size: 0.68rem;
          letter-spacing: 0.12em;
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .exec-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .exec-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.6rem;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 0.8rem;
          color: #0b4a2f;
          background: linear-gradient(180deg, #c7f9cc, #a7f3d0);
          border: 1px solid #8de1b8;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
        }
        @media (prefers-color-scheme: dark) {
          .exec-label {
            color: #9ca3af;
          }
          .exec-badge {
            color: #052e1f;
            background: linear-gradient(180deg, #86efac, #34d399);
            border-color: #22c55e;
          }
        }
      `}</style>
    </div>
  );
}
