"use client";

import { useState, useEffect } from "react";

// ✅ Debounce Hook
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ✅ Product Input Component (Autocomplete)
function ProductInput({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (p: any) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    async function searchProducts() {
      if (debouncedQuery.length < 2) {
        setResults([]);
        setShow(false);
        return;
      }
      const res = await fetch(`/api/products?q=${encodeURIComponent(debouncedQuery)}`);
      const data = await res.json();
      setResults(data);
      setShow(true);
      setHighlighted(0);
    }
    searchProducts();
  }, [debouncedQuery]);

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
        setQuery(selected.name);
        setShow(false);
      }
    } else if (e.key === "Escape") {
      setShow(false);
    }
  }

  return (
    <div className="relative w-full">
      <input
        className="form-input w-full"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {show && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((p, idx) => (
            <div
              key={p.id}
              className={`flex justify-between items-center px-3 py-2 cursor-pointer text-sm ${
                highlighted === idx ? "bg-blue-600 text-white" : "hover:bg-gray-100"
              }`}
              onMouseDown={() => {
                onSelect(p);
                setQuery(p.name);
                setShow(false);
              }}
            >
              <span>{p.name}</span>
              {p.size && <span className="text-gray-500 text-xs ml-2">({p.size})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------
// ✅ Main SalesPage
// --------------------
type RecipientType = "customer" | "supplier" | "others";

export default function SalesPage() {
  const [rows, setRows] = useState([
    { product_id: null, product: "", material: "", size: "", qty: 0, rate: 0 },
  ]);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [advance, setAdvance] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);

  const [payment, setPayment] = useState({
    method: "Cash",
    recipientType: "customer" as RecipientType,
    recipientId: "",
    otherName: "",
    amount: 0,
  });

  const subtotal = rows.reduce((sum, r) => sum + r.qty * r.rate, 0);
  const totalPaid = advance + payment.amount;
  const balance = subtotal - totalPaid - openingBalance;

  function addRow() {
    setRows([...rows, { product_id: null, product: "", material: "", size: "", qty: 0, rate: 0 }]);
  }

  function updateRow(index: number, field: string, value: any) {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  async function saveSale() {
    if (payment.amount > advance + payment.amount) {
      alert("❌ Payment amount seems incorrect.");
      return;
    }

    const payload = {
      billNo,
      billDate,
      customerName,
      openingBalance,
      advance,
      rows,
      payment,
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert("✅ Sale saved successfully!");
        setRows([{ product_id: null, product: "", material: "", size: "", qty: 0, rate: 0 }]);
        setBillNo("");
        setBillDate("");
        setCustomerName("");
        setAdvance(0);
        setOpeningBalance(0);
        setPayment({
          method: "Cash",
          recipientType: "customer",
          recipientId: "",
          otherName: "",
          amount: 0,
        });
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
      <h1 className="page-title">Sales Entry — Sale (multiple items)</h1>

      {/* Bill Info */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Bill / Customer Info</h2>
        </div>
        <div className="card-body form-grid">
          <div>
            <label className="form-label">Bill / Invoice No</label>
            <input className="form-input" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Customer</label>
            <input className="form-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Bill Date</label>
            <input type="date" className="form-input" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Opening Balance</label>
            <input
              type="number"
              className="form-input"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Items</h2>
        </div>
        <div className="card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Product</th>
                <th>Material</th>
                <th>Size</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ position: "relative", zIndex: rows.length - i }}>
                    <ProductInput
                      value={r.product}
                      onSelect={(p) => {
                        updateRow(i, "product_id", p.id);
                        updateRow(i, "product", p.name);
                        updateRow(i, "material", p.material);
                        updateRow(i, "size", p.size);
                        updateRow(i, "rate", p.rate || 0);
                      }}
                    />
                  </td>
                  <td>
                    <input className="form-input" value={r.material} onChange={(e) => updateRow(i, "material", e.target.value)} />
                  </td>
                  <td>
                    <input className="form-input" value={r.size} onChange={(e) => updateRow(i, "size", e.target.value)} />
                  </td>
                  <td>
                    <input type="number" className="form-input" value={r.qty} onChange={(e) => updateRow(i, "qty", Number(e.target.value))} />
                  </td>
                  <td>
                    <input type="number" className="form-input" value={r.rate} onChange={(e) => updateRow(i, "rate", Number(e.target.value))} />
                  </td>
                  <td className="font-semibold">₹{(r.qty * r.rate).toLocaleString("en-IN")}</td>
                  <td>
                    <button className="btn btn-danger" onClick={() => removeRow(i)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-primary mt-3" onClick={addRow}>+ Add Row</button>
        </div>
      </div>

      {/* Summary */}
      <div className="card">
        <div className="card-header"><h2 className="card-title">Summary</h2></div>
        <div className="card-body">
          <div className="summary-container">
            <div className="summary-row">
              <span className="summary-label">Subtotal</span>
              <span className="summary-value">₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="summary-row">
              <label className="summary-label">Advance Payment</label>
              <input type="number" className="form-input" value={advance} onChange={(e) => setAdvance(Number(e.target.value))} />
            </div>
            <div className="summary-row">
              <span className="summary-label">Amount Paid Now</span>
              <span className="summary-value">₹{payment.amount.toLocaleString("en-IN")}</span>
            </div>
            <div className="summary-row summary-total-row">
              <span className="summary-label">Balance Due</span>
              <span className={`summary-value ${balance < 0 ? "text-green-600" : "text-red-600"}`}>
                ₹{balance.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="card">
        <div className="card-header"><h2 className="card-title">💰 Record Payment</h2></div>
        <div className="card-body">
          <div className="payment-grid">
            <div>
              <label className="form-label">Method</label>
              <select className="form-select" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                <option>Cash</option>
                <option>UPI</option>
                <option>Cheque</option>
              </select>
            </div>
            <div>
              <label className="form-label">Amount Paid Now</label>
              <input
                type="number"
                className="form-input"
                value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="form-label">Recipient</label>
              <select
                className="form-select"
                value={payment.recipientType}
                onChange={(e) => setPayment({ ...payment, recipientType: e.target.value as RecipientType })}
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
                <option value="others">Others</option>
              </select>
            </div>
            {payment.recipientType === "others" && (
              <div>
                <label className="form-label">Other Name</label>
                <input className="form-input" value={payment.otherName} onChange={(e) => setPayment({ ...payment, otherName: e.target.value })} />
              </div>
            )}
          </div>
        </div>
      </div>

      <button className="btn btn-success btn-lg mt-6" onClick={saveSale}>Save Sale</button>
    </div>
  );
}
