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

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // 1. Fetch Customers for name lookup
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
        .order("date", { ascending: false }); // Newest first

      if (ledErr) {
        console.error("Error fetching ledger:", ledErr);
        setLoading(false);
        return;
      }

      const rows = (ledgerData ?? []) as LedgerRow[];

      // 3. Attach Customer Names
      const transactions: Transaction[] = rows.map((r) => ({
        ...r,
        customer_name: r.customer_id ? custMap.get(r.customer_id) || "Unknown" : "—",
      }));

      // 4. Group by Bill No first (to consolidate items of the same bill)
      // Note: We need to handle "No Bill" items carefully. 
      // In the context of "Daily Bills", "No Bill" items (like isolated payments) 
      // should probably be grouped by themselves or treated as separate entities.
      // For now, let's group everything by BillNo. If BillNo is null, we might group by ID or treat as unique.
      
      // Let's create a map of BillNo -> Transactions
      // For items with NO bill_no, we will treat them as individual "bills" for display purposes 
      // OR group them under a synthetic "No Bill" group for that day?
      // The user prompt says "like it shows in customer [id] page".
      // In CustomerDetail, "No Bill" is one big group. 
      // Here, across ALL customers, "No Bill" would be massive.
      // Better strategy: Group by (BillNo) OR (if BillNo is null) -> treat as standalone.
      
      // Actually, grouping strictly by BillNo is safest for Sales.
      // Non-bill transactions (like direct Payment In without bill ref) need handling.
      
      const billGroupsMap = new Map<string, Transaction[]>();
      const standaloneItems: Transaction[] = [];

      transactions.forEach(t => {
        if (t.bill_no) {
          const key = t.bill_no; // Bill numbers should be unique globally? 
          // If bill numbers are recycled per customer, we might need composite key. 
          // Assuming BillNo is unique enough or we don't care about collisions across customers for now.
          // Ideally key = `${t.bill_no}::${t.customer_id}` to be safe.
          const compositeKey = `${t.bill_no}::${t.customer_id || '0'}`;
          if (!billGroupsMap.has(compositeKey)) billGroupsMap.set(compositeKey, []);
          billGroupsMap.get(compositeKey)!.push(t);
        } else {
          standaloneItems.push(t);
        }
      });

      const processedBills: BillGroup[] = [];

      // Process Bill Groups
      for (const [key, items] of billGroupsMap.entries()) {
        const sortedItems = items.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const firstItem = sortedItems[0];
        
        // Extract Executives
        const execs = Array.from(new Set(
          sortedItems.filter(i => i.type === "Executive").map(i => i.details).filter(Boolean)
        ));
        
        const displayItems = sortedItems.filter(i => i.type !== "Executive");

        // Summary
        // Net Bill = Sale + Charge + Discount (where discount is negative usually, but check db)
        // Schema View says: `discount` -> -adj.amount. `Sale` -> positive.
        
        const billNet = displayItems
          .filter(i => ["Sale", "Charge", "Discount"].includes(i.type))
          .reduce((acc, i) => acc + i.amount, 0);

        const totalPaid = displayItems
          .filter(i => i.type === "Payment" || i.type === "Payout")
          .reduce((acc, i) => acc + Math.abs(i.amount), 0);

        const billBalance = billNet - totalPaid;

        processedBills.push({
          billNo: firstItem.bill_no!,
          customerId: firstItem.customer_id,
          customerName: firstItem.customer_name || "",
          execs,
          date: firstItem.date,
          items: displayItems,
          summary: { billNet, totalPaid, billBalance }
        });
      }

      // Process Standalone Items (convert each to a mini-bill group)
      standaloneItems.forEach(t => {
        processedBills.push({
          billNo: "—",
          customerId: t.customer_id,
          customerName: t.customer_name || "",
          execs: [],
          date: t.date,
          items: [t],
          summary: { 
            billNet: ["Sale", "Charge", "Discount"].includes(t.type) ? t.amount : 0,
            totalPaid: (t.type === "Payment" || t.type === "Payout") ? Math.abs(t.amount) : 0,
            billBalance: 0 // Not relevant for single standalone transaction usually
          }
        });
      });

      // 5. Group by Day
      // Sort all bills by their primary date desc
      processedBills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const groupsByDay = new Map<string, BillGroup[]>();
      
      processedBills.forEach(bill => {
        const d = new Date(bill.date);
        // Format: YYYY-MM-DD for sorting keys, but we want readable labels later
        const dayKey = d.toISOString().split('T')[0];
        
        if (!groupsByDay.has(dayKey)) groupsByDay.set(dayKey, []);
        groupsByDay.get(dayKey)!.push(bill);
      });

      const finalDailyGroups: DailyGroup[] = [];
      
      // Sort days descending
      const sortedDays = Array.from(groupsByDay.keys()).sort().reverse();
      
      sortedDays.forEach(dayKey => {
         const dateObj = new Date(dayKey);
         let label = format(dateObj, "EEEE, d MMMM yyyy");
         if (isToday(dateObj)) label = `Today (${label})`;
         else if (isYesterday(dateObj)) label = `Yesterday (${label})`;

         finalDailyGroups.push({
           dateLabel: label,
           bills: groupsByDay.get(dayKey)!
         });
      });

      setDailyGroups(finalDailyGroups);
      setLoading(false);
    }

    fetchData();
  }, [supabase]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading daily bills...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Daily Bills & Transactions</h1>
      </div>

      <div className="flex flex-col gap-8">
        {dailyGroups.map((dayGroup) => (
          <div key={dayGroup.dateLabel}>
            <h3 className="text-xl font-bold text-gray-700 mb-4 sticky top-0 bg-gray-50 py-2 z-10 border-b">
              {dayGroup.dateLabel}
            </h3>
            
            <div className="flex flex-col gap-6">
              {dayGroup.bills.map((bill, idx) => {
                 // Adjust unique key
                 const uniqueKey = `${bill.billNo}-${bill.customerId}-${idx}`;
                 return (
                   <div key={uniqueKey} className="card border border-gray-200 shadow-sm">
                     <div className="card-header bg-white border-b border-gray-100 py-3 px-4 flex flex-wrap justify-between items-center gap-2">
                       <div className="flex flex-col">
                         <div className="text-lg font-bold text-gray-800">
                           {bill.billNo !== "—" ? `Bill #${bill.billNo}` : "Transaction"}
                         </div>
                         <div className="text-sm text-gray-500 font-medium">
                           {bill.customerName}
                         </div>
                       </div>

                       <div className="flex flex-col items-end gap-1">
                          {bill.billNo !== "—" && (
                            <div className="text-sm">
                              <span className="text-gray-500 mr-2">Net: ₹{bill.summary.billNet.toLocaleString("en-IN")}</span>
                              <span className="text-gray-500 mr-2">Paid: <span className="text-green-600">₹{bill.summary.totalPaid.toLocaleString("en-IN")}</span></span>
                              <span className={`font-bold ${bill.summary.billBalance > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                Due: ₹{bill.summary.billBalance.toLocaleString("en-IN")}
                              </span>
                            </div>
                          )}
                          {bill.execs.length > 0 && (
                            <div className="flex gap-1">
                               {bill.execs.map(e => (
                                 <span key={e} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs border border-blue-100">
                                   {e}
                                 </span>
                               ))}
                            </div>
                          )}
                       </div>
                     </div>

                     <div className="card-body p-0">
                       <table className="w-full text-left text-sm">
                         <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                           <tr>
                              <th className="py-2 px-4 font-medium">Type</th>
                              <th className="py-2 px-4 font-medium">Details</th>
                              <th className="py-2 px-4 font-medium text-right">Qty</th>
                              <th className="py-2 px-4 font-medium text-right">Rate</th>
                              <th className="py-2 px-4 font-medium text-right">Amount</th>
                           </tr>
                         </thead>
                         <tbody>
                           {bill.items.map((item, i) => (
                             <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                               <td className="py-2 px-4 text-gray-600 w-24">{item.type}</td>
                               <td className="py-2 px-4 text-gray-800">{item.details}</td>
                               <td className="py-2 px-4 text-gray-600 text-right w-16">{item.qty || "—"}</td>
                               <td className="py-2 px-4 text-gray-600 text-right w-24">
                                 {item.price_per_unit ? `₹${item.price_per_unit.toLocaleString("en-IN")}` : "—"}
                               </td>
                               <td className="py-2 px-4 font-medium text-gray-800 text-right w-32">
                                  {item.amount < 0 ? "-" : ""}₹{Math.abs(item.amount).toLocaleString("en-IN")}
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 );
              })}
            </div>
          </div>
        ))}

        {dailyGroups.length === 0 && !loading && (
           <div className="text-center py-12 text-gray-400">No bills found.</div>
        )}
      </div>
    </div>
  );
}
