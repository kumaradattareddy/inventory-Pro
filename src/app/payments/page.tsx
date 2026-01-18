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
  const mainColor = isPay ? "#16a34a" : "#e11d48"; // Green vs Rose
  const bgColor = isPay ? "#f0fdf4" : "#fff1f2"; // Light Green vs Light Rose
  const borderColor = isPay ? "#bbf7d0" : "#fecdd3";

  return (
    <div className="page" style={{ maxWidth: "700px", margin: "0 auto", paddingBottom: "40px", fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px", marginTop: "16px" }}>
        <h1 className="page-title" style={{ fontSize: "28px", marginBottom: "8px", fontWeight: "800", color: "#111827" }}>Accounts - Parties</h1>
        <p style={{ color: "#6b7280", margin: 0, fontSize: "15px" }}>Manage payments and adjustments for suppliers.</p>
      </div>

      <div className="card" style={{ overflow: "hidden", border: "1px solid #e5e7eb", borderRadius: "16px", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)", background: "white" }}>
        
        {/* Toggle Switch */}
        <div style={{ background: "#f3f4f6", padding: "6px", display: "flex", gap: "6px", margin: "20px", borderRadius: "12px" }}>
           <button
             onClick={() => setMode("out")}
             style={{
                flex: 1,
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                fontWeight: "700",
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 0.2s",
                background: isPay ? "white" : "transparent",
                color: isPay ? "#15803d" : "#6b7280",
                boxShadow: isPay ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
             }}
           >
             <span>📤</span> PAY (Out)
           </button>
           <button
             onClick={() => setMode("in")}
             style={{
                flex: 1,
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                fontWeight: "700",
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 0.2s",
                background: !isPay ? "white" : "transparent",
                color: !isPay ? "#be123c" : "#6b7280",
                boxShadow: !isPay ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
             }}
           >
             <span>📥</span> RECEIVE (In)
           </button>
        </div>

        {/* Context Banner */}
        <div style={{ 
            margin: "0 24px 24px", 
            padding: "20px",
            borderRadius: "12px", 
            background: bgColor, 
            border: `1px solid ${borderColor}`,
            display: "flex",
            gap: "16px",
            alignItems: "flex-start"
        }}>
            <div style={{ fontSize: "32px", lineHeight: 1 }}>{isPay ? "💸" : "💰"}</div>
            <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: "700", color: isPay ? "#166534" : "#9f1239", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {isPay ? "Recording Payment Made" : "Recording Money Received"}
                </h3>
                <p style={{ margin: 0, fontSize: "14px", color: isPay ? "#15803d" : "#be123c", opacity: 0.9, lineHeight: "1.4" }}>
                    {isPay 
                     ? "You are paying the supplier. This will DECREASE the amount you owe them." 
                     : "You are receiving money. This will INCREASE the amount you owe (or add a charge)."}
                </p>
            </div>
        </div>

        <div style={{ padding: "0 32px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Amount Box */}
          <div>
            <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "8px", display: "block" }}>
                Transaction Amount (₹)
            </label>
            <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", fontSize: "24px", color: "#9ca3af", fontWeight: 300 }}>₹</span>
                <input
                    type="number"
                    className="form-input"
                    style={{ 
                        paddingLeft: "40px", 
                        paddingRight: "16px", 
                        paddingTop: "16px", 
                        paddingBottom: "16px",
                        height: "auto", 
                        fontSize: "32px", 
                        fontWeight: "700", 
                        color: "#1f2937",
                        borderRadius: "12px",
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        width: "100%",
                        outline: "none"
                    }}
                    onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(59, 130, 246, 0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleNum(e.target.value)}
                />
            </div>
          </div>

          {/* Party Selection */}
          <div>
             <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "8px", display: "block" }}>
                Select Party / Supplier
             </label>
             <select 
                className="form-select"
                style={{ height: "48px", fontSize: "16px", width: "100%", padding: "0 12px" }}
                value={partyName} 
                onChange={(e) => setPartyName(e.target.value)}
              >
                <option value="">-- Choose Supplier --</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
             {/* Payment Method */}
             <div>
                <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "8px", display: "block" }}>Method</label>
                <select
                  className="form-select"
                  style={{ height: "44px", width: "100%" }}
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
                <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "8px", display: "block" }}>Date</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ height: "44px", width: "100%" }}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
          </div>

          {(method === "UPI" || method === "Cheque") && (
            <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "8px", display: "block" }}>{method} Reference No.</label>
                <input
                    type="text"
                    className="form-input"
                    style={{ height: "44px", width: "100%", background: "#f9fafb" }}
                    placeholder={`Enter ${method} Transaction ID / Check No.`}
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "8px", display: "block" }}>Notes (Optional)</label>
            <textarea
                className="form-input"
                style={{ height: "auto", minHeight: "80px", resize: "vertical", width: "100%", padding: "12px" }}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g. Bill No 123, Account Correction, etc."
            />
          </div>

          {/* Action Button */}
          <button
            style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "none",
                background: mainColor,
                color: "white",
                fontSize: "18px",
                fontWeight: "700",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                transition: "transform 0.1s"
            }}
            onClick={saveTransaction}
            disabled={saving}
            onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            type="button"
          >
            {saving ? "Processing..." : isPay ? "Confirm Payment (Minus)" : "Confirm Receipt (Add)"}
          </button>

        </div>
      </div>
      
      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: "32px", fontSize: "14px", color: "#9ca3af" }}>
        <span style={{ marginRight: "6px" }}>Need to add a new party?</span>
        <a href="/parties" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>Manage Parties</a>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
}
