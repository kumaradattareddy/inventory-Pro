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
    if (!confirm("Final Confirmation: permanently reject this sale?")) return;

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
    </div>
  );
}
