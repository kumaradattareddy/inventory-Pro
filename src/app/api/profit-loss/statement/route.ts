export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
 * Profit for a date range — selling price vs purchase price.
 *
 *   Sales (qty × selling rate on every "sale" stock move)
 * − Discounts (bill_adjustments type=discount)
 * = Net Sales
 * − Purchase Cost (moving-average purchase price per product, as of the sale date)
 * = Profit
 *
 * Hamali, transport, GST and other bill charges are paid by the customer and
 * passed on, so they are reported for reference only and not counted as profit.
 *
 * Dates are compared as IST calendar days (YYYY-MM-DD).
 */

const PAGE = 1000;
const MAX_PAGES = 100;

async function fetchAll(
  build: (from: number, to: number) => any
): Promise<any[]> {
  const all: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// UTC timestamp -> IST calendar date "YYYY-MM-DD"
function istDay(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function moveDay(m: { bill_date: string | null; ts: string | null }): string | null {
  return m.bill_date ? String(m.bill_date).slice(0, 10) : istDay(m.ts);
}

const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v; // normalise -0
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "0000-01-01";
  const to = searchParams.get("to") || "9999-12-31";
  const inRange = (d: string | null) => !!d && d >= from && d <= to;

  const supabase = createClient();

  try {
    const [moves, products, adjustments, customers] = await Promise.all([
      // All purchases + sales ever: costing needs the full history
      fetchAll((a, b) =>
        supabase
          .from("stock_moves")
          .select("id, ts, bill_date, kind, product_id, qty, price_per_unit, bill_no, customer_id")
          .in("kind", ["purchase", "sale"])
          .order("id", { ascending: true })
          .range(a, b)
      ),
      fetchAll((a, b) =>
        supabase.from("products").select("id, name, size, unit").order("id").range(a, b)
      ),
      fetchAll((a, b) =>
        supabase
          .from("bill_adjustments")
          .select("id, created_at, bill_no, type, details, amount")
          .in("type", ["charge", "discount", "Charge", "Discount"])
          .order("id")
          .range(a, b)
      ),
      fetchAll((a, b) => supabase.from("customers").select("id, name").order("id").range(a, b)),
    ]);

    const customerName = new Map<number, string>();
    customers.forEach((c: any) => customerName.set(c.id, c.name));

    const productInfo = new Map<number, { name: string; size: string | null; unit: string | null }>();
    products.forEach((p: any) =>
      productInfo.set(p.id, { name: p.name || `#${p.id}`, size: p.size, unit: p.unit })
    );

    /* ---------- 1. Purchase cost of each sale (perpetual moving average) ---------- */

    // Fallback cost for sales that happen before the product's first priced
    // purchase: the product's overall weighted-average purchase price.
    const overall = new Map<number, { qty: number; value: number }>();
    for (const m of moves) {
      if (m.kind !== "purchase" || !m.product_id) continue;
      const q = Number(m.qty) || 0;
      const p = Number(m.price_per_unit) || 0;
      if (q <= 0 || p <= 0) continue;
      const o = overall.get(m.product_id) || { qty: 0, value: 0 };
      o.qty += q;
      o.value += q * p;
      overall.set(m.product_id, o);
    }

    // Chronological order: by day, purchases before sales on the same day, then id
    const ordered = moves
      .filter((m: any) => m.product_id)
      .map((m: any) => ({ ...m, day: moveDay(m) || "0000-01-01" }))
      .sort((a: any, b: any) =>
        a.day !== b.day
          ? a.day < b.day ? -1 : 1
          : a.kind !== b.kind
            ? a.kind === "purchase" ? -1 : 1
            : a.id - b.id
      );

    type SaleLine = {
      day: string;
      billNo: string;
      customerId: number | null;
      productId: number;
      qty: number;
      revenue: number;
      cost: number;
      missingCost: boolean;
    };

    const state = new Map<number, { qty: number; avg: number | null }>();
    const saleLines: SaleLine[] = [];

    // Everything bought in the period, regardless of whether it has been sold yet
    let purchasedTotal = 0;
    let purchaseCount = 0;
    const monthPurchased = new Map<string, number>();

    for (const m of ordered) {
      const pid = m.product_id as number;
      const s = state.get(pid) || { qty: 0, avg: null };
      const q = Number(m.qty) || 0;
      const p = Number(m.price_per_unit) || 0;

      if (m.kind === "purchase") {
        if (inRange(m.day)) {
          purchasedTotal += q * p;
          purchaseCount += 1;
          const k = m.day.slice(0, 7);
          monthPurchased.set(k, (monthPurchased.get(k) || 0) + q * p);
        }
        if (q > 0 && p > 0) {
          const held = Math.max(s.qty, 0);
          s.avg = held > 0 && s.avg !== null ? (held * s.avg + q * p) / (held + q) : p;
        }
        s.qty += q;
      } else {
        let unitCost = s.avg;
        if (unitCost === null) {
          const o = overall.get(pid);
          unitCost = o && o.qty > 0 ? o.value / o.qty : null;
        }
        s.qty -= q;
        if (inRange(m.day)) {
          saleLines.push({
            day: m.day,
            billNo: m.bill_no ? String(m.bill_no).trim() : "—",
            customerId: m.customer_id,
            productId: pid,
            qty: q,
            revenue: q * p,
            cost: q * (unitCost ?? 0),
            missingCost: unitCost === null,
          });
        }
      }
      state.set(pid, s);
    }

    /* ---------- 2. Discounts (reduce sales) and pass-through charges ---------- */

    let discounts = 0;
    const charges = new Map<string, number>(); // hamali, transport, GST... paid by customer
    const billDiscount = new Map<string, number>();
    const monthDiscount = new Map<string, number>();

    for (const a of adjustments) {
      const day = istDay(a.created_at);
      if (!inRange(day)) continue;
      const amt = Number(a.amount) || 0;
      const billNo = a.bill_no ? String(a.bill_no).trim() : "—";

      if (String(a.type).toLowerCase() === "discount") {
        discounts += amt;
        billDiscount.set(billNo, (billDiscount.get(billNo) || 0) + amt);
        const month = day!.slice(0, 7);
        monthDiscount.set(month, (monthDiscount.get(month) || 0) + amt);
      } else {
        const raw = String(a.details || "Other").trim() || "Other";
        const label = /^gst$/i.test(raw)
          ? "GST"
          : /hamali/i.test(raw)
            ? "Hamali"
            : /transport/i.test(raw)
              ? "Transport"
              : "Other charges";
        charges.set(label, (charges.get(label) || 0) + amt);
      }
    }

    /* ---------- 3. Totals ---------- */

    const sales = saleLines.reduce((s, l) => s + l.revenue, 0);
    const cost = saleLines.reduce((s, l) => s + l.cost, 0);
    const netSales = sales - discounts;
    const profit = netSales - cost;
    const missing = saleLines.filter((l) => l.missingCost);

    /* ---------- 4. Breakdowns ---------- */

    // By month
    const monthMap = new Map<string, { sales: number; cost: number }>();
    saleLines.forEach((l) => {
      const k = l.day.slice(0, 7);
      const v = monthMap.get(k) || { sales: 0, cost: 0 };
      v.sales += l.revenue;
      v.cost += l.cost;
      monthMap.set(k, v);
    });
    const months = Array.from(new Set([...monthMap.keys(), ...monthDiscount.keys(), ...monthPurchased.keys()]))
      .sort()
      .map((k) => {
        const v = monthMap.get(k) || { sales: 0, cost: 0 };
        const ns = v.sales - (monthDiscount.get(k) || 0);
        return {
          month: k,
          purchased: r2(monthPurchased.get(k) || 0),
          netSales: r2(ns),
          cost: r2(v.cost),
          profit: r2(ns - v.cost),
          margin: ns > 0 ? r2(((ns - v.cost) / ns) * 100) : 0,
        };
      });

    // By product
    const prodMap = new Map<number, { qty: number; revenue: number; cost: number; missing: boolean }>();
    saleLines.forEach((l) => {
      const v = prodMap.get(l.productId) || { qty: 0, revenue: 0, cost: 0, missing: false };
      v.qty += l.qty;
      v.revenue += l.revenue;
      v.cost += l.cost;
      if (l.missingCost) v.missing = true;
      prodMap.set(l.productId, v);
    });
    const productRows = Array.from(prodMap.entries())
      .map(([id, v]) => {
        const info = productInfo.get(id);
        return {
          id,
          name: info?.name || `#${id}`,
          size: info?.size || null,
          unit: info?.unit || null,
          qty: r2(v.qty),
          avgSellRate: v.qty > 0 ? r2(v.revenue / v.qty) : 0,
          avgBuyRate: v.qty > 0 ? r2(v.cost / v.qty) : 0,
          revenue: r2(v.revenue),
          cost: r2(v.cost),
          profit: r2(v.revenue - v.cost),
          margin: v.revenue > 0 ? r2(((v.revenue - v.cost) / v.revenue) * 100) : 0,
          missingCost: v.missing,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    // By bill
    const billMap = new Map<string, { day: string; customerId: number | null; sales: number; cost: number; missing: boolean }>();
    saleLines.forEach((l) => {
      const v = billMap.get(l.billNo) || { day: l.day, customerId: l.customerId, sales: 0, cost: 0, missing: false };
      v.sales += l.revenue;
      v.cost += l.cost;
      if (l.missingCost) v.missing = true;
      if (l.day < v.day) v.day = l.day;
      billMap.set(l.billNo, v);
    });
    const billRows = Array.from(billMap.entries())
      .map(([billNo, v]) => {
        const discount = billDiscount.get(billNo) || 0;
        const ns = v.sales - discount;
        return {
          billNo,
          date: v.day,
          customer: v.customerId ? customerName.get(v.customerId) || "Unknown" : "—",
          discount: r2(discount),
          netSales: r2(ns),
          cost: r2(v.cost),
          profit: r2(ns - v.cost),
          margin: ns > 0 ? r2(((ns - v.cost) / ns) * 100) : 0,
          missingCost: v.missing,
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return NextResponse.json({
      from,
      to,
      summary: {
        sales: r2(sales),
        discounts: r2(discounts),
        netSales: r2(netSales),
        cost: r2(cost),
        profit: r2(profit),
        margin: netSales > 0 ? r2((profit / netSales) * 100) : 0,
        billCount: billRows.length,
        purchased: r2(purchasedTotal),
        purchaseCount,
        customerCharges: Array.from(charges.entries())
          .map(([label, amount]) => ({ label, amount: r2(amount) }))
          .sort((a, b) => b.amount - a.amount),
      },
      warnings: {
        missingCostLines: missing.length,
        missingCostRevenue: r2(missing.reduce((s, l) => s + l.revenue, 0)),
      },
      months,
      products: productRows,
      bills: billRows,
    });
  } catch (e: any) {
    console.error("P&L statement error:", e);
    return NextResponse.json({ error: e.message || "Failed to build statement" }, { status: 500 });
  }
}
