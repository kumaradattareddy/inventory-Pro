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

  useEffect(() => {
    fetch("/api/sales-approvals")
      .then((r) => r.json())
      .then(setRows)
      .catch(console.error);
  }, []);

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
                      className="btn btn-primary"
                      onClick={() =>
                        router.push(`/approvals/${r.id}`)
                      }
                    >
                      Open
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
