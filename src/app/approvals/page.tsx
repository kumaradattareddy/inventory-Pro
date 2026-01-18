"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Approval = {
  id: number;
  bill_no: string;
  bill_date: string;
  customer_name: string;
  total_amount: number;
};

export default function ApprovalsPage() {
  const [rows, setRows] = useState<Approval[]>([]);
  const router = useRouter();

  const [viewData, setViewData] = useState<any>(null);
  const [loadingView, setLoadingView] = useState(false);

  useEffect(() => {
    fetch("/api/sales-approvals")
      .then((r) => r.json())
      .then(setRows)
      .catch(console.error);
  }, []);

  const handleInitialReject = async (id: number) => {
    if (!confirm("Start rejection process for this bill?")) return;
    
    setLoadingView(true);
    try {
      const res = await fetch(`/api/sales-approvals/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setViewData({ ...data, id }); // ensure ID is passed
    } catch (e) {
      alert("Error loading details");
    } finally {
      setLoadingView(false);
    }
  };

  const confirmReject = async () => {
    if (!viewData) return;
    // User already confirmed via the modal button click

    try {
      const res = await fetch(`/api/sales-approvals/${viewData.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== viewData.id));
        setViewData(null);
      } else {
        alert("Failed to reject");
      }
    } catch (e) {
      alert("Network error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Pending Sales Approvals</h1>
      </div>

      <div className="card">
        <div className="card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.bill_no}</td>
                  <td>{r.bill_date}</td>
                  <td>{r.customer_name}</td>
                  <td>₹{r.total_amount}</td>
                  <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => router.push(`/approvals/${r.id}`)}
                      >
                        Open
                      </button>
                      <button
                        className="btn btn-danger btn-sm ml-2"
                        onClick={() => handleInitialReject(r.id)}
                      >
                        Reject
                      </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center" }}>
                    No pending approvals
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loadingView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow">Loading items...</div>
        </div>
      )}

      {viewData && viewData.sale_data && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-lg">Reject Sale: Bill #{viewData.sale_data.billNo}</h3>
              <button onClick={() => setViewData(null)} className="text-gray-500 hover:text-black text-xl">
                ✕
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Customer:</span>
                  <div className="font-medium">{viewData.sale_data.customerName}</div>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>
                  <div className="font-medium">{viewData.sale_data.billDate}</div>
                </div>
              </div>

              <h4 className="font-semibold mb-2">Items</h4>
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-left">Product</th>
                    <th className="border p-2 text-right">Qty</th>
                    <th className="border p-2 text-right">Rate</th>
                    <th className="border p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewData.sale_data.rows || []).map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="border p-2">
                         {row.product || row.productName} 
                         {row.size ? ` (${row.size})` : ""}
                      </td>
                      <td className="border p-2 text-right">{row.qty}</td>
                      <td className="border p-2 text-right">{row.rate}</td>
                      <td className="border p-2 text-right">
                        {((Number(row.qty) || 0) * (Number(row.rate) || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <div className="mt-4 text-right font-bold text-lg">
                 Total: ₹{(viewData.sale_data.rows?.reduce((acc: number, r: any) => acc + (Number(r.qty||0) * Number(r.rate||0)), 0) || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-3">
              <button 
                className="btn btn-secondary"
                onClick={() => setViewData(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger"
                onClick={confirmReject}
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
