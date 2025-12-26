"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

/* ================= TYPES ================= */

type Row = {
  material: string;
  size: string;
  product: string;
  unit: string;
  qty: number;
  price: number;
};

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
  const supabase = createClient();

  /* ---------- Supplier State ---------- */
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  /* ---------- Header ---------- */
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));

  /* ---------- Rows ---------- */
  const [rows, setRows] = useState<Row[]>([
    { material: "Tiles", size: "", product: "", unit: "", qty: 0, price: 0 },
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
      { material: "Tiles", size: "", product: "", unit: "", qty: 0, price: 0 },
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
      (r) => r.product && r.qty > 0 && r.price > 0
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

        await supabase.from("stock_moves").insert({
          kind: "purchase",
          supplier_id: supplierId,
          product_id: productId,
          qty: row.qty,
          price_per_unit: row.price,
          bill_no: billNo || null,
          bill_date: billDate || null,
        });
      }

      alert("Purchase saved ✅");
      setRows([
        { material: "Tiles", size: "", product: "", unit: "", qty: 0, price: 0 },
      ]);
      setSupplierName("");
      setBillNo("");
      onSaveSuccess();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);

  /* ================= UI ================= */

  return (
    <div className="card">
      <div className="card-body">

        {/* 🔹 HEADER */}
        <div className="form-grid">
          <div style={{ gridColumn: "span 2", position: "relative" }}>
            <label>Supplier</label>
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
            <label>Bill No.</label>
            <input
              className="form-input"
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
            />
          </div>

          <div>
            <label>Bill Date</label>
            <input
              type="date"
              className="form-input"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
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
              <th>Unit</th>
              <th>Qty</th>
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
                    {materials.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                    <option>Others</option>
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
                  <input
                    className="form-input"
                    value={row.unit}
                    onChange={(e) =>
                      updateRow(i, "unit", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    className="form-input"
                    type="number"
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(i, "qty", Number(e.target.value))
                    }
                  />
                </td>

                <td>
                  <input
                    className="form-input"
                    type="number"
                    value={row.price}
                    onChange={(e) =>
                      updateRow(i, "price", Number(e.target.value))
                    }
                  />
                </td>

                <td style={{ textAlign: "right" }}>
                  ₹{(row.qty * row.price).toFixed(2)}
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
        <div className="purchase-footer">
          <button className="btn-secondary" onClick={addRow}>
            + Add Item
          </button>

          <div className="purchase-summary">
            <div className="total">
              Total: <span>₹{total.toFixed(2)}</span>
            </div>
            <button
              className="btn-primary"
              onClick={savePurchase}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Purchase"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
