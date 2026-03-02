"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";

type PartyData = {
  id: number;
  name: string;
  totalPurchases: number;
  totalPaid: number;
  balance: number;
};

export default function PartiesList({ initialParties }: { initialParties: PartyData[] }) {
  const [parties, setParties] = useState(initialParties);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Payment Modal State
  const [selectedParty, setSelectedParty] = useState<PartyData | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("Cash");
  const [refNo, setRefNo] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"in" | "out">("out");
  const [saving, setSaving] = useState(false);

  // Filtered Parties
  const filtered = parties.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary stats
  const totalDue = parties.reduce((s, p) => s + Math.max(p.balance, 0), 0);
  const totalOverpaid = parties.reduce((s, p) => s + Math.max(-p.balance, 0), 0);
  const suppliersWithDue = parties.filter(p => p.balance > 0).length;

  const openPaymentModal = (party: PartyData) => {
    setSelectedParty(party);
    setAmount("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setMethod("Cash");
    setRefNo("");
    setNotes("");
    setMode("out");
  };

  const closePaymentModal = () => {
    setSelectedParty(null);
  };

  const handleSavePayment = async () => {
    if (!selectedParty || !amount || parseFloat(amount) <= 0) {
      alert("Invalid Amount");
      return;
    }

    setSaving(true);
    try {
        const finalNotes = refNo ? `${notes} [${method} Ref: ${refNo}]` : notes;
        
        const payload = {
            type: mode,
            partyName: selectedParty.name,
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
            alert("✅ Transaction Saved!");
            
            const amt = parseFloat(amount);
            setParties(parties.map(p => {
                if (p.id === selectedParty.id) {
                    const newPaid = p.totalPaid + (mode === 'out' ? amt : -amt);
                    return {
                        ...p,
                        totalPaid: newPaid,
                        balance: p.totalPurchases - newPaid
                    };
                }
                return p;
            }));
            closePaymentModal();
        } else {
            const d = await res.json();
            alert("Error: " + d.error);
        }
    } catch (e) {
        console.error(e);
        alert("Failed to save");
    } finally {
        setSaving(false);
    }
  };

  const isPay = mode === 'out';

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <div style={{
          background: "linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)",
          border: "1px solid #fecdd3",
          borderRadius: 12,
          padding: "20px 24px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9f1239", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Payable
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#be123c", marginTop: 4, letterSpacing: "-0.02em" }}>
            ₹{totalDue.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 12, color: "#e11d48", marginTop: 4 }}>
            {suppliersWithDue} supplier{suppliersWithDue !== 1 ? "s" : ""} with dues
          </div>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          border: "1px solid #bfdbfe",
          borderRadius: 12,
          padding: "20px 24px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Suppliers
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1d4ed8", marginTop: 4, letterSpacing: "-0.02em" }}>
            {parties.length}
          </div>
          <div style={{ fontSize: 12, color: "#2563eb", marginTop: 4 }}>
            Active supplier accounts
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          color: "#9ca3af", fontSize: 16, pointerEvents: "none"
        }}>🔍</span>
        <input 
          style={{
            width: "100%",
            padding: "12px 16px 12px 42px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 15,
            backgroundColor: "#fff",
            outline: "none",
            boxSizing: "border-box",
          }}
          placeholder="Search suppliers..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Supplier</th>
              <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Bought</th>
              <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Paid</th>
              <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Balance Due</th>
              <th style={{ padding: "14px 20px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const isDue = p.balance > 0;
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "16px 20px" }}>
                    <Link href={`/parties/${p.id}`} style={{ 
                      color: "#2563eb", fontWeight: 600, textDecoration: "underline", fontSize: 14,
                      textDecorationColor: "#bfdbfe",
                      textUnderlineOffset: "3px",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1d4ed8"; (e.currentTarget as HTMLAnchorElement).style.textDecorationColor = "#2563eb"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#2563eb"; (e.currentTarget as HTMLAnchorElement).style.textDecorationColor = "#bfdbfe"; }}
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", color: "#64748b", fontSize: 14, fontWeight: 500 }}>
                    ₹{p.totalPurchases.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", color: "#64748b", fontSize: 14, fontWeight: 500 }}>
                    ₹{p.totalPaid.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      background: isDue ? "#fef2f2" : "#f0fdf4",
                      color: isDue ? "#be123c" : "#15803d",
                      border: `1px solid ${isDue ? "#fecdd3" : "#bbf7d0"}`,
                    }}>
                      ₹{p.balance.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "center" }}>
                    <button 
                      onClick={() => openPaymentModal(p)}
                      style={{
                        padding: "8px 18px",
                        background: "#111827",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                      }}
                    >
                      Pay / Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAYMENT MODAL */}
      {selectedParty && (
        <div style={{
          position: "fixed", inset: 0, 
          background: "rgba(0,0,0,0.4)", 
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 16,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            width: "100%",
            maxWidth: 480,
            overflow: "hidden",
            animation: "fadeIn 0.2s ease",
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid #f1f5f9",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{selectedParty.name}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  Balance: <span style={{ fontWeight: 700, color: selectedParty.balance > 0 ? "#be123c" : "#15803d" }}>
                    ₹{selectedParty.balance.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
              <button onClick={closePaymentModal} style={{
                background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8",
                width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>

            {/* Mode Switcher */}
            <div style={{ display: "flex", padding: 6, margin: "16px 24px", background: "#f1f5f9", borderRadius: 10 }}>
              <button 
                onClick={() => setMode('out')}
                style={{
                  flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, borderRadius: 8,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: isPay ? "#fff" : "transparent",
                  color: isPay ? "#15803d" : "#94a3b8",
                  boxShadow: isPay ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                ⬆ PAY (Out)
              </button>
              <button 
                onClick={() => setMode('in')}
                style={{
                  flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, borderRadius: 8,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: !isPay ? "#fff" : "transparent",
                  color: !isPay ? "#be123c" : "#94a3b8",
                  boxShadow: !isPay ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                ⬇ RECEIVE (In)
              </button>
            </div>

            {/* Info Banner */}
            <div style={{
              margin: "0 24px 16px",
              padding: 12,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: isPay ? "#f0fdf4" : "#fff1f2",
              border: `1px solid ${isPay ? "#bbf7d0" : "#fecdd3"}`,
            }}>
              <span style={{ fontSize: 20 }}>{isPay ? "💸" : "💰"}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: isPay ? "#15803d" : "#be123c" }}>
                {isPay ? "Recording payment made to supplier" : "Recording money received from supplier"}
              </span>
            </div>

            {/* Form */}
            <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Amount */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</label>
                <div style={{ position: "relative", marginTop: 6 }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 18, fontWeight: 600 }}>₹</span>
                  <input 
                    autoFocus
                    type="number"
                    style={{
                      width: "100%",
                      padding: "14px 16px 14px 36px",
                      fontSize: 22,
                      fontWeight: 700,
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      outline: "none",
                      background: "#f8fafc",
                      boxSizing: "border-box",
                    }}
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                {amount && !isNaN(parseFloat(amount)) && (
                  <div style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <span style={{ color: "#64748b" }}>New Balance:</span>
                    <span style={{ fontWeight: 700, color: "#111827" }}>
                      ₹{(selectedParty.balance + (mode === 'out' ? -parseFloat(amount) : parseFloat(amount))).toLocaleString("en-IN")}
                      <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>
                        ({selectedParty.balance.toLocaleString("en-IN")} {mode === 'out' ? '−' : '+'} {parseFloat(amount).toLocaleString("en-IN")})
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Date + Method */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</label>
                  <input type="date" style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                    borderRadius: 8, marginTop: 6, fontSize: 14, boxSizing: "border-box",
                  }} value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Method</label>
                  <select style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                    borderRadius: 8, marginTop: 6, fontSize: 14, boxSizing: "border-box", background: "#fff",
                  }} value={method} onChange={e => setMethod(e.target.value)}>
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Cheque</option>
                    <option>Bank Transfer</option>
                  </select>
                </div>
              </div>

              {/* Ref No */}
              {(method === "UPI" || method === "Cheque") && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reference No</label>
                  <input style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                    borderRadius: 8, marginTop: 6, fontSize: 14, boxSizing: "border-box",
                  }} placeholder="Transaction ID..." value={refNo} onChange={e => setRefNo(e.target.value)} />
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</label>
                <input style={{
                  width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                  borderRadius: 8, marginTop: 6, fontSize: 14, boxSizing: "border-box",
                }} placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              gap: 12,
            }}>
              <button onClick={closePaymentModal} style={{
                flex: 1, padding: "12px 0", fontWeight: 600, fontSize: 14,
                color: "#64748b", background: "#f1f5f9", border: "none",
                borderRadius: 10, cursor: "pointer",
              }}>Cancel</button>
              <button 
                onClick={handleSavePayment} 
                disabled={saving}
                style={{
                  flex: 1, padding: "12px 0", fontWeight: 700, fontSize: 14,
                  color: "#fff",
                  background: isPay ? "#16a34a" : "#e11d48",
                  border: "none",
                  borderRadius: 10,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  boxShadow: `0 2px 8px ${isPay ? "rgba(22,163,74,0.3)" : "rgba(225,29,72,0.3)"}`,
                }}
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
