"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

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

type PurchaseFormProps = {
  onSaveSuccess: () => void;
};

export default function PurchaseForm({ onSaveSuccess }: PurchaseFormProps) {
  const supabase = createClient();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null
  );

  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );

  const [rows, setRows] = useState<Row[]>([
    { material: "Tiles", size: "", product: "", unit: "", qty: 0, price: 0 },
  ]);

  const [products, setProducts] = useState<Product[]>([]);
  const [activeProductSearchIndex, setActiveProductSearchIndex] =
    useState<number | null>(null);

  const [materials, setMaterials] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const fetchInitialData = useCallback(async () => {
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("id, name, opening_balance");

    setSuppliers(supplierData ?? []);

    const { data: materialData } = await supabase.rpc(
      "get_unique_materials"
    );

    if (materialData) {
      setMaterials(materialData.map((m: any) => m.material));
    }
  }, [supabase]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const addRow = () =>
    setRows([
      ...rows,
      { material: "Tiles", size: "", product: "", unit: "", qty: 0, price: 0 },
    ]);

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (
    index: number,
    field: keyof Row,
    value: string | number
  ) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  };

  const searchProducts = async (query: string, index: number) => {
    setActiveProductSearchIndex(index);
    if (!query) return setProducts([]);

    const { data } = await supabase
      .from("products")
      .select("id, name, size, material, unit")
      .ilike("name", `%${query}%`)
      .limit(10);

    setProducts(data ?? []);
  };

  const selectProduct = (index: number, product: Product) => {
    const updated = [...rows];
    updated[index].product = product.name ?? "";
    updated[index].material = product.material ?? "Others";
    updated[index].size = product.size ?? "";
    updated[index].unit = product.unit ?? "";
    setRows(updated);
    setProducts([]);
    setActiveProductSearchIndex(null);
  };

  const savePurchase = async () => {
    if (!supplierName.trim()) {
      alert("Select supplier");
      return;
    }

    const validRows = rows.filter(
      (r) => r.product && r.qty > 0 && r.price > 0
    );

    if (validRows.length === 0) {
      alert("Add at least one valid product");
      return;
    }

    setIsSaving(true);

    try {
      let supplierId: number;

      const existingSupplier = suppliers.find(
        (s) =>
          s.name?.toLowerCase() === supplierName.toLowerCase()
      );

      if (existingSupplier) {
        supplierId = existingSupplier.id;
      } else {
        const { data: newSupplier } = await supabase
          .from("suppliers")
          .insert({ name: supplierName })
          .select("id")
          .single();

        supplierId = newSupplier!.id;
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
          const { data: newProduct } = await supabase
            .from("products")
            .insert({
              name: row.product,
              size: row.size || null,
              material: row.material,
              unit: row.unit || null,
            })
            .select("id")
            .single();

          productId = newProduct!.id;
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

      alert("Purchase saved successfully ✅");

      setRows([
        { material: "Tiles", size: "", product: "", unit: "", qty: 0, price: 0 },
      ]);
      setSupplierName("");
      setBillNo("");
      onSaveSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);

  return (
    <div className="card">
      <div className="card-body">
        <table className="table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Size</th>
              <th>Product</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <select
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
                    value={row.size}
                    onChange={(e) =>
                      updateRow(i, "size", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    value={row.product}
                    onChange={(e) => {
                      updateRow(i, "product", e.target.value);
                      searchProducts(e.target.value, i);
                    }}
                  />
                  {activeProductSearchIndex === i &&
                    products.map((p) => (
                      <div
                        key={p.id}
                        onMouseDown={() => selectProduct(i, p)}
                      >
                        {p.name}
                      </div>
                    ))}
                </td>

                <td>
                  <input
                    value={row.unit}
                    onChange={(e) =>
                      updateRow(i, "unit", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(i, "qty", Number(e.target.value))
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={row.price}
                    onChange={(e) =>
                      updateRow(i, "price", Number(e.target.value))
                    }
                  />
                </td>

                <td>₹{(row.qty * row.price).toFixed(2)}</td>

                <td>
                  <button onClick={() => removeRow(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={addRow}>+ Add Item</button>
          <div>
            <b>Total: ₹{total.toFixed(2)}</b>
            <br />
            <button onClick={savePurchase} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Purchase"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
