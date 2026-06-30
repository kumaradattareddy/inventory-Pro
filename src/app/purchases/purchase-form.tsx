"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

/* ================= TYPES ================= */

type Row = {
  material: string;
  size: string;
  product: string;
  unit: string;
  qty: number | "";
  price: number | "";
  qty_sqft?: number | "";
};

const GRANITE_SUPPLIER_IDS = [4, 6, 7, 8, 9, 10, 25, 26, 28, 35, 36, 45];

type Supplier = {
  id: number;
  name: string | null;
  opening_balance: number;
};

type Product = {
  id: number;
  name: string | null;
  size: string | null;
  material: string | null;
  unit: string | null;
};

type Props = {
  onSaveSuccess: () => void;
};

/* ================= COMPONENT ================= */

export default function PurchaseForm({ onSaveSuccess }: Props) {
  const supabase = useMemo(() => createClient(), []);

  /* ---------- Supplier State ---------- */
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  /* ---------- Header ---------- */
  const [billDate, setBillDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  /* ---------- Rows ---------- */
  const [rows, setRows] = useState<Row[]>([
    { material: "Tiles", size: "", product: "", unit: "", qty: "", price: "", qty_sqft: "" },
  ]);

  /* ---------- Products ---------- */
  const [materials, setMaterials] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProductIndex, setActiveProductIndex] = useState<number | null>(
    null
  );

  const [isSaving, setIsSaving] = useState(false);

  /* ================= INIT ================= */

  const fetchInitialData = useCallback(async () => {
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("id, name, opening_balance");

    setSuppliers(supplierData ?? []);

    const { data: materialData } = await supabase.rpc("get_unique_materials");
    if (materialData) {
      setMaterials(materialData.map((m: any) => m.material));
    }
  }, [supabase]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  /* ================= SUPPLIER AUTOCOMPLETE ================= */

  const handleSupplierChange = (value: string) => {
    setSupplierName(value);

    if (!value.trim()) {
      setShowSupplierDropdown(false);
      return;
    }

    const matches = suppliers.filter((s) =>
      s.name?.toLowerCase().includes(value.toLowerCase())
    );

    setFilteredSuppliers(matches);
    setShowSupplierDropdown(true);
  };

  const selectSupplier = (supplier: Supplier) => {
    setSupplierName(supplier.name ?? "");
    setShowSupplierDropdown(false);
  };

  const handleSupplierBlur = () => {
    setTimeout(() => setShowSupplierDropdown(false), 150);
  };

  /* ================= ROW HELPERS ================= */

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { material: "Tiles", size: "", product: "", unit: "", qty: "", price: "", qty_sqft: "" },
    ]);

  const removeRow = (index: number) => {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index)
    );
  };

  const updateRow = <K extends keyof Row>(
    index: number,
    field: K,
    value: Row[K]
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  /* ================= PRODUCT AUTOCOMPLETE ================= */

  const searchProducts = async (query: string, index: number) => {
    setActiveProductIndex(index);
    if (!query) return setProducts([]);

    const { data } = await supabase
      .from("products")
      .select("id, name, size, material, unit")
      .ilike("name", `%${query}%`)
      .limit(10);

    setProducts(data ?? []);
  };

  const selectProduct = (index: number, product: Product) => {
    updateRow(index, "product", product.name ?? "");
    updateRow(index, "material", product.material ?? "Others");
    updateRow(index, "size", product.size ?? "");
    updateRow(index, "unit", product.unit ?? "");
    setProducts([]);
    setActiveProductIndex(null);
  };

  /* ================= SAVE ================= */

  const savePurchase = async () => {
    if (!supplierName.trim()) return alert("Enter supplier");

    const validRows = rows.filter(
      (r) => r.product && (Number(r.qty) > 0 || Number(r.qty_sqft) > 0) && Number(r.price) > 0
    );
    if (validRows.length === 0) return alert("Add valid items");

    setIsSaving(true);

    try {
      let supplierId: number;

      const existingSupplier = suppliers.find(
        (s) => s.name?.toLowerCase() === supplierName.toLowerCase()
      );

      if (existingSupplier) {
        supplierId = existingSupplier.id;
      } else {
        const { data } = await supabase
          .from("suppliers")
          .insert({ name: supplierName })
          .select("id")
          .single();
        supplierId = data!.id;
      }

      for (const row of validRows) {
        let productId: number;

        const { data: existingProduct } = await supabase
          .from("products")
          .select("id")
          .eq("name", row.product)
          .eq("size", row.size)
          .eq("material", row.material)
          .limit(1)
          .single();

        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          const { data } = await supabase
            .from("products")
            .insert({
              name: row.product,
              size: row.size || null,
              material: row.material,
              unit: row.unit || null,
            })
            .select("id")
            .single();
          productId = data!.id;
        }

        const isGranite = row.material?.toLowerCase() === "granite" || isGraniteSupplier;
        await supabase.from("stock_moves").insert({
          kind: "purchase",
          supplier_id: supplierId,
          product_id: productId,
          qty: isGranite ? Number(row.qty_sqft) || 0 : Number(row.qty) || 0,
          qty_pcs: isGranite ? Number(row.qty) || 0 : null,
          price_per_unit: Number(row.price),
          bill_date: billDate || null,
          ts: billDate ? new Date(billDate + "T12:00:00").toISOString() : new Date().toISOString(),
        });
      }

      alert("Purchase saved ✅");
      setRows([
        { material: "Tiles", size: "", product: "", unit: "", qty: "", price: "", qty_sqft: "" },
      ]);
      setSupplierName("");
      onSaveSuccess();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Check if selected supplier is a granite supplier
  const selectedSupplier = suppliers.find(
    (s) => s.name?.toLowerCase() === supplierName.toLowerCase()
  );
  const isGraniteSupplier = selectedSupplier
    ? GRANITE_SUPPLIER_IDS.includes(selectedSupplier.id)
    : false;

  const anyGranite = isGraniteSupplier || rows.some(r => r.material?.toLowerCase() === "granite");

  const total = rows.reduce((s, r) => {
    const isGraniteRow = isGraniteSupplier || r.material?.toLowerCase() === "granite";
    const qtyToUse = isGraniteRow ? (Number(r.qty_sqft) || 0) : (Number(r.qty) || 0);
    return s + qtyToUse * (Number(r.price) || 0);
  }, 0);

  const normalQty = rows.reduce((s, r) => {
    const isGraniteRow = isGraniteSupplier || r.material?.toLowerCase() === "granite";
    return s + (!isGraniteRow ? (Number(r.qty) || 0) : 0);
  }, 0);

  const granitePcs = rows.reduce((s, r) => {
    const isGraniteRow = isGraniteSupplier || r.material?.toLowerCase() === "granite";
    return s + (isGraniteRow ? (Number(r.qty) || 0) : 0);
  }, 0);

  const graniteSqFt = rows.reduce((s, r) => {
    const isGraniteRow = isGraniteSupplier || r.material?.toLowerCase() === "granite";
    return s + (isGraniteRow ? (Number(r.qty_sqft) || 0) : 0);
  }, 0);

  let displayTotal = "0";
  if (anyGranite) {
    if (normalQty > 0) {
      displayTotal = `${normalQty} + ${granitePcs} Pcs / ${graniteSqFt} SqFt`;
    } else {
      displayTotal = `${granitePcs} Pcs / ${graniteSqFt} SqFt`;
    }
  } else {
    displayTotal = `${normalQty}`;
  }

  /* ================= UI ================= */

  return (
    <div className="card" style={{ paddingTop: 0 }}>
      <div className="card-body" style={{ paddingTop: "12px", paddingBottom: "12px" }}>

        {/* 🔹 HEADER */}
        <div className="form-grid" style={{ marginBottom: "12px", gap: "16px" }}>
          <div style={{ gridColumn: "span 2", position: "relative", marginTop: 0 }}>
            <label style={{ marginTop: 0 }}>Supplier</label>
            <input
              className="form-input"
              placeholder="Search or create new supplier"
              value={supplierName}
              onChange={(e) => handleSupplierChange(e.target.value)}
              onBlur={handleSupplierBlur}
            />

            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="autocomplete-dropdown">
                {filteredSuppliers.map((s) => (
                  <div
                    key={s.id}
                    className="autocomplete-item"
                    onMouseDown={() => selectSupplier(s)}
                  >
                    {s.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label>Bill Date</label>
            <input
              type="date"
              className="form-input"
              value={billDate}
              onChange={(e) => {
                if (e.target.value) {
                  setBillDate(e.target.value);
                }
              }}
            />
          </div>
        </div>

        {/* 🔹 ITEMS TABLE */}
        <table className="table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Size</th>
              <th>Product</th>
              <th>{anyGranite ? "Unit / Pcs" : "Unit"}</th>
              <th>{anyGranite ? "Qty / SqFt" : "Qty"}</th>
              <th>Price</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <select
                    className="form-select"
                    value={row.material}
                    onChange={(e) =>
                      updateRow(i, "material", e.target.value)
                    }
                  >
                    <option value="Tiles">Tiles</option>
                    <option value="Granite">Granite</option>
                    <option value="Others">Others</option>
                  </select>
                </td>

                <td>
                  <input
                    className="form-input"
                    value={row.size}
                    onChange={(e) =>
                      updateRow(i, "size", e.target.value)
                    }
                  />
                </td>

                <td style={{ position: "relative" }}>
                  <input
                    className="form-input"
                    value={row.product}
                    onChange={(e) => {
                      updateRow(i, "product", e.target.value);
                      searchProducts(e.target.value, i);
                    }}
                  />

                  {activeProductIndex === i && products.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {products.map((p) => (
                        <div
                          key={p.id}
                          className="autocomplete-item"
                          onMouseDown={() => selectProduct(i, p)}
                        >
                          {p.name} <span>({p.size})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>

                <td>
                  {(() => {
                    const isGraniteRow = isGraniteSupplier || row.material?.toLowerCase() === "granite";
                    return isGraniteRow ? (
                      <input
                        className="form-input"
                        type="number"
                        placeholder="pcs"
                        value={row.qty}
                        onChange={(e) =>
                          updateRow(i, "qty", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        style={{ borderColor: '#93c5fd', backgroundColor: '#eff6ff' }}
                      />
                    ) : (
                      <input
                        className="form-input"
                        value={row.unit}
                        onChange={(e) =>
                          updateRow(i, "unit", e.target.value)
                        }
                      />
                    );
                  })()}
                </td>

                <td>
                  {(() => {
                    const isGraniteRow = isGraniteSupplier || row.material?.toLowerCase() === "granite";
                    return isGraniteRow ? (
                      <input
                        className="form-input"
                        type="number"
                        placeholder="sq ft"
                        value={row.qty_sqft}
                        onChange={(e) =>
                          updateRow(i, "qty_sqft", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        style={{ borderColor: '#d0d7de' }}
                      />
                    ) : (
                      <input
                        className="form-input"
                        type="number"
                        placeholder="qty"
                        value={row.qty}
                        onChange={(e) =>
                          updateRow(i, "qty", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    );
                  })()}
                </td>

                <td>
                  <input
                    className="form-input"
                    type="number"
                    value={row.price}
                    onChange={(e) =>
                      updateRow(i, "price", e.target.value === "" ? "" : Number(e.target.value))
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </td>

                <td style={{ textAlign: "right" }}>
                  {(() => {
                    const isGraniteRow = isGraniteSupplier || row.material?.toLowerCase() === "granite";
                    const qtyToUse = isGraniteRow ? (Number(row.qty_sqft) || 0) : (Number(row.qty) || 0);
                    return `₹${(qtyToUse * (Number(row.price) || 0)).toLocaleString("en-IN")}`;
                  })()}
                </td>

                <td>
                  <button
                    className="row-delete-btn"
                    onClick={() => removeRow(i)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 🔹 FOOTER */}
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Summary Row */}
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            padding: "16px 20px", 
            background: "#f8fafc", 
            border: "1px solid #e2e8f0", 
            borderRadius: "8px" 
          }}>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#64748b" }}>
              Total Items: 
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginLeft: "12px" }}>
                {displayTotal}
              </span>
            </div>
            
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>
              Total: 
              <span style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginLeft: "12px" }}>
                ₹{total.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Actions Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button 
              className="btn-secondary" 
              onClick={addRow}
              style={{
                padding: "10px 20px",
                fontSize: "15px",
                fontWeight: 600,
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              + Add Item
            </button>

            <button
              className="btn-primary"
              onClick={savePurchase}
              disabled={isSaving}
              style={{
                padding: "14px 36px",
                fontSize: "16px",
                fontWeight: 600,
                borderRadius: "8px",
                cursor: isSaving ? "not-allowed" : "pointer",
                border: "none",
                background: "#2563eb",
                color: "white",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                transition: "all 0.2s"
              }}
            >
              {isSaving ? "Saving..." : "Save Purchase"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
