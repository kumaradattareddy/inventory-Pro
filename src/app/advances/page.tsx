"use client";

import { useState, useEffect } from "react";

// --- Reusable Helper Hooks & Components ---
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
    if (debouncedQuery) {
        getSuggestions();
    }
  }, [debouncedQuery, fetchSuggestions]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!show || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((p) => (p + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((p) => (p === 0 ? results.length - 1 : p - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[highlighted];
      if (selected) { onSelect(selected); setShow(false); }
    } 
    else if (e.key === "Escape") { setShow(false); }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        className="form-input" value={value} onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.length >= 1 && results.length > 0 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)} onKeyDown={handleKeyDown}
        autoComplete="off" placeholder={placeholder}
      />
      {show && (
        <div className="autocomplete-dropdown">
          {results.map((r, idx) => (
            <div key={r.id || r.name} className={`autocomplete-item ${highlighted === idx ? 'highlighted' : ''}`}
                 onMouseDown={() => { onSelect(r); setShow(false); }}>
              <span>{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main Advance Payment Page Component ---
export default function AdvancePaymentPage() {
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState('0');
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [billNo, setBillNo] = useState(""); // Optional reference
  const [payouts, setPayouts] = useState([{ recipientName: "", amount: '0', method: "Cash" }]);

  const totalReceived = parseFloat(amount) || 0;
  const totalPayouts = payouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  // --- Handlers ---
  const handleNumericChange = (setter: (value: string) => void, value: string) => {
    if (value === '' || value.match(/^\d*\.?\d*$/)) {
      setter(value);
    }
  };

  const updatePayout = (index: number, field: string, value: any) => {
    const updated = [...payouts];
    (updated[index] as any)[field] = value;
    setPayouts(updated);
  };
  const addPayout = () => setPayouts([...payouts, { recipientName: "", amount: '0', method: "Cash" }]);
  const removePayout = (index: number) => setPayouts(payouts.filter((_, i) => i !== index));

  // ✅ --- START OF FIX ---
  // Implemented the actual fetch logic for suggestions.
  const fetchCustomers = async (query: string) => {
    try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
        if (res.ok) return res.json();
    } catch (error) {
        console.error("Failed to fetch customers:", error);
    }
    return [];
  };
  
  const fetchRecipients = async (query: string) => {
    try {
        const res = await fetch(`/api/recipients/search?q=${encodeURIComponent(query)}`);
        if (res.ok) return res.json();
    } catch (error) {
        console.error("Failed to fetch recipients:", error);
    }
    return [];
  };
  // ✅ --- END OF FIX ---
  
  async function saveAdvance() {
    if (!customerName.trim() || totalReceived <= 0) {
      alert("Please enter a Customer Name and a valid Amount.");
      return;
    }
    if (totalPayouts > totalReceived) {
      alert(`Error: Total payouts (₹${totalPayouts.toLocaleString("en-IN")}) cannot exceed the advance amount (₹${totalReceived.toLocaleString("en-IN")}).`);
      return;
    }

    const payload = { date, customerName, amount: totalReceived, method, billNo, payouts };

    try {
      const res = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("✅ Advance payment and payouts saved successfully!");
        // Reset form logic here
      } else {
        const data = await res.json();
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to save advance:", error);
      alert("❌ A network error occurred.");
    }
  }

  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Record Advance Payment</h1></div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column: Advance Details */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">💰 Advance from Customer</h2></div>
          <div className="card-body form-grid">
            <div>
              <label className="form-label">Customer Name</label>
              <AutocompleteInput value={customerName} onChange={setCustomerName} onSelect={(c) => setCustomerName(c.name)} fetchSuggestions={fetchCustomers} placeholder="Search for customer..."/>
            </div>
            <div>
              <label className="form-label">Amount Received</label>
              <input type="text" className="form-input" value={amount} onChange={(e) => handleNumericChange(setAmount, e.target.value)} />
            </div>
            <div>
              <label className="form-label">Payment Date</label>
              <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
             <div>
              <label className="form-label">Payment Method</label>
              <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>Cash</option><option>UPI</option><option>Cheque</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Reference Bill No. (Optional)</label>
              <input className="form-input" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Right Column: Payouts */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">💸 Record Payout(s) to Others</h2></div>
          <div className="card-body">
            <div className="payout-container">
              {payouts.map((p, i) => (
                <div key={i} className="payout-row">
                  <AutocompleteInput value={p.recipientName} onChange={(val) => updatePayout(i, "recipientName", val)} onSelect={(r) => updatePayout(i, "recipientName", r.name)} fetchSuggestions={fetchRecipients} placeholder="Recipient Name (e.g., Vikas)" />
                  <input type="text" className="form-input" placeholder="Amount" value={p.amount} onChange={(e) => handleNumericChange((val) => updatePayout(i, "amount", val), e.target.value)} />
                  <button className="btn btn-danger btn-sm" onClick={() => removePayout(i)}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" style={{marginTop: '16px'}} onClick={addPayout}>+ Add Payout</button>
            <div className="payout-summary">
              <span>Total Received: <span className="text-green">₹{totalReceived.toLocaleString("en-IN")}</span></span>
              <span>Total Payouts: <span className="text-red">₹{totalPayouts.toLocaleString("en-IN")}</span></span>
            </div>
          </div>
        </div>
      </div>
      <button className="btn btn-success btn-lg" onClick={saveAdvance}>Save Advance</button>
    </div>
  );
}

