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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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
      // CORRECTION: Group strictly by Bill No to ensure Payouts (null cid) merge with Sales (valid cid) if Bill No matches.
      const billGroupsMap = new Map<string, Transaction[]>();
      const standaloneItems: Transaction[] = [];

      transactions.forEach((t) => {
        if (t.bill_no && t.bill_no !== "—") {
          // Normalize bill no just in case
          const key = t.bill_no;
          if (!billGroupsMap.has(key)) billGroupsMap.set(key, []);
          billGroupsMap.get(key)!.push(t);
        } else {
          standaloneItems.push(t);
        }
      });

      const processedBills: BillGroup[] = [];

      // Process Bill Groups
      for (const [billNo, items] of billGroupsMap.entries()) {
        const sortedItems = items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const firstItem = sortedItems[0];
        
        // Resolve Customer from ANY item in the group (finding the first non-null occurrence)
        const validItemWithCustomer = items.find(i => i.customer_id) || firstItem;
        const customerId = validItemWithCustomer.customer_id;
        const customerName = validItemWithCustomer.customer_name || "";

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
          billNo: billNo,
          customerId: customerId,
          customerName: customerName,
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

      // Filter by Date Range
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate).getTime() : 0;
        // End date should be inclusive
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;

        filtered = filtered.filter(b => {
           const bDate = new Date(b.date).getTime();
           return bDate >= start && bDate <= end;
        });
      }

      // ---------------- Sorting Logic ---------------- //
      filtered.sort((a, b) => {
        if (sortOrder === "bill-desc" || sortOrder === "bill-asc") {
          const nA = parseInt(a.billNo.replace(/\D/g, "") || "0");
          const nB = parseInt(b.billNo.replace(/\D/g, "") || "0");
          if (sortOrder === "bill-desc") return nB - nA;
          return nA - nB;
        }
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      // 5. Group by Day
      const groupsByDay = new Map<string, BillGroup[]>();
      filtered.forEach((bill) => {
        const d = new Date(bill.date);
        const dayKey = d.toISOString().split("T")[0];
        if (!groupsByDay.has(dayKey)) groupsByDay.set(dayKey, []);
        groupsByDay.get(dayKey)!.push(bill);
      });

      const finalDailyGroups: DailyGroup[] = [];
      const dayKeys = Array.from(groupsByDay.keys()).sort().reverse(); 

      dayKeys.forEach((dayKey) => {
        const dateObj = new Date(dayKey);
        let label = format(dateObj, "EEEE, d MMMM yyyy");
        if (isToday(dateObj)) label = `Today (${label})`;
        else if (isYesterday(dateObj)) label = `Yesterday (${label})`;

        // Valid bills for this day
        const dayBills = groupsByDay.get(dayKey)!;
        
        // Re-sort within the day
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
  }, [supabase, startDate, endDate, sortOrder]);

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
             <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">From Date</label>
             <input type="date" className="form-input !h-8 !text-sm !w-36" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
           </div>
           <div className="flex flex-col gap-1">
             <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">To Date</label>
             <input type="date" className="form-input !h-8 !text-sm !w-36" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
                     <div key={uniqueKey} className="db-card">
                       {/* Header */}
                       <div className="db-header">
                          {/* Top Row: Identity & Customer */}
                          <div className="db-identity-row">
                             {/* Left: Bill Info */}
                             <div className="db-bill-info">
                                <div className="db-bill-no-row">
                                   <span className="db-bill-no">
                                     {isStandalone ? "Transaction" : `Bill No: ${bill.billNo}`}
                                   </span>
                                   
                                   {/* Executive Badges */}
                                   {!isStandalone && bill.execs.length > 0 && bill.execs.map((e) => (
                                     <span key={e} className="db-exec-badge">
                                       {e}
                                     </span>
                                   ))}
                                </div>
                                <div className="db-date">
                                   {format(new Date(bill.date), "dd MMMM yyyy")}
                                </div>
                             </div>
                             
                             {/* Right: Customer Info */}
                             <div className="db-customer-info">
                                <div className="db-customer-name">{bill.customerName}</div>
                                {bill.customerId && (
                                  <div className="db-customer-label">Customer</div>
                                )}
                             </div>
                          </div>

                          {/* Bottom Row: Financial Stats */}
                          {!isStandalone && (
                            <div className="db-stats-row">
                               {/* Net Bill */}
                               <div className="db-stat-item">
                                  <span className="db-stat-label">Net Bill</span>
                                  <span className="db-stat-value">₹{bill.summary.billNet.toLocaleString("en-IN")}</span>
                               </div>
                               
                               {/* Amount Paid */}
                               <div className="db-stat-item center">
                                  <span className="db-stat-label">Amount Paid</span>
                                  <span className="db-stat-value green">₹{bill.summary.totalPaid.toLocaleString("en-IN")}</span>
                               </div>
                               
                               {/* Balance */}
                               <div className="db-stat-item right">
                                  <span className="db-stat-label">Balance</span>
                                  <span className={`db-stat-value ${bill.summary.billBalance > 0 ? 'red' : 'green'}`}>
                                    ₹{bill.summary.billBalance.toLocaleString("en-IN")}
                                  </span>
                               </div>
                            </div>
                          )}
                       </div>
    
                       {/* Table */}
                       <table className="db-table">
                         <thead>
                           <tr>
                              <th>Date</th>
                              <th>Type</th>
                              <th>Details</th>
                              <th className="right">Qty</th>
                              <th className="right">Rate</th>
                              <th className="right">Amount</th>
                           </tr>
                         </thead>
                         <tbody>
                           {bill.items.map((item, i) => (
                             <tr key={i}>
                               <td style={{ width: 140 }}>
                                 {format(new Date(item.date), "dd/MM/yyyy")}
                               </td>
                               <td style={{ width: 100 }}>
                                 <span className="db-table-type">{item.type}</span>
                               </td>
                               <td className="text-gray-700">{item.details}</td>
                               <td className="db-amount right" style={{ color: "#6b7280", width: 80 }}>
                                 {item.qty || "—"}
                               </td>
                               <td className="db-amount right" style={{ color: "#6b7280", width: 100 }}>
                                 {item.price_per_unit ? `₹${item.price_per_unit.toLocaleString("en-IN")}` : "—"}
                               </td>
                               <td className={`db-amount right ${["Payment", "Payout", "Discount"].includes(item.type) ? 'minus' : 'plus'}`} style={{ width: 140 }}>
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
