"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";

export default function AccountsPartiesPage() {
  const [mode, setMode] = useState<"in" | "out">("out"); // Default to 'out' (Paying supplier)
  
  // Form State
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("Cash");
  const [refNo, setRefNo] = useState(""); 
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [parties, setParties] = useState<any[]>([]);

  // Fetch all parties on mount
  useEffect(() => {
    async function loadParties() {
      try {
        const res = await fetch("/api/parties");
        if (res.ok) {
          const data = await res.json();
          setParties(data);
        }
      } catch (e) {
        console.error("Failed to load parties", e);
      }
    }
    loadParties();
  }, []);

  /* -------------------------------- Helpers -------------------------------- */
  const handleNum = (v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
  };

  async function saveTransaction() {
    if (!partyName.trim() || !amount || parseFloat(amount) <= 0) {
      alert("Please select a Party and enter a valid Amount.");
      return;
    }
    
    // Validation for UPI/Cheque
    if ((method === "UPI" || method === "Cheque") && !refNo.trim()) {
      alert(`Please enter the ${method} Number.`);
      return;
    }

    setSaving(true);
    try {
      // Append Ref No to Notes if present
      const finalNotes = refNo ? `${notes} [${method} Ref: ${refNo}]` : notes;

      const payload = {
        type: mode, 
        partyName,
        amount: parseFloat(amount),
        date,
        method,
        notes: finalNotes,
      };

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert("✅ Saved successfully!");
        setAmount("");
        setNotes("");
        setRefNo("");
        // Keep party selected
      } else {
        const d = await res.json();
        alert("❌ Error: " + (d.error || "Unknown"));
      }
    } catch (e) {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Derived Properties
  const isPay = mode === 'out';
  const themeColor = isPay ? "green" : "rose";
  const btnColor = isPay ? "bg-green-600 hover:bg-green-700" : "bg-rose-600 hover:bg-rose-700";
  const lightBg = isPay ? "bg-green-50" : "bg-rose-50";
  const borderColor = isPay ? "border-green-200" : "border-rose-200";

  return (
    <div className="page max-w-2xl mx-auto py-8">
      
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Accounts - Parties</h1>
        <p className="text-gray-500 mt-2">Manage payments and balance adjustments for suppliers.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        
        {/* Toggle Switch */}
        <div className="bg-gray-100 p-1.5 flex gap-1 m-4 rounded-xl">
          <button
            onClick={() => setMode("out")}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all ${
              isPay 
                ? "bg-white text-green-700 shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ⬆ PAY (Out)
          </button>
          <button
            onClick={() => setMode("in")}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all ${
              !isPay 
                ? "bg-white text-rose-600 shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ⬇ RECEIVE (In)
          </button>
        </div>

        {/* Dynamic Context Banner */}
        <div className={`mx-6 mb-6 p-4 rounded-xl border ${lightBg} ${borderColor} flex gap-3 items-start`}>
            <div className={`text-2xl ${isPay ? "text-green-600" : "text-rose-600"}`}>
                {isPay ? "💸" : "💰"}
            </div>
            <div>
                <h3 className={`font-bold text-sm uppercase tracking-wide ${isPay ? "text-green-800" : "text-rose-800"}`}>
                    {isPay ? "Recording Payment Made" : "Recording Money Received"}
                </h3>
                <p className={`text-sm ${isPay ? "text-green-700" : "text-rose-700"} opacity-90 leading-snug mt-1`}>
                    {isPay 
                     ? "You are paying the supplier. This will DECREASE the amount you owe them." 
                     : "You are receiving money (or credit). This will INCREASE the amount you owe them."}
                </p>
            </div>
        </div>

        <div className="px-8 pb-8 space-y-6">

          {/* Amount Box */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Transaction Amount (₹)</label>
            <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-2xl font-light">₹</span>
                <input
                    type="text"
                    className="w-full pl-10 pr-4 py-4 text-3xl font-bold text-gray-800 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleNum(e.target.value)}
                />
            </div>
          </div>

          {/* Party Selection */}
          <div>
             <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Party / Supplier</label>
             <select 
                className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl text-gray-700 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all appearance-none cursor-pointer"
                value={partyName} 
                onChange={(e) => setPartyName(e.target.value)}
              >
                <option value="">-- Choose Supplier --</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
          </div>

          <div className="grid grid-cols-2 gap-5">
             {/* Payment Method */}
             <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Method</label>
                <select
                  className="w-full h-11 px-3 bg-white border border-gray-300 rounded-lg text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Cheque</option>
                  <option>Bank Transfer</option>
                </select>
              </div>

             {/* Date */}
             <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
                <input
                  type="date"
                  className="w-full h-11 px-3 bg-white border border-gray-300 rounded-lg text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
          </div>

          {(method === "UPI" || method === "Cheque") && (
            <div className="animate-fade-in-down">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{method} Reference No.</label>
                <input
                    type="text"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    placeholder={`Enter ${method} Transaction ID / Check No.`}
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notes (Optional)</label>
            <textarea
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all resize-y min-h-[80px]"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g. Bill No 123, Account Correction, etc."
            />
          </div>

          {/* Action Button */}
          <button
            className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all active:scale-[0.98] active:shadow-none hover:shadow-xl ${btnColor} ${saving ? "opacity-70 cursor-wait" : ""}`}
            onClick={saveTransaction}
            disabled={saving}
          >
            {saving ? "Processing..." : isPay ? "Confirm Payment (Minus)" : "Confirm Receipt (Add)"}
          </button>

        </div>
      </div>
      
      {/* Quick Footer Links */}
      <div className="text-center mt-8 space-x-6 text-sm text-gray-400">
        <span>Need to add a new party?</span>
        <a href="/parties" className="text-blue-600 hover:text-blue-800 font-medium underline">Manage Parties</a>
      </div>

    </div>
  );
}
