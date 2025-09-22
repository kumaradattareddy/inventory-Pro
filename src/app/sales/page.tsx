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
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => (prev === 0 ? results.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[highlighted];
      if (selected) {
        onSelect(selected);
        setShow(false);
      }
    } else if (e.key === "Escape") {
      setShow(false);
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.length >= 1 && results.length > 0 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        placeholder={placeholder}
      />
      {show && (
        <div className="autocomplete-dropdown">
          {results.map((r, idx) => (
            <div
              key={r.id || r.name}
              className={`autocomplete-item ${highlighted === idx ? 'highlighted' : ''}`}
              onMouseDown={() => { onSelect(r); setShow(false); }}
            >
              <span>{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// --- Main SalesPage Component ---
export default function SalesPage() {
  const [rows, setRows] = useState([
    { product_id: null, product: "", material: "", size: "", unit: "", qty: '1', rate: '0' },
  ]);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState("");
  const [customerPayment, setCustomerPayment] = useState({ advance: '0', paidNow: '0', method: "Cash" });
  const [payouts, setPayouts] = useState([{ recipientName: "", amount: '0', method: "Cash" }]);

  const subtotal = rows.reduce((sum, r) => sum + ((parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0)), 0);
  const totalReceived = (parseFloat(customerPayment.advance) || 0) + (parseFloat(customerPayment.paidNow) || 0);
  const totalPayouts = payouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const balanceDue = subtotal - totalReceived;

  const addRow = () => setRows([...rows, { product_id: null, product: "", material: "", size: "", unit: "", qty: '1', rate: '0' }]);
  const updateRow = (index: number, field: string, value: any) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  };
  const removeRow = (index: number) => setRows(rows.filter((_, i) => i !== index));
  
  const updatePayout = (index: number, field: string, value: any) => {
    const updated = [...payouts];
    (updated[index] as any)[field] = value;
    setPayouts(updated);
  };
  const addPayout = () => setPayouts([...payouts, { recipientName: "", amount: '0', method: "Cash" }]);
  const removePayout = (index: number) => setPayouts(payouts.filter((_, i) => i !== index));

  // --- API Fetcher Functions for Autocomplete ---
  const fetchCustomers = async (query: string) => {
    const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
    return res.ok ? res.json() : [];
  };
  const fetchProducts = async (query: string) => {
    const res = await fetch(`/api/products?q=${encodeURIComponent(query)}`);
    return res.ok ? res.json() : [];
  };
  const fetchRecipients = async (query: string) => {
    const res = await fetch(`/api/recipients/search?q=${encodeURIComponent(query)}`);
    return res.ok ? res.json() : [];
  };

  async function saveSale() {
    if (!customerName.trim() || !billNo.trim()) {
      alert("Please enter a Customer Name and Bill Number.");
      return;
    }
    if (totalPayouts > totalReceived) {
      alert(`Error: Total payouts (₹${totalPayouts.toLocaleString("en-IN")}) cannot exceed the total amount received from the customer (₹${totalReceived.toLocaleString("en-IN")}).`);
      return;
    }

    const payload = {
        billNo,
        billDate,
        customerName,
        rows: rows.map(r => ({ ...r, qty: parseFloat(r.qty) || 0, rate: parseFloat(r.rate) || 0 })),
        customerPayment: { ...customerPayment, advance: parseFloat(customerPayment.advance) || 0, paidNow: parseFloat(customerPayment.paidNow) || 0 },
        payouts: payouts.map(p => ({ ...p, amount: parseFloat(p.amount) || 0 })),
    };
    
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("✅ Sale saved successfully!");
        // Reset form logic can be added here
      } else {
        const data = await res.json();
        alert("❌ Error saving sale: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to save sale:", error);
      alert("❌ A network error occurred. Please try again.");
    }
  }

  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">New Sale</h1></div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Bill & Customer Details</h2></div>
        <div className="card-body form-grid">
          <div>
            <label className="form-label">Bill / Invoice No.</label>
            <input className="form-input" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Customer Name</label>
            <AutocompleteInput
              value={customerName}
              onChange={setCustomerName}
              onSelect={(customer) => setCustomerName(customer.name)}
              fetchSuggestions={fetchCustomers}
              placeholder="Search or add new customer..."
            />
          </div>
          <div>
            <label className="form-label">Bill Date</label>
            <input type="date" className="form-input" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Items</h2></div>
        <div className="card-body">
          <table className="data-table items-table">
            <thead>
              <tr>
                <th style={{width: "20%"}}>Product</th>
                <th>Material</th>
                <th>Size</th>
                <th>Unit</th>
                <th style={{width: "80px"}}>Qty</th>
                <th style={{width: "100px"}}>Rate</th>
                <th style={{width: "100px"}}>Amount</th>
                <th style={{width: "20px"}}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <AutocompleteInput
                      value={r.product}
                      onChange={(val) => updateRow(i, "product", val)}
                      onSelect={(p) => { 
                        updateRow(i, "product_id", p.id); 
                        updateRow(i, "product", p.name); 
                        updateRow(i, "material", p.material || ''); 
                        updateRow(i, "size", p.size || '');
                        updateRow(i, "unit", p.unit || '');
                        updateRow(i, "rate", p.rate?.toString() || '0'); 
                      }}
                      fetchSuggestions={fetchProducts}
                      placeholder="Type to search..."
                    />
                  </td>
                  <td><input className="form-input" value={r.material} onChange={(e) => updateRow(i, "material", e.target.value)} /></td>
                  <td><input className="form-input" value={r.size} onChange={(e) => updateRow(i, "size", e.target.value)} /></td>
                  <td><input className="form-input" value={r.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} /></td>
                  <td><input type="number" className="form-input" value={r.qty} onChange={(e) => updateRow(i, "qty", e.target.value)} /></td>
                  <td><input type="number" className="form-input" value={r.rate} onChange={(e) => updateRow(i, "rate", e.target.value)} /></td>
                  <td className="amount-cell">₹{((parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0)).toLocaleString("en-IN")}</td>
                  <td><button className="btn btn-danger" onClick={() => removeRow(i)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary" style={{marginTop: '16px'}} onClick={addRow}>+ Add Row</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
            <div className="card-header"><h2 className="card-title">💰 Customer Payment & Summary</h2></div>
            <div className="card-body">
              <div className="summary-container">
                  <div className="summary-row"><span className="summary-label">Subtotal</span><span className="summary-value">₹{subtotal.toLocaleString("en-IN")}</span></div>
                  <div className="summary-row"><label className="summary-label">Advance Payment</label><input type="number" className="form-input summary-input" value={customerPayment.advance} onChange={(e) => setCustomerPayment({...customerPayment, advance: e.target.value})} /></div>
                  <div className="summary-row"><label className="summary-label">Amount Paid Now</label><input type="number" className="form-input summary-input" value={customerPayment.paidNow} onChange={(e) => setCustomerPayment({...customerPayment, paidNow: e.target.value})} /></div>
                  <div className="summary-row"><label className="summary-label">Payment Method</label><select className="form-select summary-input" value={customerPayment.method} onChange={(e) => setCustomerPayment({...customerPayment, method: e.target.value})}><option>Cash</option><option>UPI</option><option>Cheque</option></select></div>
                  <hr className="summary-divider"/>
                  <div className="summary-total-row"><span className="summary-label">Balance Due</span><span className={`summary-value ${balanceDue <= 0 ? 'text-green' : 'text-red'}`}>₹{balanceDue.toLocaleString("en-IN")}</span></div>
              </div>
            </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">💸 Record Payout(s) to Others</h2></div>
          <div className="card-body">
            <div className="payout-container">
              {payouts.map((p, i) => (
                <div key={i} className="payout-row">
                  <AutocompleteInput
                    value={p.recipientName}
                    onChange={(val) => updatePayout(i, "recipientName", val)}
                    onSelect={(recipient) => updatePayout(i, "recipientName", recipient.name)}
                    fetchSuggestions={fetchRecipients}
                    placeholder="Recipient Name (e.g., Vikas)"
                  />
                  <input type="number" className="form-input" placeholder="Amount" value={p.amount} onChange={(e) => updatePayout(i, "amount", e.target.value)} />
                  <button className="btn btn-danger" onClick={() => removePayout(i)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                  </button>
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

      <button className="btn btn-success btn-lg" onClick={saveSale}>Save Sale</button>
    </div>
  );
}