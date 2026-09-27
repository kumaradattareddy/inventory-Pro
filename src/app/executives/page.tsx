/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeftIcon,
  CalendarIcon,
  UserIcon,
  BanknotesIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  TrophyIcon,
  ArrowTrendingUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

// A sub executive earns a 10% commission credit on a bill; the main executive gets the full 100%.
const SUB_EXECUTIVE_SHARE = 0.10;

type ExecRole = "main" | "sub";
type ExecEntry = { name: string; role: ExecRole };

type BillItem = {
  billNo: string;
  date: string;
  customerId: number | null;
  customerName: string;
  amount: number;
  paid: number;
  credit: number;
  status: "paid" | "partial" | "unpaid";
  role?: ExecRole; // role this specific executive played on this bill (set per-executive when aggregating)
  sharedWith?: string; // main only: name(s) of the sub executive(s) who took a cut of this bill
};

type ExecutiveStats = {
  name: string;
  totalSold: number;
  totalPaid: number;
  totalCredit: number;
  billsCount: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  bills: BillItem[];
};

// Robust date parser that handles "DD/MM/YYYY", "D/M/YYYY", "YYYY-MM-DD", ISO strings, and timestamps
function parseDate(d: string | null | undefined): number {
  if (!d) return 0;
  const str = String(d).trim();
  if (!str || str === "—") return 0;

  // DD/MM/YYYY or D/M/YYYY
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
      const parsed = new Date(year, month, day).getTime();
      if (!isNaN(parsed)) return parsed;
    }
  }

  // DD-MM-YYYY or YYYY-MM-DD
  if (str.includes("-") && !str.includes("T")) {
    const parts = str.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const parsed = new Date(year, month, day).getTime();
        if (!isNaN(parsed)) return parsed;
      } else {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const parsed = new Date(year, month, day).getTime();
        if (!isNaN(parsed)) return parsed;
      }
    }
  }

  const native = new Date(str).getTime();
  return isNaN(native) ? 0 : native;
}

// Helper: fetch all pages from Supabase safely when user clicks 'All Time'
async function fetchAllRows(supabase: any, table: string, select = "*") {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      break;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      hasMore = false;
    }
  }
  return allData;
}

