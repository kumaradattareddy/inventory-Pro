"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    setParties(initialParties);
  }, [initialParties]);
  
  // Filtered Parties
  const filtered = parties.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary stats
  const totalDue = parties.reduce((s, p) => s + Math.max(p.balance, 0), 0);
  const totalOverpaid = parties.reduce((s, p) => s + Math.max(-p.balance, 0), 0);
  const suppliersWithDue = parties.filter(p => p.balance > 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "-28px -8px 0 -8px", width: "calc(100% + 16px)" }}>
      {/* Header with Total Payable at top right */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div>
           <h1 className="text-3xl font-bold text-gray-900">Parties</h1>
           <p className="text-gray-500" style={{ marginTop: 4 }}>Track supplier balances and ledger history.</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9f1239", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Payable
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#be123c", marginTop: 2, letterSpacing: "-0.02em" }}>
            ₹{totalDue.toLocaleString("en-IN")}
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
                  <td style={{ padding: "16px 20px", color: "#334155", fontWeight: 500, fontSize: 14 }}>
                    {p.name}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", color: "#64748b", fontSize: 14, fontWeight: 500 }}>
                    ₹{p.totalPurchases.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right", color: "#15803d", fontSize: 14, fontWeight: 600 }}>
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
                    <Link 
                      href={`/parties/${p.id}`}
                      style={{
                        display: "inline-block",
                        padding: "6px 16px",
                        background: "#2563eb",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 6,
                        textDecoration: "none",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#1d4ed8")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#2563eb")}
                    >
                      View
                    </Link>
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
    </div>
  );
}
