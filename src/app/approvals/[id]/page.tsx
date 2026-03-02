"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";

/* ----------------------------- Shared Helpers ----------------------------- */
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debouncedValue;
}
function isNumericLike(s: string) {
  return s === "" || /^\d*\.?\d*$/.test(s);
}
function n(v: string | number | null | undefined) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const f = parseFloat(v);
    return isFinite(f) ? f : 0;
  }
  return 0;
}
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* --------------------------- Autocomplete Input --------------------------- */
function AutocompleteInput({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder,
  onBlur,
  renderItem,
  getKey,
  reserveSpace = true,
  dropdownMaxHeight = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: any) => void;
  fetchSuggestions: (q: string) => Promise<any[]>;
  placeholder?: string;
  onBlur?: () => void;
  renderItem?: (i: any) => React.ReactNode;
  getKey?: (i: any) => string | number;
  reserveSpace?: boolean;
  dropdownMaxHeight?: number;
}) {
  const [results, setResults] = useState<any[]>([]);
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const [hi, setHi] = useState(0);
  const dv = useDebounce(value, 250);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [spacerH, setSpacerH] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!focused || dv.length < 1) {
        setResults([]);
        setShow(false);
        setSpacerH(0);
        return;
      }
      const data = await fetchSuggestions(dv);
      if (ignore) return;
      const arr = data || [];
      setResults(arr);
      const willShow = arr.length > 0;
      setShow(willShow);
      setHi(0);
      requestAnimationFrame(() => {
        if (reserveSpace && willShow && dropRef.current) {
          const h = Math.min(
            dropRef.current.scrollHeight || 0,
            dropdownMaxHeight
          );
          setSpacerH(h);
        } else setSpacerH(0);
      });
    }
    run();
    return () => {
      ignore = true;
    };
  }, [dv, focused, fetchSuggestions, reserveSpace, dropdownMaxHeight]);

  useEffect(() => {
    if (!focused) {
      setShow(false);
      setResults([]);
      setSpacerH(0);
    }
  }, [focused]);

  function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!show || results.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHi((p) => (p + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHi((p) => (p === 0 ? results.length - 1 : p - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (results[hi]) pick(results[hi]);
        break;
      case "Escape":
        setShow(false);
        setResults([]);
        setSpacerH(0);
        break;
    }
  }
  function pick(item: any) {
    onSelect(item);
    setShow(false);
    setResults([]);
    setSpacerH(0);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        overflow: "visible",
        paddingBottom: reserveSpace && show ? spacerH : 0,
        transition: "padding-bottom 120ms ease",
      }}
    >
      <input
        ref={inputRef}
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() =>
          setTimeout(() => {
            setFocused(false);
            onBlur && onBlur();
          }, 120)
        }
        onKeyDown={keyDown}
        autoComplete="off"
        placeholder={placeholder}
      />
      {show && (
        <div
          ref={dropRef}
          className="autocomplete-dropdown"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            maxHeight: dropdownMaxHeight,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {results.map((r, idx) => (
            <div
              key={getKey ? getKey(r) : r.id || r.name || idx}
              className={`autocomplete-item ${hi === idx ? "highlighted" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
            >
              {renderItem ? (
                renderItem(r)
              ) : (
                <span>{r.name || r.label || r.title}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Types --------------------------------- */
type CustomerLite = {
  id: number;
  name: string;
  opening_balance: number;
  balance?: number | null;
};
type ProductLite = {
  id: number;
  name: string;
  material?: string | null;
  size?: string | null;
  unit?: string | null;
  rate?: number | null;
};
type Row = {
  _rowId: string;
  product_id: number | null;
  product: string;
  material: string;
  size: string;
  unit: string;
  qty: string;
  rate: string;
};

/* ------------------------------- Initial State ------------------------------ */
const makeEmptyRow = (): Row => ({
  _rowId: uid(),
  product_id: null,
  product: "",
  material: "",
  size: "",
  unit: "",
  qty: "",
  rate: "",
});
const initialPayment = { advance: "", paidNow: "", method: "Cash" };
const makeInitialPayout = () => ({ recipientName: "", amount: "" });
const makeInitialOtherCharge = () => ({ name: "", amount: "" });
const initialDiscount = { details: "Discount", amount: "" };
const EXECUTIVES = ["Raziya", "Mallesh", "Sridhar", "Gokul", "KVR"] as const;
const OTHER_SENTINEL = "__OTHER__";

/* ================================== UI =================================== */
export default function SalesPage() {
  const router = useRouter();
  const { id } = useParams(); // Get approval ID
  
  // remount key to fully clear after save
  const [formKey, setFormKey] = useState(0);

  const [rows, setRows] = useState<Row[]>([makeEmptyRow()]);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [customerName, setCustomerName] = useState("");
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerOpeningBalance, setNewCustomerOpeningBalance] =
    useState("");
  // --- FIX: customer dropdown race condition ---
  const selectingCustomerRef = useRef(false);

  // --- FIX: prevent double save ---
  const [saving, setSaving] = useState(false);
  // Executives
  const [exec1, setExec1] = useState<string>("");
  const [exec1Other, setExec1Other] = useState("");
  const [addSecondExec, setAddSecondExec] = useState(false);
  const [exec2, setExec2] = useState<string>("");
  const [exec2Other, setExec2Other] = useState("");

  // Charges (GST first)
  const [gst, setGst] = useState("");
  const [hamali, setHamali] = useState("");
  const [transport, setTransport] = useState("");
  const [extraCharges, setExtraCharges] = useState([makeInitialOtherCharge()]);
  const [discount, setDiscount] = useState(initialDiscount);

  // Payments / payouts
  const [customerPayment, setCustomerPayment] = useState(initialPayment);
  const [payouts, setPayouts] = useState([makeInitialPayout()]);

  // Load Approval Data
  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const res = await fetch(`/api/sales-approvals/${id}`);
        const json = await res.json();
        const { sale_data, bill_no: tableBillNo, next_bill_no } = json;

        if (!sale_data) return;

        // 3-tier fallback: sale_data.billNo → table bill_no → auto-generated next bill number
        const isPending = (v: any) => !v || v === "PENDING";
        let resolvedBillNo = sale_data.billNo || "";
        if (isPending(resolvedBillNo)) {
          resolvedBillNo = isPending(tableBillNo) ? (next_bill_no || "") : tableBillNo;
        }
        setBillNo(resolvedBillNo);
        // Safe Date Parsing
        let parsedDate = new Date().toISOString().split("T")[0];
        if (sale_data.billDate) {
          const d = new Date(sale_data.billDate);
          if (!isNaN(d.getTime())) {
            parsedDate = d.toISOString().split("T")[0];
          }
        }
        setBillDate(parsedDate);

        const cName = sale_data.customerName || "";
        setCustomerName(cName);
        
        let isNew = sale_data.isNewCustomer || false;
        
        // Attempt to auto-resolve customer if we have a name
        if (cName.trim()) {
           try {
             const found = await fetchCustomers(cName);
             const exact = (found || []).find(
               (c: any) => c.name?.toLowerCase() === cName.toLowerCase()
             );
             if (exact) {
               setCustomer(exact);
               isNew = false; // Force false if we found them
             }
           } catch (e) {
             console.error("Error auto-resolving customer", e);
           }
        }
        setIsNewCustomer(isNew);

        if (sale_data.rows && Array.isArray(sale_data.rows)) {
          const mappedRows: Row[] = sale_data.rows.map((r: any) => ({
            _rowId: uid(),
            product_id: r.product_id || null,
            product: r.product || r.productName || r.name || r.product_name || r.item_name || r.item || "",
            material: r.material || "",
            size: r.size || "",
            unit: r.unit || "",
            qty: String(r.qty || ""),
            rate: String(r.rate || ""),
          }));

          // Auto-resolve missing material/rate from products DB
          const needsResolve = mappedRows.filter(
            (r) => r.product && (!r.material)
          );
          if (needsResolve.length > 0) {
            try {
              const resolvedMap = new Map<string, any>();
              for (const row of needsResolve) {
                if (resolvedMap.has(row.product)) continue;
                const res2 = await fetch(
                  `/api/products?q=${encodeURIComponent(row.product)}`
                );
                if (res2.ok) {
                  const products = await res2.json();
                  // Find exact or best match
                  const match = (products || []).find(
                    (p: any) =>
                      p.name?.toLowerCase() === row.product.toLowerCase() ||
                      (row.product_id && p.id === row.product_id)
                  ) || (products && products[0]);
                  if (match) resolvedMap.set(row.product, match);
                }
              }
              // Fill in missing fields
              for (const row of mappedRows) {
                const match = resolvedMap.get(row.product);
                if (match) {
                  if (!row.material && match.material) row.material = match.material;
                  if (!row.product_id && match.id) row.product_id = match.id;
                  if ((!row.rate || row.rate === "0") && match.rate) row.rate = String(match.rate);
                }
              }
            } catch (e) {
              console.error("Error auto-resolving product details", e);
            }
          }

          setRows(mappedRows);
        }

        // Robust Payment Mapping
        const pay = sale_data.customerPayment || sale_data.payment || {};
        const advanceVal =
          pay.advance ??
          sale_data.advance ??
          sale_data.advancePayment ??
          "";
        const paidVal =
          pay.paidNow ??
          pay.amountPaid ??
          pay.received ??
          sale_data.paidNow ??
          sale_data.amountPaid ??
          sale_data.received ??
          "";
        const methodVal =
          pay.method ??
          sale_data.method ??
          sale_data.paymentMethod ??
          "Cash";

        setCustomerPayment({
          advance: String(advanceVal || ""),
          paidNow: String(paidVal || ""),
          method: methodVal,
        });

        if (sale_data.payouts && Array.isArray(sale_data.payouts)) {
          setPayouts(
            sale_data.payouts.map((p: any) => ({
              recipientName: p.recipientName || "",
              amount: String(p.amount || ""),
            }))
          );
        }

        // Map 'introBalance' or 'newCustomerOpeningBalance' to our state
        setNewCustomerOpeningBalance(
          String(
            sale_data.newCustomerOpeningBalance ??
            sale_data.introBalance ??
            ""
          )
        );

        // Map Executives (Array or String) -> State
        let incomingExecs: string[] = [];
        if (Array.isArray(sale_data.executives)) {
          incomingExecs = sale_data.executives;
        } else if (typeof sale_data.executives === "string") {
          incomingExecs = [sale_data.executives];
        } else if (typeof sale_data.executive === "string") {
          incomingExecs = [sale_data.executive];
        }

        if (incomingExecs.length > 0) {
          const [e1, e2] = incomingExecs;

          if (e1) {
            // Check if e1 is in our predefined list
            if (EXECUTIVES.includes(e1 as any)) {
              setExec1(e1);
            } else {
              setExec1(OTHER_SENTINEL);
              setExec1Other(e1);
            }
          }

          if (e2) {
            setAddSecondExec(true);
            if (EXECUTIVES.includes(e2 as any)) {
              setExec2(e2);
            } else {
              setExec2(OTHER_SENTINEL);
              setExec2Other(e2);
            }
          }
        }

        setGst(String(sale_data.gst || ""));
        setHamali(String(sale_data.hamali || ""));
        setTransport(String(sale_data.transport || ""));
        
        // Robust Discount Mapping
        const discObj = sale_data.discount || {};
        const discAmt =
          discObj.amount ??
          sale_data.discountAmount ??
          sale_data.discount_amount ??
          "";
        const discDet =
          discObj.details ??
          sale_data.discountDetails ??
          sale_data.discount_details ??
          "Discount";
          
        setDiscount({
          details: discDet,
          amount: String(discAmt || ""),
        });
      } catch (err) {
        console.error("Failed to load approval data", err);
      }
    }

    load();
  }, [id]);

  /* -------------------------------- Calcs --------------------------------- */
  const subtotal = rows.reduce((s, r) => s + n(r.qty) * n(r.rate), 0);
  const totalCharges =
    n(gst) +
    n(hamali) +
    n(transport) +
    extraCharges.reduce((s, c) => s + n(c.amount), 0);
  const totalDiscount = n(discount.amount);
  const grandTotal = subtotal + totalCharges - totalDiscount;
  const totalReceived = n(customerPayment.advance) + n(customerPayment.paidNow);
  const totalPayouts = payouts.reduce((s, p) => s + n(p.amount), 0);
  const balanceDue = grandTotal - totalReceived;

  /* ------------------------------- Handlers -------------------------------- */
  const handleNum = (setter: (v: string) => void, v: string) => {
    if (isNumericLike(v)) setter(v);
  };
  const addRow = () => setRows((p) => [...p, makeEmptyRow()]);
  const removeRow = (rowId: string) =>
    setRows((p) => p.filter((r) => r._rowId !== rowId));
  const patchRow = (rowId: string, patch: Partial<Row>) =>
    setRows((p) => p.map((r) => (r._rowId === rowId ? { ...r, ...patch } : r)));

  const addPayout = () => setPayouts((p) => [...p, makeInitialPayout()]);
  const removePayout = (i: number) =>
    setPayouts((p) => p.filter((_, idx) => idx !== i));
  const patchPayout = (i: number, field: string, value: any) =>
    setPayouts((p) =>
      p.map((item, idx) => (idx === i ? { ...item, [field]: value } : item))
    );

  const addExtraCharge = () =>
    setExtraCharges((p) => [...p, makeInitialOtherCharge()]);
  const removeExtraCharge = (i: number) =>
    setExtraCharges((p) => p.filter((_, idx) => idx !== i));
  const patchExtraCharge = (i: number, field: string, value: any) =>
    setExtraCharges((p) =>
      p.map((item, idx) => (idx === i ? { ...item, [field]: value } : item))
    );

  /* --------------------------------- Fetch --------------------------------- */
  const fetchCustomers = async (q: string) => {
    try {
      const r = await fetch(
        `/api/customers/search?q=${encodeURIComponent(q)}&include_balance=true`
      );
      return r.ok ? r.json() : [];
    } catch {
      return [];
    }
  };
  const productRecommender = async (q: string) => {
    try {
      const r = await fetch(
        `/api/products?q=${encodeURIComponent(q)}${
          customer?.id ? `&customer_id=${customer.id}` : ""
        }`
      );
      if (!r.ok) return [];
      const list: ProductLite[] = await r.json();
      const query = q.trim().toLowerCase();
      const tokens = query.split(/\s+/).filter(Boolean);
      const picked = new Set(
        rows.map((r) => (r.product_id ? String(r.product_id) : ""))
      );
      function score(p: ProductLite) {
        const hay = [p.name, p.material, p.size, p.unit]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        let s = 0;
        if (query && (p.name || "").toLowerCase().startsWith(query)) s += 10;
        for (const t of tokens) if (hay.includes(t)) s += 3;
        if (tokens.some((t) => t === (p.size || "").toLowerCase())) s += 2;
        if (tokens.some((t) => t === (p.material || "").toLowerCase())) s += 2;
        if (p.id && picked.has(String(p.id))) s += 1.5;
        return s;
      }
      const map = new Map<number, ProductLite>();
      for (const it of list)
        if (it?.id != null && !map.has(it.id)) map.set(it.id, it);
      return Array.from(map.values()).sort((a, b) => score(b) - score(a));
    } catch {
      return [];
    }
  };
  const fetchRecipients = async (q: string) => {
    try {
      const r = await fetch(
        `/api/recipients/search?q=${encodeURIComponent(q)}`
      );
      return r.ok ? r.json() : [];
    } catch {
      return [];
    }
  };

  /* --------------------------- Customer selection -------------------------- */
  const onCustomerSelect = (c: CustomerLite) => {
    selectingCustomerRef.current = true;
    setCustomerName(c.name);
    setCustomer(c);
    setIsNewCustomer(false);
  };
  const onCustomerName = (name: string) => {
    setCustomerName(name);
    if (customer && name.toLowerCase() !== customer.name.toLowerCase())
      setCustomer(null);
  };
  const onCustomerBlur = async () => {
    if (selectingCustomerRef.current) {
      selectingCustomerRef.current = false;
      return;
    }
    if (customerName && !customer) {
      const list = await fetchCustomers(customerName);
      const exact = (list || []).find(
        (c: any) => c.name?.toLowerCase() === customerName.toLowerCase()
      );
      exact ? onCustomerSelect(exact) : setIsNewCustomer(true);
    }
  };

  /* ------------------------------ Save & Reset ----------------------------- */
  const hardReset = () => {
    // For approval page, maybe redirect back to list instead of reset?
    router.push("/approvals");
  };

  async function rejectSale() {
    if (!confirm("Are you sure you want to REJECT and DELETE this sale approval?"))
      return;
    if (saving) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/sales-approvals/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        alert("Sales approval rejected.");
        router.push("/approvals");
      } else {
        const data = await res.json().catch(() => ({}));
        alert("❌ Failed to reject: " + (data.error || "Unknown error"));
        setSaving(false);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Network error while rejecting.");
      setSaving(false);
    }
  }

  async function saveSale() {
    if (saving) return;
    setSaving(true);
    // executives array (0–2 names)
    const execs: string[] = [];
    const e1 = exec1 === OTHER_SENTINEL ? exec1Other.trim() : exec1;
    const e2 = exec2 === OTHER_SENTINEL ? exec2Other.trim() : exec2;
    if (e1 && e1.trim()) execs.push(e1.trim());
    if (addSecondExec && e2 && e2.trim()) execs.push(e2.trim());

    const payload = {
      billNo,
      billDate,
      customerName,
      isNewCustomer,
      newCustomerOpeningBalance: n(newCustomerOpeningBalance),
      executives: execs,
      rows: rows
        .filter((r) => r.product_id && (n(r.qty) > 0 || n(r.rate) >= 0))
        .map((r) => ({
          product_id: r.product_id,
          product: r.product,
          material: r.material,
          size: r.size,
          unit: r.unit,
          qty: n(r.qty),
          rate: n(r.rate),
        })),
      customerPayment: {
        advance: n(customerPayment.advance),
        paidNow: n(customerPayment.paidNow),
        method: customerPayment.method,
      },
      payouts: payouts
        .filter((p) => p.recipientName?.trim())
        .map((p) => ({ recipientName: p.recipientName, amount: n(p.amount) })),
      gst: n(gst),
      hamali: n(hamali),
      transport: n(transport),
      extraCharges: extraCharges
        .filter((c) => c.name?.trim())
        .map((c) => ({ ...c, amount: n(c.amount) })),
      discount: { ...discount, amount: n(discount.amount) },
    };

    if (!payload.billNo || !payload.customerName) {
      alert("❌ Bill Number and Customer Name are required.");
      return;
    }

    // Validation: Ensure all rows with a name have a resolved ID (to prevent duplicates/ghost products)
    const invalidRows = rows.filter(
      (r) => r.product.trim() && !r.product_id
    );
    if (invalidRows.length > 0) {
      alert(
        `❌ Please select a valid product from the dropdown for: ${invalidRows
          .map((r) => r.product)
          .join(", ")}\n\n(Click on the product name and pick from the list to avoid duplicates)`
      );
      setSaving(false);
      return;
    }

    try {
      // FIX: Use approval endpoint
      const res = await fetch(`/api/sales/approve?approval_id=${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("✅ Sale approved and saved successfully!");
        hardReset();
        setSaving(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      alert("❌ Error: " + (data.error || "Unknown error"));
      setSaving(false);
    } catch {
      alert("❌ A network error occurred.");
      setSaving(false);
    }
  }

  /* -------------------------- Balance (display fix) ------------------------ */
  // Treat positive as "customer owes me". If backend sends opposite sign, flip it here.
  const rawBalance =
    typeof customer?.balance === "number" ? customer.balance : null;
  const balanceNumber = rawBalance === null ? null : -rawBalance; // invert for display
  const balanceText =
    balanceNumber === null
      ? "—"
      : balanceNumber >= 0
      ? `₹${balanceNumber.toLocaleString("en-IN")} (Advance)`
      : `₹${Math.abs(balanceNumber).toLocaleString(
          "en-IN"
        )} (You will receive)`;

  /* ----------------------------------- UI ---------------------------------- */
  return (
    <div className="page">
      {/* remounts after save */}
      <div className="page-header">
        <h1 className="page-title">Review & Approve Sale</h1>
      </div>

      {/* Bill & Customer */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Bill & Customer Details</h2>
        </div>
        <div className="card-body form-grid" style={{ overflow: "visible" }}>
          <div>
            <label className="form-label">Bill / Invoice No.</label>
            <input
              className="form-input"
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              placeholder="e.g. 2025/0007"
            />
          </div>

          <div>
            <label className="form-label">Customer Name</label>
            <AutocompleteInput
              value={customerName}
              onChange={onCustomerName}
              onSelect={onCustomerSelect}
              fetchSuggestions={fetchCustomers}
              placeholder="Search or add new customer..."
              onBlur={onCustomerBlur}
              renderItem={(c: CustomerLite) => (
                <div className="flex items-center justify-between gap-2">
                  <span>{c.name}</span>
                  {typeof c.balance === "number" && (
                    <span className="text-xs opacity-70">
                      Curr: ₹{c.balance.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
              )}
            />
          </div>

          <div>
            <label className="form-label">Bill Date</label>
            <input
              type="date"
              className="form-input"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
            />
          </div>

          {/* Executives */}
          <div className="grid grid-cols-1 gap-2">
            <label className="form-label">
              Executive(s){" "}
              <span className="text-xs opacity-70">(optional)</span>
            </label>

            {/* Primary */}
            <div className="flex gap-2">
              <select
                className="form-select"
                value={exec1}
                onChange={(e) => setExec1(e.target.value)}
              >
                <option value="">Select executive</option>
                {EXECUTIVES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={OTHER_SENTINEL}>Other…</option>
              </select>
              {exec1 === OTHER_SENTINEL && (
                <input
                  className="form-input"
                  placeholder="Type executive name"
                  value={exec1Other}
                  onChange={(e) => setExec1Other(e.target.value)}
                />
              )}
            </div>

            {/* Secondary (optional) */}
            <div className="flex items-center gap-2">
              <input
                id="addSecondExec"
                type="checkbox"
                checked={addSecondExec}
                onChange={(e) => setAddSecondExec(e.target.checked)}
              />
              <label htmlFor="addSecondExec">Add second executive</label>
            </div>
            {addSecondExec && (
              <div className="flex gap-2">
                <select
                  className="form-select"
                  value={exec2}
                  onChange={(e) => setExec2(e.target.value)}
                >
                  <option value="">Select executive</option>
                  {EXECUTIVES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={OTHER_SENTINEL}>Other…</option>
                </select>
                {exec2 === OTHER_SENTINEL && (
                  <input
                    className="form-input"
                    placeholder="Type second executive"
                    value={exec2Other}
                    onChange={(e) => setExec2Other(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          {isNewCustomer ? (
            <div>
              <label className="form-label">
                Opening Balance (Customer owes you)
              </label>
              <input
                type="text"
                className="form-input"
                value={newCustomerOpeningBalance}
                onChange={(e) =>
                  handleNum(setNewCustomerOpeningBalance, e.target.value)
                }
                placeholder="e.g. 0"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">
                  Opening Balance (Customer owes you)
                </label>
                <input
                  readOnly
                  className="form-input bg-gray-100"
                  value={
                    customer
                      ? `₹${(customer.opening_balance ?? 0).toLocaleString(
                          "en-IN"
                        )}`
                      : "Select a customer"
                  }
                />
              </div>
              <div>
                <label className="form-label">Current Balance</label>
                <input
                  readOnly
                  className="form-input bg-gray-100"
                  value={balanceText}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Items</h2>
        </div>
        <div className="card-body" style={{ overflow: "visible" }}>
          <table
            className="data-table items-table"
            style={{ overflow: "visible" }}
          >
            <thead>
              <tr>
                <th style={{ width: "20%" }}>Product</th>
                <th style={{ width: "80px" }}>Material</th>
                <th>Size</th>
                <th style={{ width: "62px" }}>Unit</th>
                <th style={{ width: "65px" }}>Qty</th>
                <th style={{ width: "80px" }}>Rate</th>
                <th style={{ width: "90px" }}>Amount</th>
                <th style={{ width: "28px" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._rowId}>
                  <td style={{ position: "relative", overflow: "visible" }}>
                    <AutocompleteInput
                      value={r.product}
                      onChange={(v) => patchRow(r._rowId, { product: v })}
                      onSelect={(p: ProductLite) => {
                        patchRow(r._rowId, {
                          product_id: p.id,
                          product: p.name || "",
                          material: p.material || "",
                          size: p.size || "",
                          unit: p.unit || "",
                          rate:
                            typeof p.rate === "number"
                              ? String(p.rate)
                              : r.rate,
                        });
                      }}
                      fetchSuggestions={productRecommender}
                      placeholder="Type to search..."
                      renderItem={(p: ProductLite) => (
                        <div className="flex flex-col">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs opacity-70">
                            {(p.material || "—") + " · " + (p.size || "—")}{" "}
                            {p.unit ? ` · ${p.unit}` : ""}
                          </span>
                        </div>
                      )}
                      reserveSpace
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      value={r.material}
                      onChange={(e) =>
                        patchRow(r._rowId, { material: e.target.value })
                      }
                      placeholder="e.g. Tiles"
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      value={r.size}
                      onChange={(e) =>
                        patchRow(r._rowId, { size: e.target.value })
                      }
                      placeholder="e.g. 18*12"
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      value={r.unit}
                      onChange={(e) =>
                        patchRow(r._rowId, { unit: e.target.value })
                      }
                      placeholder="e.g. box"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-input"
                      value={r.qty}
                      onChange={(e) =>
                        handleNum(
                          (v) => patchRow(r._rowId, { qty: v }),
                          e.target.value
                        )
                      }
                      placeholder="Qty"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-input"
                      value={r.rate}
                      onChange={(e) =>
                        handleNum(
                          (v) => patchRow(r._rowId, { rate: v }),
                          e.target.value
                        )
                      }
                      placeholder="Rate"
                    />
                  </td>
                  <td className="amount-cell">
                    ₹{(n(r.qty) * n(r.rate)).toLocaleString("en-IN")}
                  </td>
                  <td>
                    <button
                      className="btn btn-danger"
                      onClick={() => removeRow(r._rowId)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 16 }}
            onClick={addRow}
          >
            + Add Row
          </button>
        </div>
      </div>

      {/* Charges & Discounts  (GST first, then Hamali, Transport) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Charges & Discounts</h2>
        </div>
        <div className="card-body">
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            <div className="payout-row">
              <input className="form-input bg-gray-50" value="GST" readOnly />
              <input
                type="text"
                className="form-input"
                placeholder="Amount"
                value={gst}
                onChange={(e) => handleNum(setGst, e.target.value)}
              />
            </div>
            <div className="payout-row">
              <input
                className="form-input bg-gray-50"
                value="Hamali"
                readOnly
              />
              <input
                type="text"
                className="form-input"
                placeholder="Amount"
                value={hamali}
                onChange={(e) => handleNum(setHamali, e.target.value)}
              />
            </div>
            <div className="payout-row">
              <input
                className="form-input bg-gray-50"
                value="Transport"
                readOnly
              />
              <input
                type="text"
                className="form-input"
                placeholder="Amount"
                value={transport}
                onChange={(e) => handleNum(setTransport, e.target.value)}
              />
            </div>
          </div>

          {extraCharges.map((c, i) => (
            <div key={i} className="payout-row mb-2">
              <input
                className="form-input"
                placeholder="Other Charge (optional)"
                value={c.name}
                onChange={(e) => patchExtraCharge(i, "name", e.target.value)}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Amount"
                value={c.amount}
                onChange={(e) =>
                  handleNum(
                    (v) => patchExtraCharge(i, "amount", v),
                    e.target.value
                  )
                }
              />
              <button
                className="btn btn-danger btn-sm"
                onClick={() => removeExtraCharge(i)}
              >
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addExtraCharge}>
            + Add Other Charge
          </button>

          <hr className="my-4" />
          <div className="payout-row">
            <input
              className="form-input"
              placeholder="Discount Details"
              value={discount.details}
              onChange={(e) =>
                setDiscount({ ...discount, details: e.target.value })
              }
            />
            <input
              type="text"
              className="form-input"
              placeholder="Discount Amount"
              value={discount.amount}
              onChange={(e) =>
                handleNum(
                  (v) => setDiscount({ ...discount, amount: v }),
                  e.target.value
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Summary + Payouts */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">💰 Customer Payment & Summary</h2>
          </div>
          <div className="card-body">
            <div className="summary-container">
              <div className="summary-row">
                <span className="summary-label">Subtotal</span>
                <span className="summary-value">
                  ₹{subtotal.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Charges (incl. GST)</span>
                <span className="summary-value">
                  ₹{totalCharges.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Discount</span>
                <span className="summary-value text-green">
                  - ₹{totalDiscount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="summary-total-row">
                <span className="summary-label">Grand Total</span>
                <span className="summary-value">
                  ₹{grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
              <hr className="summary-divider" />
              <div className="summary-row">
                <label className="summary-label">Advance Payment</label>
                <input
                  type="text"
                  className="form-input summary-input"
                  value={customerPayment.advance}
                  onChange={(e) =>
                    handleNum(
                      (v) =>
                        setCustomerPayment({ ...customerPayment, advance: v }),
                      e.target.value
                    )
                  }
                  placeholder="e.g. 0"
                />
              </div>
              <div className="summary-row">
                <label className="summary-label">Amount Paid Now</label>
                <input
                  type="text"
                  className="form-input summary-input"
                  value={customerPayment.paidNow}
                  onChange={(e) =>
                    handleNum(
                      (v) =>
                        setCustomerPayment({ ...customerPayment, paidNow: v }),
                      e.target.value
                    )
                  }
                  placeholder="e.g. 0"
                />
              </div>
              <div className="summary-row">
                <label className="summary-label">Payment Method</label>
                <select
                  className="form-select summary-input"
                  value={customerPayment.method}
                  onChange={(e) =>
                    setCustomerPayment({
                      ...customerPayment,
                      method: e.target.value,
                    })
                  }
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Cheque</option>
                </select>
              </div>
              <hr className="summary-divider" />
              <div className="summary-total-row">
                <span className="summary-label">Balance Due</span>
                <span
                  className={`summary-value ${
                    balanceDue <= 0 ? "text-green" : "text-red"
                  }`}
                >
                  ₹{balanceDue.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">💸 Record Payout(s) to Others</h2>
          </div>
          <div className="card-body">
            <div className="payout-container">
              {payouts.map((p, i) => (
                <div key={i} className="payout-row">
                  <AutocompleteInput
                    value={p.recipientName}
                    onChange={(v) => patchPayout(i, "recipientName", v)}
                    onSelect={(rec) =>
                      patchPayout(i, "recipientName", rec.name)
                    }
                    fetchSuggestions={fetchRecipients}
                    placeholder="Recipient Name (e.g., Vikas)"
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Amount"
                    value={p.amount}
                    onChange={(e) =>
                      handleNum(
                        (v) => patchPayout(i, "amount", v),
                        e.target.value
                      )
                    }
                  />
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removePayout(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              style={{ marginTop: 16 }}
              onClick={addPayout}
            >
              + Add Payout
            </button>
            <div className="payout-summary">
              <span>
                {" "}
                Total Received:{" "}
                <span className="text-green">
                  ₹{totalReceived.toLocaleString("en-IN")}
                </span>
              </span>
              <span>
                {" "}
                Total Payouts:{" "}
                <span className="text-red">
                  ₹{totalPayouts.toLocaleString("en-IN")}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mt-8">
        <button
          className={`btn btn-danger btn-lg ${
            saving ? "opacity-60 cursor-not-allowed" : ""
          }`}
          onClick={rejectSale}
          disabled={saving}
        >
          Reject
        </button>
        <button
          className={`btn btn-success btn-lg flex-1 ${
            saving ? "opacity-60 cursor-not-allowed" : ""
          }`}
          onClick={saveSale}
          disabled={saving}
        >
          {saving ? "Approve & Save..." : "Approve & Save Sale"}
        </button>
      </div>
    </div>
  );
}