export default function ExecutivesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allHistoryLoaded, setAllHistoryLoaded] = useState(false);

  // Raw Database Data
  const [rawLedger, setRawLedger] = useState<any[]>([]);
  const [rawAdjustments, setRawAdjustments] = useState<any[]>([]);
  const [rawPayments, setRawPayments] = useState<any[]>([]);
  const [rawCustomers, setRawCustomers] = useState<any[]>([]);

  // Filter States
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "yesterday" | "week" | "month" | "this_month" | "custom"
  >("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "partial" | "unpaid">("all");

  // Selection for Drill-down
  const [selectedExecName, setSelectedExecName] = useState<string | null>(null);

  // 1. FAST INITIAL LOAD: Only fetch from the 1st of current month (covers Today, Yesterday, Last 7 Days, This Month)
  // Fetch all data for complete customer balance & advance accuracy
  const loadData = async () => {
    try {
      setLoading(true);
      const [ledgerData, adjData, paymentsData, customersData] = await Promise.all([
        fetchAllRows(supabase, "bill_transaction_ledger"),
        fetchAllRows(supabase, "bill_adjustments"),
        fetchAllRows(supabase, "payments"),
        fetchAllRows(supabase, "customers", "id, name, opening_balance"),
      ]);

      setRawLedger(ledgerData);
      setRawAdjustments(adjData);
      setRawPayments(paymentsData);
      setRawCustomers(customersData);
      setAllHistoryLoaded(true);
    } catch (err) {
      console.error("Failed to load executive data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDateFilterChange = (filter: any) => {
    setDateFilter(filter);
  };

  // Compute all bills and assign to executives
  const processedData = useMemo(() => {
    const custMap = new Map<number, string>();
    rawCustomers.forEach((c) => custMap.set(c.id, c.name));

    // 1. Group Ledger entries by (bill_no, customer_id) and extract standalone payments
    const billGroups: Record<string, { bNo: string; cid: number | null; items: any[] }> = {};
    const standalonePaymentsByCustomer: Record<number, number> = {};

    rawLedger.forEach((row) => {
      const bNo = row.bill_no ? String(row.bill_no).trim() : "";
      const t = (row.type || "").toLowerCase();
      const cid = row.customer_id ? Number(row.customer_id) : null;
      const amt = Number(row.amount) || 0;

      if (!bNo || bNo === "—") {
        // Standalone transaction without a bill number
        if (cid) {
          if (t === "payment") {
            standalonePaymentsByCustomer[cid] = (standalonePaymentsByCustomer[cid] || 0) + Math.abs(amt);
          } else if (t === "discount" && amt < 0) {
            standalonePaymentsByCustomer[cid] = (standalonePaymentsByCustomer[cid] || 0) + Math.abs(amt);
          }
        }
      } else {
        const groupKey = `${bNo}__${cid || 'none'}`;
        if (!billGroups[groupKey]) billGroups[groupKey] = { bNo, cid, items: [] };
        billGroups[groupKey].items.push(row);
      }
    });

    // 2. Map bill_no to executives, with role (main/sub).
    // bill_adjustments.id reliably preserves insertion order — executives are
    // always inserted [main, sub] — so the lowest id per bill is the main
    // executive and any after it is sub. (The ledger view carries the same
    // "Executive" rows too, but with no ordering info since they share a
    // timestamp, so bill_adjustments is used as the sole source of truth here.)
    const billToExecs: Record<string, ExecEntry[]> = {};
    const execAdjustments = rawAdjustments
      .filter((adj) => adj.type?.toLowerCase() === "executive" && adj.bill_no && adj.details)
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    execAdjustments.forEach((adj) => {
      const bNo = String(adj.bill_no).trim();
      const exName = String(adj.details).trim();
      if (!bNo || !exName) return;
      const list = billToExecs[bNo] || (billToExecs[bNo] = []);
      if (!list.some((e) => e.name === exName)) {
        list.push({ name: exName, role: list.length === 0 ? "main" : "sub" });
      }
    });

    // 2.5 Map bill_no to customer_id from all sources
    const billToCustomer: Record<string, number> = {};
    rawLedger.forEach((row) => {
      const bNo = row.bill_no ? String(row.bill_no).trim() : "";
      if (bNo && row.customer_id) {
        billToCustomer[bNo] = Number(row.customer_id);
      }
    });
    rawAdjustments.forEach((adj) => {
      const bNo = adj.bill_no ? String(adj.bill_no).trim() : "";
      if (bNo && adj.customer_id) {
        billToCustomer[bNo] = Number(adj.customer_id);
      }
    });

    // 3. Process each bill group (Sales, payments, and discount returns)
    const customerBillsMap: Record<number, any[]> = {};
    const unassignedCustomerBills: any[] = [];
    const customerTotalPayments: Record<number, number> = { ...standalonePaymentsByCustomer };

    Object.values(billGroups).forEach(({ bNo, cid: groupCid, items }) => {
      const sorted = [...items].sort((a, b) => parseDate(a.date) - parseDate(b.date));
      const first = sorted[0];
      const billDate = first?.date || "";

      // Customer resolution
      const itemWithCust = sorted.find((i) => i.customer_id);
      const cid =
        groupCid ||
        (itemWithCust?.customer_id ? Number(itemWithCust.customer_id) : null) ||
        billToCustomer[bNo] ||
        null;
      const customerName = cid && custMap.has(cid) ? custMap.get(cid)! : "—";

      let billNet = 0;
      let billPayments = 0;

      sorted.forEach((item) => {
        const t = (item.type || "").toLowerCase();
        const amt = Number(item.amount) || 0;
        if (["sale", "charge", "extra charges", "hamali", "transport", "gst"].includes(t)) {
          billNet += amt;
        } else if (t === "discount") {
          billNet -= Math.abs(amt);
        } else if (t === "payment") {
          billPayments += Math.abs(amt);
        }
      });

      // Add payments on this bill into customer's payment pool
      if (cid && billPayments > 0) {
        customerTotalPayments[cid] = (customerTotalPayments[cid] || 0) + billPayments;
      }

      const execs = billToExecs[bNo] || [];

      if (billNet > 0) {
        const billObj = {
          billNo: bNo,
          date: billDate,
          customerId: cid,
          customerName,
          amount: Math.round(billNet * 100) / 100,
          directPaid: 0,
          fifoPaid: 0,
          paid: 0,
          credit: Math.round(billNet * 100) / 100,
          status: "unpaid" as "paid" | "partial" | "unpaid",
          execs,
        };

        if (cid) {
          if (!customerBillsMap[cid]) customerBillsMap[cid] = [];
          customerBillsMap[cid].push(billObj);
        } else {
          unassignedCustomerBills.push(billObj);
        }
      } else {
        // Standalone discount returns / credit notes on bills with billNet < 0
        if (cid && billNet < 0) {
          customerTotalPayments[cid] = (customerTotalPayments[cid] || 0) + Math.abs(billNet);
        }
      }
    });

    // Customer Opening Balance Map
    const custOpeningBalanceMap = new Map<number, number>();
    rawCustomers.forEach((c) => custOpeningBalanceMap.set(c.id, Number(c.opening_balance) || 0));

    // 4. Run Pure Chronological FIFO Settlement for each customer (Oldest bills & opening balance cleared first)
    const allBills: (BillItem & { execs: ExecEntry[] })[] = [...unassignedCustomerBills];

    Object.entries(customerBillsMap).forEach(([cidStr, cBills]) => {
      const cid = Number(cidStr);
      // Sort bills chronologically (oldest to newest)
      cBills.sort((a, b) => parseDate(a.date) - parseDate(b.date));

      let pool = customerTotalPayments[cid] || 0;

      // Step A: Reduce Customer's Opening Balance FIRST
      let openingBal = custOpeningBalanceMap.get(cid) || 0;
      if (openingBal > 0 && pool > 0) {
        const reduceOp = Math.min(openingBal, pool);
        openingBal -= reduceOp;
        pool -= reduceOp;
      }

      // Step B: Settle oldest unpaid bills in chronological order (FIFO)
      cBills.forEach((b) => {
        if (pool > 0) {
          const settlement = Math.min(b.amount, pool);
          b.paid = Math.round(settlement * 100) / 100;
          b.credit = Math.round(Math.max(0, b.amount - b.paid) * 100) / 100;
          pool -= settlement;

          if (b.paid >= b.amount) {
            b.status = "paid";
          } else if (b.paid > 0) {
            b.status = "partial";
          } else {
            b.status = "unpaid";
          }
        } else {
          b.paid = 0;
          b.credit = b.amount;
          b.status = "unpaid";
        }
        allBills.push(b);
      });
    });

    return { allBills, allExecNames: Array.from(new Set(Object.values(billToExecs).flatMap((list) => list.map((e) => e.name)))) };
  }, [rawLedger, rawAdjustments, rawPayments, rawCustomers]);

  // Date filtering logic
  const filteredBills = useMemo(() => {
    const { allBills } = processedData;
    if (dateFilter === "all") return allBills;

    const now = new Date();
    let start: number | null = null;
    let end: number | null = null;

    if (dateFilter === "today") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      start = s.getTime();
      end = e.getTime();
    } else if (dateFilter === "yesterday") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      start = s.getTime();
      end = e.getTime();
    } else if (dateFilter === "week") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      start = s.getTime();
      end = e.getTime();
    } else if (dateFilter === "this_month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      start = s.getTime();
      end = e.getTime();
    } else if (dateFilter === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      start = s.getTime();
      end = e.getTime();
    } else if (dateFilter === "custom") {
      if (customStart) {
        start = new Date(customStart + "T00:00:00").getTime();
      }
      if (customEnd) {
        end = new Date(customEnd + "T23:59:59.999").getTime();
      }
    }

    return allBills.filter((bill) => {
      if (!bill.date) return false;
      const bTime = parseDate(bill.date);
      if (!bTime) return true;
      if (start && bTime < start) return false;
      if (end && bTime > end) return false;
      return true;
    });
  }, [processedData, dateFilter, customStart, customEnd]);

  // Aggregate by executive
  const executiveStatsList = useMemo(() => {
    const execMap: Record<string, ExecutiveStats> = {};

    filteredBills.forEach((bill) => {
      const execList: ExecEntry[] = bill.execs.length > 0 ? bill.execs : [{ name: "Unassigned", role: "main" }];

      // Sub executive(s) take a 10% commission cut each; main keeps whatever's left
      // (90% when there's one sub) — the shares always add up to exactly 100% of the bill.
      const subEntries = execList.filter((e) => e.role === "sub");
      const mainShare = Math.max(0, 1 - subEntries.length * SUB_EXECUTIVE_SHARE);
      const sharedWithNames = subEntries.map((e) => e.name).join(", ");

      execList.forEach(({ name: execName, role }) => {
        const share = role === "sub" ? SUB_EXECUTIVE_SHARE : mainShare;

        if (!execMap[execName]) {
          execMap[execName] = {
            name: execName,
            totalSold: 0,
            totalPaid: 0,
            totalCredit: 0,
            billsCount: 0,
            paidCount: 0,
            partialCount: 0,
            unpaidCount: 0,
            bills: [],
          };
        }

        execMap[execName].totalSold += bill.amount * share;
        execMap[execName].totalPaid += bill.paid * share;
        execMap[execName].totalCredit += bill.credit * share;
        execMap[execName].billsCount += 1;

        // Status breakdown reflects the bill's true payment state, not the executive's share.
        if (bill.status === "paid") execMap[execName].paidCount += 1;
        else if (bill.status === "partial") execMap[execName].partialCount += 1;
        else execMap[execName].unpaidCount += 1;

        execMap[execName].bills.push({
          ...bill,
          amount: Math.round(bill.amount * share * 100) / 100,
          paid: Math.round(bill.paid * share * 100) / 100,
          credit: Math.round(bill.credit * share * 100) / 100,
          role,
          sharedWith: role === "main" && sharedWithNames ? sharedWithNames : undefined,
        });
      });
    });

    return Object.values(execMap)
      .map((e) => ({
        ...e,
        totalSold: Math.round(e.totalSold),
        totalPaid: Math.round(e.totalPaid),
        totalCredit: Math.round(e.totalCredit),
        bills: e.bills.sort((a, b) => parseDate(b.date) - parseDate(a.date)),
      }))
      .sort((a, b) => b.totalSold - a.totalSold);
  }, [filteredBills]);

  // Search filtered
  const displayedExecutives = useMemo(() => {
    if (!searchQuery.trim()) return executiveStatsList;
    const q = searchQuery.toLowerCase().trim();
    return executiveStatsList.filter((e) => e.name.toLowerCase().includes(q));
  }, [executiveStatsList, searchQuery]);

  // Global KPI totals
  const grandTotals = useMemo(() => {
    const sold = executiveStatsList.reduce((s, e) => s + e.totalSold, 0);
    const paid = executiveStatsList.reduce((s, e) => s + e.totalPaid, 0);
    const credit = executiveStatsList.reduce((s, e) => s + e.totalCredit, 0);
    const totalBills = filteredBills.length;
    const collectionRate = sold > 0 ? Math.round((paid / sold) * 100) : 0;
    return { sold, paid, credit, totalBills, collectionRate };
  }, [executiveStatsList, filteredBills]);

  // Currency & Date formatting helpers
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const fmtDate = (d: string) => {
    if (!d) return "—";
    const ts = parseDate(d);
    if (!ts) return d;
    try {
      return new Date(ts).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  // Selected Executive for detail view
  const currentExec = useMemo(() => {
    if (!selectedExecName) return null;
    return executiveStatsList.find((e) => e.name === selectedExecName) || null;
  }, [executiveStatsList, selectedExecName]);

  // Filter bills inside detail view
  const execFilteredBills = useMemo(() => {
    if (!currentExec) return [];
    let list = currentExec.bills;
    if (statusFilter !== "all") {
      list = list.filter((b) => b.status === statusFilter);
    }
    return list;
  }, [currentExec, statusFilter]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>Loading executive performance data...</div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 40 }}>
      {/* ================= HEADER & FILTER CONTROLS ================= */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div>
          {selectedExecName ? (
            <button
              onClick={() => {
                setSelectedExecName(null);
                setStatusFilter("all");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#1e293b",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                marginBottom: 8,
              }}
            >
              <ArrowLeftIcon style={{ width: 16, height: 16 }} /> Back to All Executives
            </button>
          ) : null}

          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
            {selectedExecName ? currentExec?.name : "Executive Performance"}
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "4px 0 0 0", fontWeight: 500 }}>
            {selectedExecName
              ? `Performance breakdown and bill collection history for ${currentExec?.name}`
              : "Overview of sales generated, payments collected, and credit balance by executive"}
          </p>
        </div>

        {/* Date Filter & Actions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {/* Quick Date Pills */}
          <div
            style={{
              display: "flex",
              background: "#f1f5f9",
              padding: 4,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              gap: 2,
            }}
          >
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "Last 7 Days" },
              { id: "this_month", label: "This Month" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleDateFilterChange(tab.id as any)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: dateFilter === tab.id ? "#ffffff" : "transparent",
                  color: dateFilter === tab.id ? "#0f172a" : "#64748b",
                  boxShadow: dateFilter === tab.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {dateFilter === "custom" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#ffffff", padding: "4px 8px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ padding: "4px 8px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none" }}
              />
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ padding: "4px 8px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none" }}
              />
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={loadData}
            disabled={refreshing || loading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
            title="Refresh Data"
          >
            <ArrowPathIcon style={{ width: 16, height: 16, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* ================= SUMMARY STAT CARDS ================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* TOTAL SOLD */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: 20,
            border: "1px solid #e2e8f0",
            borderLeft: "5px solid #10b981",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Total Sold
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>
                {fmt(selectedExecName ? currentExec?.totalSold || 0 : grandTotals.sold)}
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#ecfdf5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowTrendingUpIcon style={{ width: 22, height: 22 }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: 500 }}>
            {selectedExecName ? `${currentExec?.billsCount} bills generated` : `Across ${grandTotals.totalBills} total bills`}
          </div>
        </div>

        {/* TOTAL PAID */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: 20,
            border: "1px solid #e2e8f0",
            borderLeft: "5px solid #3b82f6",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Amount Paid
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>
                {fmt(selectedExecName ? currentExec?.totalPaid || 0 : grandTotals.paid)}
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BanknotesIcon style={{ width: 22, height: 22 }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: 500 }}>
            {selectedExecName
              ? `${Math.round(((currentExec?.totalPaid || 0) / (currentExec?.totalSold || 1)) * 100)}% collected`
              : `${grandTotals.collectionRate}% overall collection rate`}
          </div>
        </div>

        {/* PENDING CREDIT */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: 20,
            border: "1px solid #e2e8f0",
            borderLeft: "5px solid #ef4444",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Credit (Pending)
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#dc2626", marginTop: 4 }}>
                {fmt(selectedExecName ? currentExec?.totalCredit || 0 : grandTotals.credit)}
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef2f2", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CreditCardIcon style={{ width: 22, height: 22 }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: 500 }}>
            {selectedExecName ? `${(currentExec?.partialCount || 0) + (currentExec?.unpaidCount || 0)} bills with outstanding balance` : "Outstanding customer balances"}
          </div>
        </div>
      </div>

      {/* ================= VIEW 1: EXECUTIVE DETAIL DRILL-DOWN ================= */}
      {selectedExecName && currentExec ? (
        <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
          {/* Detail Tabs & Search */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { id: "all", label: `All Bills (${currentExec.billsCount})` },
                { id: "paid", label: `Fully Paid (${currentExec.paidCount})`, color: "#059669" },
                { id: "partial", label: `Partial (${currentExec.partialCount})`, color: "#d97706" },
                { id: "unpaid", label: `Unpaid (${currentExec.unpaidCount})`, color: "#dc2626" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid",
                    borderColor: statusFilter === tab.id ? "#2563eb" : "#e2e8f0",
                    background: statusFilter === tab.id ? "#eff6ff" : "#ffffff",
                    color: statusFilter === tab.id ? "#1e40af" : tab.color || "#64748b",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              Showing {execFilteredBills.length} of {currentExec.billsCount} bills
            </div>
          </div>

          {/* Detailed Bills Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="db-table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Date</th>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Bill No</th>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Customer Name</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Bill Amount</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Paid</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Credit Balance</th>
                  <th style={{ padding: "12px 16px", textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {execFilteredBills.map((b, i) => {
                  const percentPaid = b.amount > 0 ? Math.min(100, Math.round((b.paid / b.amount) * 100)) : 0;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 16px", color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>
                        {fmtDate(b.date)}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0f172a" }}>
                        <span style={{ padding: "3px 8px", background: "#f1f5f9", borderRadius: 6, fontSize: 12, border: "1px solid #e2e8f0" }}>
                          {b.billNo}
                        </span>
                        {b.role === "sub" && (
                          <span
                            title="Sub executive on this bill — 10% commission credit shown, not the full bill value"
                            style={{
                              marginLeft: 6,
                              padding: "2px 7px",
                              background: "#fff7ed",
                              color: "#9a3412",
                              border: "1px solid #fed7aa",
                              borderRadius: 6,
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Sub · 10%
                          </span>
                        )}
                        {b.role === "main" && b.sharedWith && (
                          <span
                            title={`10% of this bill was credited to ${b.sharedWith} as sub executive — this row shows your 90% share`}
                            style={{
                              marginLeft: 6,
                              padding: "2px 7px",
                              background: "#ecfdf5",
                              color: "#047857",
                              border: "1px solid #a7f3d0",
                              borderRadius: 6,
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            90% · 10% to {b.sharedWith}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 600, color: "#1e293b" }}>
                        {b.customerName}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontSize: 14 }}>
                        {fmt(b.amount)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#059669" }}>
                        {fmt(b.paid)}
                        <div style={{ width: 60, height: 4, background: "#e2e8f0", borderRadius: 2, marginLeft: "auto", marginTop: 4, overflow: "hidden" }}>
                          <div style={{ width: `${percentPaid}%`, height: "100%", background: percentPaid === 100 ? "#10b981" : "#f59e0b" }} />
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, color: b.credit > 0 ? "#dc2626" : "#64748b" }}>
                        {fmt(b.credit)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "4px 10px",
                            borderRadius: 14,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            background:
                              b.status === "paid" ? "#ecfdf5" : b.status === "partial" ? "#fffbeb" : "#fef2f2",
                            color:
                              b.status === "paid" ? "#065f46" : b.status === "partial" ? "#b45309" : "#991b1b",
                            border: `1px solid ${
                              b.status === "paid" ? "#a7f3d0" : b.status === "partial" ? "#fde68a" : "#fecaca"
                            }`,
                          }}
                        >
                          {b.status === "paid" ? (
                            <CheckCircleIcon style={{ width: 14, height: 14 }} />
                          ) : b.status === "partial" ? (
                            <ClockIcon style={{ width: 14, height: 14 }} />
                          ) : (
                            <ExclamationCircleIcon style={{ width: 14, height: 14 }} />
                          )}
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {execFilteredBills.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px", color: "#94a3b8" }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>No bills match the selected status filter.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ================= VIEW 2: MASTER EXECUTIVES TABLE ================= */
        <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
          {/* Table Toolbar */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
              <MagnifyingGlassIcon style={{ width: 16, height: 16, color: "#94a3b8", position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search executive name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 36px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              {displayedExecutives.length} {displayedExecutives.length === 1 ? "Executive" : "Executives"} Listed • Click a row to view full bill details
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="db-table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "14px 20px", textAlign: "left", width: 60 }}>Rank</th>
                  <th style={{ padding: "14px 20px", textAlign: "left" }}>Executive</th>
                  <th style={{ padding: "14px 20px", textAlign: "center" }}>Bills</th>
                  <th style={{ padding: "14px 20px", textAlign: "right" }}>Total Sold</th>
                  <th style={{ padding: "14px 20px", textAlign: "right" }}>Paid Amount</th>
                  <th style={{ padding: "14px 20px", textAlign: "right" }}>Credit (Pending)</th>
                  <th style={{ padding: "14px 20px", textAlign: "center", width: 120 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedExecutives.map((exec, idx) => {
                  const percentCollected = exec.totalSold > 0 ? Math.round((exec.totalPaid / exec.totalSold) * 100) : 0;
                  const isTop = idx === 0;

                  return (
                    <tr
                      key={exec.name}
                      onClick={() => setSelectedExecName(exec.name)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #f1f5f9",
                        transition: "background 0.15s ease",
                      }}
                      className="hover:bg-blue-50/40"
                    >
                      {/* Rank */}
                      <td style={{ padding: "16px 20px" }}>
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: isTop ? "#fef3c7" : idx === 1 ? "#f1f5f9" : idx === 2 ? "#ffedd5" : "#f8fafc",
                            color: isTop ? "#92400e" : idx === 1 ? "#475569" : idx === 2 ? "#9a3412" : "#64748b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: 12,
                            border: `1px solid ${isTop ? "#fde68a" : idx === 1 ? "#e2e8f0" : idx === 2 ? "#fed7aa" : "#e2e8f0"}`,
                          }}
                        >
                          {isTop ? <TrophyIcon style={{ width: 16, height: 16 }} /> : idx + 1}
                        </div>
                      </td>

                      {/* Name & Badge */}
                      <td style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: "#e0e7ff",
                              color: "#3730a3",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            {exec.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>{exec.name}</span>
                              {isTop && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    padding: "2px 8px",
                                    borderRadius: 10,
                                    fontWeight: 800,
                                    border: "1px solid #fde68a",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  Top Performer
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                              {exec.paidCount} paid • {exec.partialCount} partial • {exec.unpaidCount} unpaid
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Bills Count */}
                      <td style={{ padding: "16px 20px", textAlign: "center" }}>
                        <span style={{ fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "4px 10px", borderRadius: 8, fontSize: 13 }}>
                          {exec.billsCount}
                        </span>
                      </td>

                      {/* Total Sold */}
                      <td style={{ padding: "16px 20px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontSize: 15 }}>
                        {fmt(exec.totalSold)}
                      </td>

                      {/* Total Paid */}
                      <td style={{ padding: "16px 20px", textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: "#059669", fontSize: 14 }}>{fmt(exec.totalPaid)}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{percentCollected}%</span>
                          <div style={{ width: 60, height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${percentCollected}%`, height: "100%", background: "#10b981" }} />
                          </div>
                        </div>
                      </td>

                      {/* Total Credit */}
                      <td style={{ padding: "16px 20px", textAlign: "right", fontWeight: 800, color: exec.totalCredit > 0 ? "#dc2626" : "#64748b", fontSize: 15 }}>
                        {fmt(exec.totalCredit)}
                      </td>

                      {/* Action */}
                      <td style={{ padding: "16px 20px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: "#f1f5f9",
                            color: "#2563eb",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          View Bills →
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {displayedExecutives.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px", color: "#94a3b8" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#475569" }}>No executive records found</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Try choosing "All Time" or picking a broader date range above.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
