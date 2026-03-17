import { createClient } from '@/lib/supabase/server'
import ProductsTable from './products-table'

type ProductRowDB = {
  id: number | null
  name: string | null
  size: string | null
  unit: string | null
  current_stock: number | null
  supplier_name: string | null
}

type Product = {
  id: number
  name: string
  size: string
  unit: string
  current_stock: number
  supplier_name: string | null
}

export default async function ProductsPage() {
  const supabase = await createClient()

  // Supabase limits results to 1000 rows by default.
  // Fetch ALL products by paginating in batches.
  const PAGE_SIZE = 1000
  let allRows: ProductRowDB[] = []
  let from = 0
  let keepGoing = true

  while (keepGoing) {
    const { data, error } = await supabase
      .from('product_stock_live' as never)
      .select(`
        id,
        name,
        size,
        unit,
        current_stock,
        supplier_name
      `)
      .order('name')
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as ProductRowDB[]
    allRows = allRows.concat(rows)

    if (rows.length < PAGE_SIZE) {
      keepGoing = false
    } else {
      from += PAGE_SIZE
    }
  }

  const rows = allRows

  const products: Product[] = rows.flatMap((r) => {
    const id = Number(r.id)
    if (!Number.isFinite(id)) return []

    return [
      {
        id,
        name: r.name ?? '',
        size: r.size ?? '',
        unit: r.unit ?? '',
        current_stock: Number(r.current_stock ?? 0),
        supplier_name: r.supplier_name ?? null,
      },
    ]
  })

  return <ProductsTable products={products} />
}
