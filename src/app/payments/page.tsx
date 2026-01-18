"use client";

import { useState, useEffect } from "react";

export default function AdjustmentsPage() {
  const [mode, setMode] = useState<"in" | "out" | "adj_debit" | "adj_credit">("in");
  
  // Form State
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Cash");
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
    setSaving(true);
    try {
      const payload = {
        type: mode,
        partyName,
        amount: parseFloat(amount),
        date,
        method: mode.startsWith("adj") ? null : method, // No method for adjustments
        notes,
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
        // Keep party selected or clear? Usually keep for rapid entry, but user can change.
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

  return (
    <div className="page max-w-4xl mx-auto">
      <div className="page-header mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Accounts - Parties</h1>
        <p className="text-gray-500">Manage Party Dues & Payments</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <div onClick={() => setMode("in")} style={{ flex: 1, padding: '12px', textAlign: 'center', cursor: 'pointer', borderBottom: mode === 'in' ? '4px solid #2563eb' : '4px solid transparent', backgroundColor: mode === 'in' ? '#eff6ff' : 'transparent', color: mode === 'in' ? '#1d4ed8' : '#6b7280', fontWeight: 600 }}>
            ⬇ Receive (In)
          </div>
          <div onClick={() => setMode("out")} style={{ flex: 1, padding: '12px', textAlign: 'center', cursor: 'pointer', borderBottom: mode === 'out' ? '4px solid #2563eb' : '4px solid transparent', backgroundColor: mode === 'out' ? '#eff6ff' : 'transparent', color: mode === 'out' ? '#1d4ed8' : '#6b7280', fontWeight: 600 }}>
            ⬆ Pay (Out)
          </div>
          <div onClick={() => setMode("adj_debit")} style={{ flex: 1, padding: '12px', textAlign: 'center', cursor: 'pointer', borderBottom: mode === 'adj_debit' ? '4px solid #2563eb' : '4px solid transparent', backgroundColor: mode === 'adj_debit' ? '#eff6ff' : 'transparent', color: mode === 'adj_debit' ? '#1d4ed8' : '#6b7280', fontWeight: 600 }}>
            ➕ Add Charge
          </div>
          <div onClick={() => setMode("adj_credit")} style={{ flex: 1, padding: '12px', textAlign: 'center', cursor: 'pointer', borderBottom: mode === 'adj_credit' ? '4px solid #2563eb' : '4px solid transparent', backgroundColor: mode === 'adj_credit' ? '#eff6ff' : 'transparent', color: mode === 'adj_credit' ? '#1d4ed8' : '#6b7280', fontWeight: 600 }}>
            ➖ Add Discount
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8 grid gap-6">
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700 mb-2">
            {mode === "in" && "Recording money RECEIVED FROM a Customer. Increases cash, Reduces their balance."}
            {mode === "out" && "Recording money PAID TO a Party (Customer/Vendor). Reduces cash, Increases their balance (if customer)."}
            {mode === "adj_debit" && "Adding a CHARGE to a Customer (e.g. Penalty, Old Balance). No cash movement. Increases their balance."}
            {mode === "adj_credit" && "Giving a DISCOUNT/WAIVER to a Customer. No cash movement. Reduces their balance."}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">Select Party / Customer</label>
              <select 
                className="form-select w-full" 
                value={partyName} 
                onChange={(e) => setPartyName(e.target.value)}
              >
                <option value="">-- Select Party --</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Amount (₹)</label>
              <input
                className="form-input text-lg font-bold"
                value={amount}
                onChange={(e) => handleNum(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {!mode.startsWith("adj") && (
              <div>
                <label className="form-label">Payment Method</label>
                <select
                  className="form-select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Cheque</option>
                  <option>Bank Transfer</option>
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="form-label">Notes / Reference</label>
              <input
                className="form-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  mode.startsWith("adj") ? "Reason for adjustment..." : "Bill No, Transaction ID, etc."
                }
              />
            </div>
          </div>

          <button
            className={`w-full py-3 mt-4 rounded-lg text-white font-bold text-lg transition-transform active:scale-[0.98] ${
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:bg-gray-800"
            }`}
            onClick={saveTransaction}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
