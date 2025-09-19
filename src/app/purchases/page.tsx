import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const supabase = createClient();

  // fetch suppliers + products for dropdowns
  const { data: suppliers } = await supabase.from("suppliers").select("id, name");
  const { data: products } = await supabase.from("products").select("id, name");

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">New Purchase</h1>
      </div>

      <form
        action="/api/purchases"
        method="post"
        className="card p-6 flex flex-col gap-4 max-w-lg"
      >
        {/* Supplier */}
        <label className="flex flex-col gap-1">
          <span>Supplier</span>
          <select name="supplier_id" className="border p-2 rounded" required>
            <option value="">Select supplier</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* Product */}
        <label className="flex flex-col gap-1">
          <span>Product</span>
          <select name="product_id" className="border p-2 rounded" required>
            <option value="">Select product</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* Quantity */}
        <label className="flex flex-col gap-1">
          <span>Quantity</span>
          <input
            type="number"
            name="qty"
            step="1"
            className="border p-2 rounded"
            required
          />
        </label>

        {/* Price */}
        <label className="flex flex-col gap-1">
          <span>Price per unit</span>
          <input
            type="number"
            name="price_per_unit"
            step="0.01"
            className="border p-2 rounded"
            required
          />
        </label>

        {/* Notes */}
        <label className="flex flex-col gap-1">
          <span>Notes</span>
          <textarea name="notes" className="border p-2 rounded" rows={2} />
        </label>

        <button type="submit" className="btn">
          Save Purchase
        </button>
      </form>
    </div>
  );
}
