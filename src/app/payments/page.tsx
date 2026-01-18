"use client";

import { useState, useEffect } from "react";

/* --------------------------- Reusable Components -------------------------- */
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function AutocompleteInput({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder,
}: {
  value: string;
  onChange: (newValue: string) => void;
  onSelect: (suggestion: any) => void;
  fetchSuggestions: (query: string) => Promise<any[]>;
  placeholder?: string;
}) {
  const [results, setResults] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebounce(value, 300);

  useEffect(() => {
    async function getSuggestions() {
      if (debouncedQuery.length < 1) {
        setResults([]);
        setShow(false);
        return;
      }
      const data = await fetchSuggestions(debouncedQuery);
      setResults(data);
      setShow(data.length > 0);
      setHighlighted(0);
    }
    if (debouncedQuery) getSuggestions();
  }, [debouncedQuery, fetchSuggestions]);

  return (
    <div className="relative w-full">
      <input
        className="form-input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.length >= 1 && results.length > 0 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={placeholder}
      />
      {show && (
        <div className="autocomplete-dropdown absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-50 max-h-48 overflow-auto">
          {results.map((r, idx) => (
            <div
              key={r.id || r.name || idx}
              className={`p-2 cursor-pointer hover:bg-gray-100 ${
                highlighted === idx ? "bg-blue-50" : ""
              }`}
              onMouseDown={() => {
                onSelect(r);
                setShow(false);
              }}
            >
              {r.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Main Page ------------------------------- */
export default function AdjustmentsPage() {
  const [mode, setMode] = useState<"in" | "out" | "adj_debit" | "adj_credit">("in");
  
  // Form State
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  /* -------------------------------- Fetchers ------------------------------- */
  const fetchParties = async (query: string) => {
    try {
      // Search customers mainly, maybe separate endpoint for 'others' if needed
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  };

  /* -------------------------------- Helpers -------------------------------- */
  const handleNum = (v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
  };

  async function saveTransaction() {
    if (!partyName.trim() || !amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid Party Name and Amount.");
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
        setPartyName("");
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
  const tabClass = (m: string) =>
    `flex-1 py-3 text-center cursor-pointer font-semibold transition-colors ${
      mode === m
        ? "border-b-4 border-blue-600 text-blue-700 bg-blue-50"
        : "text-gray-500 hover:bg-gray-50 border-b-4 border-transparent"
    }`;

  return (
    <div className="page max-w-4xl mx-auto">
      <div className="page-header mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Payments & Adjustments</h1>
        <p className="text-gray-500">Record payments and adjust dues.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b">
          <div onClick={() => setMode("in")} className={tabClass("in")}>
            ⬇ Receive (In)
          </div>
          <div onClick={() => setMode("out")} className={tabClass("out")}>
            ⬆ Pay (Out)
          </div>
          <div onClick={() => setMode("adj_debit")} className={tabClass("adj_debit")}>
            ➕ Add Due (Charge)
          </div>
          <div onClick={() => setMode("adj_credit")} className={tabClass("adj_credit")}>
            ➖ Reduce Due (Discount)
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
              <label className="form-label">Party / Customer Name</label>
              <AutocompleteInput
                value={partyName}
                onChange={setPartyName}
                onSelect={(p) => setPartyName(p.name)}
                fetchSuggestions={fetchParties}
                placeholder="Search name..."
              />
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
