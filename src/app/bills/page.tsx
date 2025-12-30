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

      <div className="flex flex-col gap-12">
        {dailyGroups.map((dayGroup) => (
          <div key={dayGroup.dateLabel}>
            <div className="sticky top-0 bg-gray-50/95 backdrop-blur py-3 z-10 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-700">{dayGroup.dateLabel}</h3>
            </div>
            
            <div className="flex flex-col gap-8">
              {dayGroup.bills.map((bill, idx) => {
                 const uniqueKey = `${bill.billNo}-${bill.customerId}-${idx}`;
                 const isStandalone = bill.billNo === "—";

                 return (
                   <div key={uniqueKey} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                     {/* Card Header */}
                     <div className="p-6 pb-2">
                        {/* Row 1: Bill No & Customer */}
                        <div className="flex justify-between items-start mb-2">
                           <div>
                              <div className="text-xl font-bold text-gray-900">
                                {isStandalone ? "Transaction" : `Bill No: ${bill.billNo}`}
                              </div>
                              <div className="text-sm text-gray-500 mt-1 font-medium">{bill.customerName}</div>
                           </div>
                        </div>

                        {/* Row 2: Executive */}
                        {!isStandalone && bill.execs.length > 0 && (
                          <div className="flex items-center gap-2 mt-2 mb-4">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">EXECUTIVE</span>
                            <div className="flex gap-2">
                              {bill.execs.map(e => (
                                <span key={e} className="bg-emerald-400 text-white px-3 py-0.5 rounded-full text-sm font-medium shadow-sm">
                                  {e}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Row 3: Summary Bar */}
                        {!isStandalone && (
                          <div className="flex justify-between items-center mt-6 mb-2 text-sm border-t border-gray-50 pt-4">
                             <div className="font-semibold text-gray-600">
                               Net Bill: <span className="text-gray-900">₹{bill.summary.billNet.toLocaleString("en-IN")}</span>
                             </div>
                             
                             <div className="font-semibold text-gray-600">
                               Amount Paid: <span className="text-emerald-600">₹{bill.summary.totalPaid.toLocaleString("en-IN")}</span>
                             </div>

                             <div className="font-semibold text-gray-600">
                               Bill Balance: <span className={`text-lg ${bill.summary.billBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>₹{bill.summary.billBalance.toLocaleString("en-IN")}</span>
                             </div>
                          </div>
                        )}
                     </div>

                     {/* Table */}
                     <div className="border-t border-gray-100">
                       <table className="w-full text-left text-sm">
                         <thead className="bg-gray-50/50 text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                           <tr>
                              <th className="py-3 px-6 cursor-default">Date</th>
                              <th className="py-3 px-6 cursor-default">Type</th>
                              <th className="py-3 px-6 cursor-default w-1/3">Details</th>
                              <th className="py-3 px-6 cursor-default text-right">Qty</th>
                              <th className="py-3 px-6 cursor-default text-right">Rate</th>
                              <th className="py-3 px-6 cursor-default text-right">Amount</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-50">
                           {bill.items.map((item, i) => (
                             <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                               <td className="py-4 px-6 text-gray-600 font-medium">
                                 {format(new Date(item.date), "dd/MM/yyyy")}
                               </td>
                               <td className="py-4 px-6 text-gray-800 font-medium">{item.type}</td>
                               <td className="py-4 px-6 text-gray-600">{item.details}</td>
                               <td className="py-4 px-6 text-gray-500 text-right">{item.qty || "—"}</td>
                               <td className="py-4 px-6 text-gray-500 text-right">
                                 {item.price_per_unit ? `₹${item.price_per_unit.toLocaleString("en-IN")}` : "—"}
                               </td>
                               <td className="py-4 px-6 font-bold text-gray-900 text-right">
                                  {["Payment", "Payout", "Discount"].includes(item.type) ? "" : "+"}
                                  ₹{Math.abs(item.amount).toLocaleString("en-IN")}
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
           <div className="text-center py-20">
             <div className="text-gray-300 text-6xl mb-4">🧾</div>
             <p className="text-gray-500 text-lg">No bills found for the selected period.</p>
           </div>
        )}
      </div>
    </div>
  );
}
