"use client";

import { useState, useEffect } from "react";

export default function AccountsPartiesPage() {
  const [mode, setMode] = useState<"in" | "out">("out"); // Default to 'out' (Paying supplier)
  
  // Form State
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Cash");
  const [refNo, setRefNo] = useState(""); // For UPI/Cheque number
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
        alert("✅ Transaction saved successfully!");
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

  // Styles for tabs
  const tabStyle = (active: boolean, color: string) => ({
    flex: 1,
    padding: '16px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    borderBottom: active ? `4px solid ${color}` : '4px solid transparent',
    backgroundColor: active ? (color === '#10b981' ? '#ecfdf5' : '#fee2e2') : 'transparent',
    color: active ? (color === '#10b981' ? '#047857' : '#b91c1c') : '#6b7280',
    fontWeight: 600,
    fontSize: '1.1rem',
    transition: 'all 0.2s'
  });

  return (
    <div className="page max-w-3xl mx-auto">
      <div className="page-header mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Accounts - Parties</h1>
        <p className="text-gray-500">Manage Party Dues & Payments</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Simplified Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <div 
            onClick={() => setMode("out")} 
            style={tabStyle(mode === 'out', '#10b981')}
          >
            ⬆ Pay (Minus / Out)
          </div>
          <div 
            onClick={() => setMode("in")} 
            style={tabStyle(mode === 'in', '#ef4444')} 
          >
            ⬇ Receive (Add / In)
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8 grid gap-6">
          <div className={`p-4 rounded-lg border text-sm mb-2 ${mode === 'out' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
            {mode === "out" 
              ? "✅ You are PAYING the supplier. This will DECREASE the amount you owe them." 
              : "⚠️ You are RECEIVING money (or adding a charge). This will INCREASE the amount you owe them (or reduce their credit)."
            }
          </div>

          <div className="grid gap-6">
            {/* Row 1: Party */}
            <div>
              <label className="form-label text-base">Select Party / Supplier</label>
              <select 
                className="form-select w-full text-lg p-3" 
                value={partyName} 
                onChange={(e) => setPartyName(e.target.value)}
              >
                <option value="">-- Select Party --</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Row 2: Amount & Date */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="form-label text-base">Amount (₹)</label>
                <input
                  className="form-input text-xl font-bold"
                  value={amount}
                  onChange={(e) => handleNum(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="form-label text-base">Date</label>
                <input
                  type="date"
                  className="form-input text-lg"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            {/* Row 3: Method & Ref */}
            <div className="grid grid-cols-2 gap-6">
               <div>
                <label className="form-label text-base">Payment Method</label>
                <select
                  className="form-select text-lg"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Cheque</option>
                  <option>Bank Transfer</option>
                </select>
              </div>
              
              {(method === "UPI" || method === "Cheque") && (
                <div>
                   <label className="form-label text-base">{method} Number / Ref</label>
                   <input
                    className="form-input text-lg"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    placeholder={`Enter ${method} No.`}
                   />
                </div>
              )}
            </div>

            {/* Row 4: Notes */}
            <div>
              <label className="form-label text-base">Notes / Reason</label>
              <textarea
                className="form-input w-full"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g. Bill Payment, Discount, Adjustment..."
              />
            </div>
          </div>

          <button
            className={`w-full py-4 mt-2 rounded-lg text-white font-bold text-xl shadow-lg transition-transform active:scale-[0.98] ${
              saving 
                ? "bg-gray-400 cursor-not-allowed" 
                : mode === 'out' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}
            onClick={saveTransaction}
            disabled={saving}
          >
            {saving ? "Saving..." : mode === 'out' ? "Record Payment (Minus)" : "Record Receipt (Add)"}
          </button>
        </div>
      </div>
    </div>
  );
}
