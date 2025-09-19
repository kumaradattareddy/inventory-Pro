import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'
import SearchBar from '@/components/SearchBar'

type ProductDetails =
  Database['public']['Functions']['get_products_with_details']['Returns'][number]

export default async function ProductsPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  let { data: products, error } = await supabase.rpc('get_products_with_details')

  const { q } = await props.searchParams
  const query = (q ?? '').toLowerCase()

  if (query && products) {
    products = products.filter(
      (p) =>
        (p.name?.toLowerCase() ?? '').includes(query) ||
        (p.size?.toLowerCase() ?? '').includes(query) ||
        (p.supplier_name?.toLowerCase() ?? '').includes(query)
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Products</h2>
        <SearchBar placeholder="Search products..." />
      </div>

      <div className="card-body">
        {!products || products.length === 0 ? (
          <p className="empty">No products found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Current Stock</th>
                <th>Unit</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: ProductDetails) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.size}</td>
                  <td className={p.current_stock < 10 ? 'low-stock' : ''}>
                    {p.current_stock}
                  </td>
                  <td>
                    <span className="badge">{p.unit}</span>
                  </td>
                  <td>{p.supplier_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
