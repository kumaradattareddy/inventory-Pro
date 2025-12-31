"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

type Payout = {
  id: string;
  created_at: string; // ts from view/table
  other_name: string;
  amount: number;
  notes: string | null;
  bill_no: string | null;
  method: string | null;
};

export default function PayoutsPage() {
  const supabase = createClient();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  // Default filters: Current Month
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 10);
  });

  useEffect(() => {
    async function fetchPayouts() {
      setLoading(true);
      try {
        let query = supabase
          .from("payments")
          .select("*")
          .eq("party_type", "others")
          .eq("direction", "out")
          .order("ts", { ascending: false });

        if (startDate) query = query.gte("ts", `${startDate}T00:00:00`);
        if (endDate) query = query.lte("ts", `${endDate}T23:59:59`);

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching payouts:", error);
        } else {
            const mapped = (data || []).map((p: any) => ({
                id: p.id,
                created_at: p.ts,
                other_name: p.other_name || "Unknown",
                amount: Number(p.amount) || 0,
                notes: p.notes,
                bill_no: p.bill_no,
                method: p.method
            }));
            setPayouts(mapped);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPayouts();
  }, [startDate, endDate]);

  // Grouping Logic
  type GroupedPayout = {
    name: string;
    totalAmount: number;
    count: number;
    items: Payout[];
  };

  const [groupedPayouts, setGroupedPayouts] = useState<GroupedPayout[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<GroupedPayout | null>(null);

  useEffect(() => {
    // ... existing fetch logic ...
    // After setting payouts, group them
    const groups: Record<string, GroupedPayout> = {};
    payouts.forEach(p => {
        const name = p.other_name;
        if (!groups[name]) {
            groups[name] = { name, totalAmount: 0, count: 0, items: [] };
        }
        groups[name].totalAmount += p.amount;
        groups[name].count += 1;
        groups[name].items.push(p);
    });
    setGroupedPayouts(Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount));
  }, [payouts]);


  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);

  // VIEW: DETAILS FOR ONE RECIPIENT
  if (selectedRecipient) {
      return (
        <div className="page">
            <div className="flex items-center gap-4 mb-6">
                <button 
                  onClick={() => setSelectedRecipient(null)}
                  className="p-2 -ml-2 text-gray-400 hover:text-gray-900 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                    </svg>
                </button>
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">{selectedRecipient.name}</h1>
                    <p className="text-sm text-gray-500 font-medium">Payout History</p>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Details</th>
                             <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {selectedRecipient.items.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="py-3 px-4 text-sm font-medium text-gray-900">
                                    {format(new Date(p.created_at), "dd MMM yyyy")}
                                    <div className="text-xs text-gray-400 font-normal">{format(new Date(p.created_at), "h:mm a")}</div>
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-600">
                                    <div className="flex items-center gap-2">
                                        <span>{p.notes || "Payout"}</span>
                                        {p.method && <span className="text-[10px] uppercase border border-gray-200 px-1 rounded text-gray-400">{p.method}</span>}
                                    </div>
                                    {p.bill_no && <div className="text-xs text-gray-400 mt-0.5">Ref Bill: {p.bill_no}</div>}
                                </td>
                                <td className="py-3 px-4 text-sm font-bold text-red-600 text-right font-feature-settings-tnum">
                                    ₹{p.amount.toLocaleString("en-IN")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-100">
                        <tr>
                            <td colSpan={2} className="py-3 px-4 text-sm font-bold text-gray-900 text-right">Total</td>
                            <td className="py-3 px-4 text-sm font-black text-red-600 text-right">₹{selectedRecipient.totalAmount.toLocaleString("en-IN")}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
      );
  }

  // VIEW: GROUPED OVERVIEW
  return (
    <div className="page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payouts Tracker</h1>
            <p className="text-sm text-gray-500 font-medium mt-1">Monitor expenses by recipient.</p>
        </div>
        
        <div className="flex flex-wrap gap-4 items-end bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">From Date</label>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">To Date</label>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 mb-8">
           <div className="bg-gradient-to-br from-red-50 to-white border border-red-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div>
                     <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Total Payouts</h3>
                     <div className="text-4xl font-black text-gray-900 font-feature-settings-tnum">
                        ₹{totalPayouts.toLocaleString("en-IN")}
                     </div>
                     <div className="text-sm font-medium text-gray-500 mt-1">
                        For selected period
                     </div>
                </div>
           </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Recipient</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Transactions</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total Amount</th>
                    <th className="w-10"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {loading ? (
                    <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400 font-medium">Loading payouts...</td>
                    </tr>
                ) : groupedPayouts.length === 0 ? (
                    <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400 font-medium">No payouts found in this period</td>
                    </tr>
                ) : (
                    groupedPayouts.map((g) => (
                        <tr 
                            key={g.name} 
                            onClick={() => setSelectedRecipient(g)}
                            className="hover:bg-gray-50/80 transition-colors cursor-pointer group"
                        >
                            <td className="py-4 px-4 text-sm font-bold text-gray-900 border-l-4 border-transparent group-hover:border-red-400">
                                {g.name}
                            </td>
                            <td className="py-4 px-4 text-sm text-gray-600 text-right">
                                {g.count}
                            </td>
                            <td className="py-4 px-4 text-sm font-black text-red-600 text-right font-feature-settings-tnum">
                                ₹{g.totalAmount.toLocaleString("en-IN")}
                            </td>
                            <td className="py-4 px-4 text-gray-300 group-hover:text-red-400 text-right">
                                →
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
}
