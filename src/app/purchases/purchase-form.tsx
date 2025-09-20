// purchases/purchase-form.tsx

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

// --- Type Definitions ---
type Row = { material: string; size: string; product: string; qty: number; price: number; };
type Supplier = { id: number; name: string | null; opening_balance: number; };
type Product = { id: number; name: string | null; size: string | null; material: string | null; };
type PurchaseFormProps = { onSaveSuccess: () => void; };

// --- Main Component ---
export default function PurchaseForm({ onSaveSuccess }: PurchaseFormProps) {
  const supabase = createClient();

  // --- State Management ---
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [balanceSide, setBalanceSide] = useState<"debit" | "credit">("credit");
  const [showBalanceInput, setShowBalanceInput] = useState(false);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Row[]>([{ material: "Tiles", size: "", product: "", qty: 0, price: 0 }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // ✅ NEW: State to hold the dynamic list of materials
  const [materials, setMaterials] = useState<string[]>([]);

  // --- Data Fetching ---
  const fetchInitialData = useCallback(async () => {
    // Fetch suppliers
    const { data: supplierData } = await supabase.from("suppliers").select("id, name, opening_balance");
    setSuppliers(supplierData ?? []);

    // ✅ NEW: Fetch unique materials using the new database function
    const { data: materialData } = await supabase.rpc('get_unique_materials');
    if (materialData) {
      setMaterials(materialData.map(item => item.material));
    }
  }, [supabase]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);


  // --- Row Management ---
  const addRow = () => setRows([...rows, { material: "Tiles", size: "", product: "", qty: 0, price: 0 }]);
  const removeRow = (index: number) => { if (rows.length > 1) setRows(rows.filter((_, i) => i !== index)); };
  const updateRow = (index: number, field: keyof Row, value: string | number) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  };

  // --- Supplier Logic ---
  const handleSupplierChange = (name: string) => {
    setSupplierName(name);
    setShowBalanceInput(false);
    setSelectedSupplier(null);
    if (name) {
      setFilteredSuppliers(suppliers.filter(s => s.name && s.name.toLowerCase().includes(name.toLowerCase())));
      setShowSupplierDropdown(true);
    } else { setShowSupplierDropdown(false); }
  };
  const selectSupplier = (supplier: Supplier) => {
    setSupplierName(supplier.name ?? "");
    setSelectedSupplier(supplier);
    setShowSupplierDropdown(false);
    setShowBalanceInput(false);
  };
  const handleSupplierBlur = () => {
    setTimeout(() => {
      setShowSupplierDropdown(false);
      const isNewSupplier = !!(supplierName && !suppliers.some(s => s.name && s.name.toLowerCase() === supplierName.toLowerCase()));
      if (isNewSupplier) { setSelectedSupplier(null); }
      setShowBalanceInput(isNewSupplier);
    }, 200);
  };

  // --- Product Logic ---
  const searchProducts = async (query: string, index: number) => {
    setActiveProductSearchIndex(index);
    if (!query) return setProducts([]);
    const { data } = await supabase.from("products").select("id, name, size, material").ilike("name", `%${query}%`).limit(10);
    setProducts(data ?? []);
  };
  const selectProduct = (index: number, product: Product) => {
    const updatedRows = [...rows];
    updatedRows[index].product = product.name ?? "";
    updatedRows[index].material = product.material ?? "Others"; // This line automatically updates the material
    updatedRows[index].size = product.size ?? "";
    setRows(updatedRows);
    setProducts([]);
    setActiveProductSearchIndex(null);
  };
  const handleProductBlur = async (index: number) => {
      setTimeout(() => setActiveProductSearchIndex(null), 200);
      const productName = rows[index].product;
      if (!productName || products.length > 0) return;
      const { data: exactMatch } = await supabase.from("products").select('id, name, size, material').eq('name', productName).limit(1).single();
      if (exactMatch) { selectProduct(index, exactMatch); }
  };

  // --- Main Save Logic ---
  const savePurchase = async () => {
    if (!supplierName.trim()) return alert("Please select or enter a supplier.");
    const validRows = rows.filter(row => row.product.trim() !== "" && row.qty > 0 && row.price > 0);
    if (validRows.length === 0) return alert("Please add at least one product with a valid quantity and price.");
    setIsSaving(true);
    try {
      let supplierId: number;
      const existingSupplier = suppliers.find(s => s.name && s.name.toLowerCase() === supplierName.toLowerCase());
      if (existingSupplier) {
        supplierId = existingSupplier.id;
      } else {
        const balanceToSave = balanceSide === 'credit' ? openingBalance : -openingBalance;
        const { data: newSupplier, error } = await supabase.from("suppliers").insert({ name: supplierName, opening_balance: balanceToSave }).select("id").single();
        if (error || !newSupplier) throw new Error(error?.message || "Could not create supplier.");
        supplierId = newSupplier.id;
        await fetchInitialData(); // Refetch all initial data
      }
      const purchasePromises = validRows.map(async (row) => {
        let productId: number;
        const { data: existingProducts } = await supabase.from("products").select("id").eq("name", row.product).eq("size", row.size).eq("material", row.material).limit(1);
        if (existingProducts && existingProducts.length > 0) {
          productId = existingProducts[0].id;
        } else {
          const { data: newProduct, error } = await supabase.from("products").insert({ name: row.product, size: row.size || null, material: row.material }).select("id").single();
          if (error || !newProduct) throw new Error(error?.message || "Could not create product.");
          productId = newProduct.id;
        }
        const transactionDate = billDate ? new Date(`${billDate}T00:00:00`) : new Date();
        const stockMoveData = {
          ts: transactionDate.toISOString(), kind: 'purchase' as const, product_id: productId,
          qty: row.qty, price_per_unit: row.price, supplier_id: supplierId,
          bill_no: billNo || null, bill_date: billDate || null,
        };
        return supabase.from('stock_moves').insert(stockMoveData);
      });
      const results = await Promise.all(purchasePromises);
      const firstError = results.find(res => res.error);
      if (firstError) throw firstError.error;
      alert("Purchase saved successfully! ✅");
      setSupplierName(""); setBillNo(""); setSelectedSupplier(null);
      setBillDate(format(new Date(), 'yyyy-MM-dd'));
      setRows([{ material: "Tiles", size: "", product: "", qty: 0, price: 0 }]);
      setShowBalanceInput(false);
      onSaveSuccess();
    } catch (error: any) {
      alert(`Failed to save purchase: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const total = rows.reduce((sum, r) => sum + r.qty * r.price, 0);

  return (
    <div className="card">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="form-grid">
          <div style={{ gridColumn: 'span 2 / span 2', position: 'relative' }}>
            <label>Supplier</label>
            <input type="text" placeholder="Search or create new supplier" value={supplierName} onChange={(e) => handleSupplierChange(e.target.value)} onBlur={handleSupplierBlur} className="form-input"/>
            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="autocomplete-dropdown">
                {filteredSuppliers.map(s => <div key={s.id} onMouseDown={() => selectSupplier(s)} className="autocomplete-item">{s.name}</div>)}
              </div>
            )}
          </div>
          {selectedSupplier && !showBalanceInput && ( <div style={{gridColumn: 'span 2 / span 2'}}><label>Current Balance</label><div className={`balance ${selectedSupplier.opening_balance < 0 ? 'debit' : 'credit'}`}>₹{Math.abs(selectedSupplier.opening_balance).toFixed(2)}<span> ({selectedSupplier.opening_balance < 0 ? 'Debit' : 'Credit'})</span></div></div> )}
          {showBalanceInput && ( <><div><label>Opening Balance</label><input type="text" inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)} className="form-input"/></div><div><label>Balance Type</label><select value={balanceSide} onChange={(e) => setBalanceSide(e.target.value as "debit" | "credit")} className="form-select"><option value="credit">Credit</option><option value="debit">Debit</option></select></div></> )}
          <div><label>Bill No.</label><input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)} className="form-input"/></div>
          <div><label>Bill Date</label><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="form-input"/></div>
        </div>
        <div>
          <table className="table">
            <thead><tr><th>Material</th><th>Size</th><th style={{width: '35%'}}>Product</th><th>Qty</th><th>Price</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    {/* ✅ NEW: Dynamic Material Dropdown */}
                    <select value={row.material} onChange={(e) => updateRow(i, "material", e.target.value)} className="form-select">
                      {materials.map(mat => <option key={mat} value={mat}>{mat}</option>)}
                      <option value="Others">Others</option>
                    </select>
                  </td>
                  <td><input value={row.size} onChange={(e) => updateRow(i, "size", e.target.value)} className="form-input"/></td>
                  <td style={{ position: 'relative' }}>
                    <input value={row.product} onChange={(e) => { updateRow(i, "product", e.target.value); searchProducts(e.target.value, i); }} onBlur={() => handleProductBlur(i)} className="form-input"/>
                    {activeProductSearchIndex === i && products.length > 0 && (
                      <div className="autocomplete-dropdown">
                        {products.map((p) => (<div key={p.id} onMouseDown={() => selectProduct(i, p)} className="autocomplete-item">{p.name} <span style={{color: '#6b7280'}}>({p.size})</span></div>))}
                      </div>
                    )}
                  </td>
                  <td><input type="text" inputMode="decimal" value={row.qty} onChange={(e) => updateRow(i, "qty", parseFloat(e.target.value) || 0)} className="form-input" style={{width: '80px'}}/></td>
                  <td><input type="text" inputMode="decimal" value={row.price} onChange={(e) => updateRow(i, "price", parseFloat(e.target.value) || 0)} className="form-input" style={{width: '100px'}}/></td>
                  <td>₹{(row.qty * row.price).toFixed(2)}</td>
                  <td><button onClick={() => removeRow(i)} style={{color: '#9ca3af', fontWeight: 'bold'}}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
          <button onClick={addRow} className="btn btn-sm" style={{background: '#e5e7eb', color: '#111827'}}>+ Add Item</button>
          <div style={{ textAlign: 'right' }}>
            <div style={{fontSize: '18px', fontWeight: 600}}>Total: <span style={{fontSize: '24px'}}>₹{total.toFixed(2)}</span></div>
            <button onClick={savePurchase} disabled={isSaving} className="btn" style={{ marginTop: '12px' }}>
              {isSaving ? "Saving..." : "Save Purchase"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}