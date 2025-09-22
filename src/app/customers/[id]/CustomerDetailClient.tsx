"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client"; 

// --- Type Definitions ---
type Customer = {
  id: number;
  name: string;
  opening_balance: number;
};

type Transaction = {
  bill_no: string | null;
  date: string;
  type: "Sale" | "Payment" | "Payout";
  details: string;
  amount: number;
  running_balance?: number;
};

type GroupedTransactions = {
  [bill_no: string]: Transaction[];
};

type BillGroup = {
  billNo: string;
  items: Transaction[];
  summary: {
    totalSale: number;
    totalPaid: number;
    billBalance: number;
  };
};

// --- Main Component ---
export default function CustomerDetailClient({ id }: { id: string }) {
  const supabase = createClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [billGroups, setBillGroups] = useState<BillGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const customerId = Number(id);

      // 1. Fetch basic customer details (for name and opening balance)
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("id, name, opening_balance")
        .eq("id", customerId)
        .single();
      
      if (custErr) console.error("Customer fetch error:", custErr);
      else setCustomer(cust);

      // 2. Fetch the customer's CURRENT total balance from the totals view
      const { data: total, error: totalErr } = await supabase
        .from("customer_totals")
        .select("balance")
        .eq("id", customerId)
        .single();
      
      if (totalErr) console.error("Customer total balance fetch error:", totalErr);
      else setCurrentBalance(total.balance);

      if (cust) {
        // 3. Fetch ALL transactions for this customer directly from the ledger
        const { data, error: txnErr } = await supabase
          .from("bill_transaction_ledger")
          .select("*") 
          .eq('customer_id', customerId) // Find all transactions for this customer
          .order("date", { ascending: true });

        if (txnErr) {
          console.error("Transactions fetch error:", txnErr);
        } else if (data) {
          const txns = data as Transaction[]; 
          
          let runningTotal = cust.opening_balance;
          const transactionsWithBalance = txns.map(t => {
            if (t.type === 'Sale' || t.type === 'Payment') {
              runningTotal += t.amount;
            }
            return { ...t, running_balance: runningTotal };
          });

          // Group transactions by bill_no (standalone advances will go into "No Bill")
          const grouped = transactionsWithBalance.reduce((acc, txn) => {
            const key = txn.bill_no || "No Bill";
            if (!acc[key]) acc[key] = [];
            acc[key].push(txn);
            return acc;
          }, {} as GroupedTransactions);
          
          const finalBillGroups: BillGroup[] = Object.entries(grouped).map(([billNo, items]) => {
            const totalSale = items.filter(t => t.type === 'Sale').reduce((sum, t) => sum + t.amount, 0);
            const totalPaid = items.filter(t => t.type === 'Payment').reduce((sum, t) => sum - t.amount, 0);
            return {
              billNo, items, summary: { totalSale, totalPaid, billBalance: totalSale - totalPaid }
            };
          });
          
          finalBillGroups.sort((a, b) => new Date(a.items[0].date).getTime() - new Date(b.items[0].date).getTime());
          setBillGroups(finalBillGroups);
        }
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
        <div className="page-header-balances">
          <div className="balance-item">
            <div className="label">Opening Balance</div>
            <div className="value">₹{customer.opening_balance.toLocaleString("en-IN")}</div>
          </div>
          <div className="balance-item">
            <div className="label">Current Balance</div>
            <div className={`value ${currentBalance !== null && currentBalance > 0 ? 'is-due' : ''}`}>
              {currentBalance !== null ? `₹${currentBalance.toLocaleString("en-IN")}` : '...'}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {billGroups.map(({ billNo, items, summary }) => (
                <div key={billNo} className="bill-group">
                  <div className="bill-header">
                    <div className="bill-no">
                      {billNo === 'No Bill' ? 'Standalone Transactions' : `Bill No: ${billNo}`}
                    </div>
                    {billNo !== 'No Bill' && (
                        <div className="bill-summary">
                        <div className="summary-item">
                            <span>Total Sale: </span><span className="value">₹{summary.totalSale.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="summary-item">
                            <span>Amount Paid: </span><span className="value positive">₹{summary.totalPaid.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="summary-item">
                            <span>Bill Balance: </span><span className="value negative">₹{summary.billBalance.toLocaleString("en-IN")}</span>
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
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'right' }}>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t, index) => (
                        <tr key={index}>
                          <td>{new Date(t.date).toLocaleDateString("en-IN", { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                          <td><span className={`type-badge ${t.type.toLowerCase()}`}>{t.type}</span></td>
                          <td>{t.details}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }} className={t.type === 'Payment' ? 'credit' : (t.type === 'Payout' ? 'debit' : '')}>
                            {t.type === 'Payment' ? '-' : '+'}
                            ₹{Math.abs(t.amount).toLocaleString("en-IN")}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>
                            ₹{t.running_balance?.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
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
