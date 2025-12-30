"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, isToday, isYesterday } from "date-fns";

/* =======================
   Types
======================= */

type LedgerRow = {
  bill_no: string | null;
  customer_id: number | null;
  date: string;
  type: "Sale" | "Payment" | "Payout" | "Charge" | "Discount" | "Executive";
  details: string;
  qty?: number | null;
  price_per_unit?: number | null;
  amount: number; // signed
};

type Transaction = LedgerRow & {
  customer_name?: string;
};

type BillGroup = {
  billNo: string;
  customerId: number | null;
  customerName: string;
  execs: string[];
  date: string; // The date of the bill (first transaction)
  items: Transaction[];
  summary: {
    billNet: number;
    totalPaid: number;
    billBalance: number;
  };
};

type DailyGroup = {
  dateLabel: string;
  bills: BillGroup[];
};

/* =======================
   Component
======================= */

export default function DailyBillsPage() {
  const supabase = createClient();
  const [dailyGroups, setDailyGroups] = useState<DailyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [sortOrder, setSortOrder] = useState<"date-desc" | "bill-desc" | "bill-asc">("bill-desc");
  const [minBill, setMinBill] = useState("");
  const [maxBill, setMaxBill] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // 1. Fetch Customers
      const { data: customers, error: custErr } = await supabase
        .from("customers")
        .select("id, name");
      if (custErr) console.error("Error fetching customers:", custErr);
      const custMap = new Map<number, string>();
      customers?.forEach((c) => custMap.set(c.id, c.name));

      // 2. Fetch Ledger
      const { data: ledgerData, error: ledErr } = await supabase
        .from("bill_transaction_ledger")
        .select("*")
        .order("date", { ascending: false });

      if (ledErr) {
        console.error("Error fetching ledger:", ledErr);
        setLoading(false);
        return;
      }

      const rows = (ledgerData ?? []) as LedgerRow[];

      // 3. Attach Customer Names & Prepare Transactions
      const transactions: Transaction[] = rows.map((r) => ({
        ...r,
        customer_name: r.customer_id ? custMap.get(r.customer_id) || "Unknown" : "—",
      }));

      // 4. Group by Bill No
      const billGroupsMap = new Map<string, Transaction[]>();
      const standaloneItems: Transaction[] = [];

      transactions.forEach((t) => {
        if (t.bill_no) {
          // Use composite key to avoid collisions if any, though bill_no acts as primary grouper
          const compositeKey = `${t.bill_no}::${t.customer_id || "0"}`;
          if (!billGroupsMap.has(compositeKey)) billGroupsMap.set(compositeKey, []);
          billGroupsMap.get(compositeKey)!.push(t);
        } else {
          standaloneItems.push(t);
        }
      });

      const processedBills: BillGroup[] = [];

      // Process Bill Groups
      for (const [_, items] of billGroupsMap.entries()) {
        const sortedItems = items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const firstItem = sortedItems[0];
        
        // Extract Executives
        const execs = Array.from(new Set(
          sortedItems.filter((i) => i.type === "Executive").map((i) => i.details).filter(Boolean)
        ));
        
        const displayItems = sortedItems.filter((i) => i.type !== "Executive");

        const billNet = displayItems
          .filter((i) => ["Sale", "Charge", "Discount"].includes(i.type))
          .reduce((acc, i) => acc + i.amount, 0);

        const totalPaid = displayItems
          .filter((i) => i.type === "Payment" || i.type === "Payout")
          .reduce((acc, i) => acc + Math.abs(i.amount), 0);

        const billBalance = billNet - totalPaid;

        processedBills.push({
          billNo: firstItem.bill_no!,
          customerId: firstItem.customer_id,
          customerName: firstItem.customer_name || "",
          execs,
          date: firstItem.date,
          items: displayItems,
          summary: { billNet, totalPaid, billBalance },
        });
      }

      // Process Standalone as mini-bills
      standaloneItems.forEach((t) => {
        processedBills.push({
          billNo: "—",
          customerId: t.customer_id,
          customerName: t.customer_name || "",
          execs: [],
          date: t.date,
          items: [t],
          summary: {
            billNet: ["Sale", "Charge", "Discount"].includes(t.type) ? t.amount : 0,
            totalPaid: ["Payment", "Payout"].includes(t.type) ? Math.abs(t.amount) : 0,
            billBalance: 0,
          },
        });
      });

      // ---------------- Filtering Logic ---------------- //
      let filtered = processedBills;

      // Filter by Bill Number Range
      if (minBill || maxBill) {
        const min = parseInt(minBill) || 0;
        const max = parseInt(maxBill) || Infinity;
        filtered = filtered.filter(b => {
          if (b.billNo === "—") return false; // Hide standalone if filtering by bill no
          // Extract numeric part of bill no if it contains slashes (e.g. "2025/001" -> 1? or 2025001?)
          // Assuming Bill No is string but mostly numeric or "YYYY/NNN". 
          // Let's try to parse the last number segment for range specific simple numbers (like user showed '2422')
          const numPart = parseInt(b.billNo.replace(/\D/g, "")); 
          return numPart >= min && numPart <= max;
        });
      }

      // ---------------- Sorting Logic ---------------- //
      // Sort the entire list of bills first
      filtered.sort((a, b) => {
        if (sortOrder === "bill-desc" || sortOrder === "bill-asc") {
          const nA = parseInt(a.billNo.replace(/\D/g, "") || "0");
          const nB = parseInt(b.billNo.replace(/\D/g, "") || "0");
          if (sortOrder === "bill-desc") return nB - nA;
          return nA - nB;
        }
        // Default: date-desc
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      // 5. Group by Day (After sort? Or sort days?)
      // If sorting by Bill Number, days might get mixed up if bills are out of order date-wise.
      // But typically we still want to see them grouped by "Day of creation" or just a flat list?
      // User asked for "Day wise". So we group by Day, THEN sort bills within day? 
      // OR sort days, then sort bills within day.
      // Let's do: Group by day based on the BILL date. 
      // Sort keys (days) descending. Show bills in the selected sort order within that day.
      
      const groupsByDay = new Map<string, BillGroup[]>();
      filtered.forEach((bill) => {
        const d = new Date(bill.date);
        const dayKey = d.toISOString().split("T")[0];
        if (!groupsByDay.has(dayKey)) groupsByDay.set(dayKey, []);
        groupsByDay.get(dayKey)!.push(bill);
      });

      const finalDailyGroups: DailyGroup[] = [];
      const dayKeys = Array.from(groupsByDay.keys()).sort().reverse(); // Days always newest first

      dayKeys.forEach((dayKey) => {
        const dateObj = new Date(dayKey);
        let label = format(dateObj, "EEEE, d MMMM yyyy");
        if (isToday(dateObj)) label = `Today (${label})`;
        else if (isYesterday(dateObj)) label = `Yesterday (${label})`;

        // Valid bills for this day
        const dayBills = groupsByDay.get(dayKey)!;
        
        // Re-sort within the day just in case map insertion order varied, though we sorted `filtered` above.
        // If sorting by Bill No, strictly follow that order.
        dayBills.sort((a, b) => {
             if (sortOrder === "bill-desc") {
               return (parseInt(b.billNo.replace(/\D/g, "") || "0") - parseInt(a.billNo.replace(/\D/g, "") || "0"));
             }
             if (sortOrder === "bill-asc") {
               return (parseInt(a.billNo.replace(/\D/g, "") || "0") - parseInt(b.billNo.replace(/\D/g, "") || "0"));
             }
             return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        if (dayBills.length > 0) {
            finalDailyGroups.push({ dateLabel: label, bills: dayBills });
        }
      });

      setDailyGroups(finalDailyGroups);
      setLoading(false);
    }

    fetchData();
  }, [supabase, minBill, maxBill, sortOrder]);

  return (
    <div className="page">
      <div className="page-header" style={{ alignItems: "flex-end" }}>
        <div>
           <h1 className="page-title">Daily Bills</h1>
           <p className="text-sm text-gray-500 mt-1">View and manage daily transactions</p>
        </div>
        
        {/* Filter/Sort Bar */}
        <div className="flex gap-4 items-end bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
           <div className="flex flex-col gap-1">
             <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">From Bill</label>
             <input type="text" className="form-input !h-8 !text-sm !w-24" placeholder="e.g. 100" value={minBill} onChange={(e) => setMinBill(e.target.value)} />
           </div>
           <div className="flex flex-col gap-1">
             <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">To Bill</label>
             <input type="text" className="form-input !h-8 !text-sm !w-24" placeholder="e.g. 200" value={maxBill} onChange={(e) => setMaxBill(e.target.value)} />
           </div>
           <div className="flex flex-col gap-1">
             <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Sort</label>
             <select className="form-select !h-8 !text-sm !w-40" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}>
               <option value="bill-desc">Bill No (High-Low)</option>
               <option value="bill-asc">Bill No (Low-High)</option>
               <option value="date-desc">Date (Newest)</option>
             </select>
           </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">Loading ledger...</div>
      ) : dailyGroups.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300">
           <div className="text-4xl mb-2">🔍</div>
           <div className="text-gray-500 font-medium">No bills found matching your filters.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {dailyGroups.map((dayGroup) => (
            <div key={dayGroup.dateLabel}>
              <h3 className="text-md font-bold text-gray-600 mb-4 ml-1">{dayGroup.dateLabel}</h3>
              
              <div className="flex flex-col gap-6">
                {dayGroup.bills.map((bill, idx) => {
                   const uniqueKey = `${bill.billNo}-${bill.customerId}-${idx}`;
                   const isStandalone = bill.billNo === "—";
    
                   return (
                     <div key={uniqueKey} className="bill-group">
                       {/* Header */}
                       <div className="bill-header">
                          {/* Top Row: Bill No (Left) -- Customer (Right) */}
                          <div className="flex justify-between items-start">
                             <div>
                                <div className="bill-no" style={{ fontSize: 18 }}>
                                  {isStandalone ? "Standalone Trans." : `Bill No: ${bill.billNo}`}
                                </div>
                                {/* Executive Badges */}
                                {!isStandalone && bill.execs.length > 0 && (
                                  <div className="exec-wrap mt-2">
                                    <span className="exec-label">EXECUTIVE</span>
                                    <div className="exec-badges">
                                      {bill.execs.map((e) => (
                                        <span key={e} className="exec-badge">{e}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                             </div>
                             
                             {/* Customer Name on RIGHT as requested */}
                             <div className="text-right">
                                <div className="text-lg font-bold text-gray-800">{bill.customerName}</div>
                                {bill.customerId && <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Customer</div>}
                             </div>
                          </div>
    
                          {/* Summary Row */}
                          {!isStandalone && (
                            <div className="bill-summary mt-4 pt-4 border-t border-gray-100">
                              <div className="summary-item">
                                <span>Net Bill:</span> <span className="value">₹{bill.summary.billNet.toLocaleString("en-IN")}</span>
                              </div>
                              <div className="summary-item">
                                <span>Amount Paid:</span> <span className="value positive">₹{bill.summary.totalPaid.toLocaleString("en-IN")}</span>
                              </div>
                              <div className="summary-item">
                                <span>Bill Balance:</span> <span className={`value ${bill.summary.billBalance > 0 ? 'negative' : 'positive'}`}>₹{bill.summary.billBalance.toLocaleString("en-IN")}</span>
                              </div>
                            </div>
                          )}
                       </div>
    
                       {/* Table */}
                       <table className="data-table">
                         <thead>
                           <tr>
                              <th>Date</th>
                              <th>Type</th>
                              <th>Details</th>
                              <th className="text-right">Qty</th>
                              <th className="text-right">Rate</th>
                              <th className="text-right">Amount</th>
                           </tr>
                         </thead>
                         <tbody>
                           {bill.items.map((item, i) => (
                             <tr key={i}>
                               <td className="w-32">{format(new Date(item.date), "dd/MM/yyyy")}</td>
                               <td className="w-24 text-gray-600 font-medium text-xs uppercase tracking-wide">{item.type}</td>
                               <td className="text-gray-700">{item.details}</td>
                               <td className="text-right text-gray-500 w-20 font-mono text-xs">{item.qty || "—"}</td>
                               <td className="text-right text-gray-500 w-24 font-mono text-xs">
                                 {item.price_per_unit ? `₹${item.price_per_unit.toLocaleString("en-IN")}` : "—"}
                               </td>
                               <td className="text-right w-32 font-bold" style={{ color: ["Payment", "Payout"].includes(item.type) ? "#dc2626" : "#111827" }}>
                                  {["Payment", "Payout", "Discount"].includes(item.type) ? "" : "+"}
                                  ₹{Math.abs(item.amount).toLocaleString("en-IN")}
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
