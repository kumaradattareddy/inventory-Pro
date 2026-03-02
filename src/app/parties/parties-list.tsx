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
  const [mode, setMode] = useState<"in" | "out">("out"); // out = Pay, in = Receive
  const [saving, setSaving] = useState(false);

  // Filtered Parties
  const filtered = parties.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openPaymentModal = (party: PartyData) => {
    setSelectedParty(party);
    setAmount("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setMethod("Cash");
    setRefNo("");
    setNotes("");
    setMode("out"); // Default to paying them
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
            
            // Update local state temporarily to reflect change
            const amt = parseFloat(amount);
            setParties(parties.map(p => {
                if (p.id === selectedParty.id) {
                    const newPaid = p.totalPaid + (mode === 'out' ? amt : -amt); // approximate visual update
                    // Logic: Paying (out) increases 'totalPaid', decreases Balance.
                    // Receiving (in) decreases 'totalPaid' (negative payment), increases Balance.
                    // Balance = Purchase - Paid
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

  // Styles
  const isPay = mode === 'out';
  const modalColor = isPay ? "#16a34a" : "#e11d48";
  const modalBg = isPay ? "#f0fdf4" : "#fff1f2";

  return (
    <div>
      <div className="search-container mb-4">
        <input 
            className="search-input" 
            placeholder="Search suppliers..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="table w-full">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                    <th className="p-4 text-left">Supplier</th>
                    <th className="p-4 text-right">Total Bought</th>
                    <th className="p-4 text-right">Total Paid</th>
                    <th className="p-4 text-right">Balance Due</th>
                    <th className="p-4 text-center">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {filtered.map(p => {
                    const isDue = p.balance > 0;
                    return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-medium text-gray-900">
                                <Link href={`/parties/${p.id}`} className="hover:text-blue-600 hover:underline decoration-blue-600 underline-offset-2">
                                    {p.name}
                                </Link>
                            </td>
                            <td className="p-4 text-right text-gray-500">₹{p.totalPurchases.toLocaleString("en-IN")}</td>
                            <td className="p-4 text-right text-gray-500">₹{p.totalPaid.toLocaleString("en-IN")}</td>
                            <td className="p-4 text-right">
                                <span className={`font-bold px-2 py-1 rounded ${isDue ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                    ₹{p.balance.toLocaleString("en-IN")}
                                </span>
                            </td>
                            <td className="p-4 text-center">
                                <button 
                                    onClick={() => openPaymentModal(p)}
                                    className="px-4 py-2 bg-black text-white text-sm font-bold rounded-lg shadow hover:bg-gray-800 active:scale-95 transition-all"
                                >
                                    Pay / Adjust
                                </button>
                            </td>
                        </tr>
                    );
                })}
                {filtered.length === 0 && (
                    <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400">No parties found.</td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>

      {/* MODAL OVERLAY */}
      {selectedParty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">{selectedParty.name}</h3>
                        <p className="text-sm text-gray-500">Current Balance: ₹{selectedParty.balance.toLocaleString("en-IN")}</p>
                    </div>
                    <button onClick={closePaymentModal} className="text-gray-400 hover:text-gray-600 text-2xl font-light">&times;</button>
                </div>

                {/* Switcher */}
                <div className="flex p-2 m-4 bg-gray-100 rounded-xl">
                    <button 
                        onClick={() => setMode('out')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isPay ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}
                    >
                        ⬆ PAY (Out)
                    </button>
                    <button 
                         onClick={() => setMode('in')}
                         className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isPay ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        ⬇ RECEIVE (In)
                    </button>
                </div>

                {/* Banner */}
                 <div className="mx-6 p-3 rounded-lg flex gap-3 border" style={{ background: modalBg, borderColor: isPay ? '#bbf7d0' : '#fecdd3' }}>
                    <div className="text-xl">{isPay ? "💸" : "💰"}</div>
                    <div>
                         <p style={{ fontSize: "13px", color: modalColor, fontWeight: 600 }}>
                            {isPay ? "Recording Payment Made" : "Recording Money Received"}
                         </p>
                    </div>
                 </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Amount</label>
                        <div className="relative mt-1">
                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">₹</span>
                             <input 
                                autoFocus
                                type="number"
                                className="w-full pl-8 pr-4 py-3 text-2xl font-bold border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                             />
                        </div>
                        {amount && !isNaN(parseFloat(amount)) && (
                            <div className="mt-2 text-sm flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <span className="text-gray-500">New Balance:</span>
                                <span className="font-bold text-gray-900">
                                    ₹{
                                        (selectedParty.balance + (mode === 'out' ? -parseFloat(amount) : parseFloat(amount))).toLocaleString("en-IN")
                                    }
                                    <span className="text-xs font-normal text-gray-400 ml-1">
                                        (
                                        {selectedParty.balance.toLocaleString("en-IN")} 
                                        {mode === 'out' ? ' - ' : ' + '} 
                                        {parseFloat(amount).toLocaleString("en-IN")}
                                        )
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                             <input type="date" className="w-full p-2 border rounded-lg mt-1" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                         <div>
                             <label className="text-xs font-bold text-gray-500 uppercase">Method</label>
                             <select className="w-full p-2 border rounded-lg mt-1" value={method} onChange={e => setMethod(e.target.value)}>
                                <option>Cash</option>
                                <option>UPI</option>
                                <option>Cheque</option>
                                <option>Bank Transfer</option>
                             </select>
                        </div>
                    </div>

                    {(method === "UPI" || method === "Cheque") && (
                        <div>
                             <label className="text-xs font-bold text-gray-500 uppercase">Reference No</label>
                             <input className="w-full p-2 border rounded-lg mt-1" placeholder="Transaction ID..." value={refNo} onChange={e => setRefNo(e.target.value)} />
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Notes</label>
                        <input className="w-full p-2 border rounded-lg mt-1" placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex gap-3">
                    <button onClick={closePaymentModal} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                    <button 
                        onClick={handleSavePayment} 
                        disabled={saving}
                        className={`flex-1 py-3 font-bold text-white rounded-xl shadow-lg transition-transform active:scale-95 ${isPay ? 'bg-green-600 hover:bg-green-700' : 'bg-rose-600 hover:bg-rose-700'}`}
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
