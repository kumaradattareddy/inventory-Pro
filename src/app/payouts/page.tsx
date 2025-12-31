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

  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payouts Tracker</h1>
            <p className="text-sm text-gray-500 font-medium mt-1">Monitor expenses and strict payouts to external parties.</p>
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
                <div className="h-12 w-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-.53 14.03a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V8.25a.75.75 0 0 0-1.5 0v5.69l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3Z" clipRule="evenodd" />
                    </svg>
                </div>
           </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Recipient</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Details / Notes</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {loading ? (
                    <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400 font-medium">Loading payouts...</td>
                    </tr>
                ) : payouts.length === 0 ? (
                    <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400 font-medium">No payouts found in this period</td>
                    </tr>
                ) : (
                    payouts.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="py-3 px-4 text-sm font-medium text-gray-900 border-l-4 border-transparent hover:border-red-400">
                                {format(new Date(p.created_at), "dd MMM yyyy")}
                                <div className="text-xs text-gray-400 font-normal">{format(new Date(p.created_at), "h:mm a")}</div>
                            </td>
                            <td className="py-3 px-4 text-sm font-bold text-gray-800">
                                {p.other_name}
                                {p.method && <span className="ml-2 text-xs font-normal text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 capitalize">{p.method}</span>}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                                {p.notes || "—"}
                                {p.bill_no && <div className="text-xs text-gray-400 mt-0.5">Ref Bill: {p.bill_no}</div>}
                            </td>
                            <td className="py-3 px-4 text-sm font-bold text-red-600 text-right font-feature-settings-tnum">
                                -₹{p.amount.toLocaleString("en-IN")}
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
