import { createClient } from '@/lib/supabase/server'
import GraniteTable from './granite-table'

type GraniteRowDB = {
  id: number | null
  name: string | null
  size: string | null
  unit: string | null
  stock_pcs: number | null
  stock_sqft: number | null
  supplier_name: string | null
}

type GraniteProduct = {
  id: number
  name: string
  size: string
  unit: string
  stock_pcs: number
  stock_sqft: number
  supplier_name: string | null
}

export default async function GranitePage() {
  const supabase = await createClient()

  const PAGE_SIZE = 1000
  let allRows: GraniteRowDB[] = []
  let from = 0
  let keepGoing = true

  while (keepGoing) {
    const { data, error } = await supabase
      .from('granite_stock_live' as never)
      .select(`id, name, size, unit, stock_pcs, stock_sqft, supplier_name`)
      .order('name')
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as GraniteRowDB[]
    allRows = allRows.concat(rows)

    if (rows.length < PAGE_SIZE) {
      keepGoing = false
    } else {
      from += PAGE_SIZE
    }
  }

  const products: GraniteProduct[] = allRows.flatMap((r) => {
    const id = Number(r.id)
    if (!Number.isFinite(id)) return []

    return [{
      id,
      name: r.name ?? '',
      size: r.size ?? '',
      unit: r.unit ?? '',
      stock_pcs: Number(r.stock_pcs ?? 0),
      stock_sqft: Number(r.stock_sqft ?? 0),
      supplier_name: r.supplier_name ?? null,
    }]
  })

  return <GraniteTable products={products} />
}
