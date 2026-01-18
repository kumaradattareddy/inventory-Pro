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
      // console.log("Debug Fetch:", data);
      
      if (!data || !data.sale_data) {
        alert("Error: No sale data found in record.");
        return;
      }
      
      setViewData({ ...data, id }); 
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="bg-white p-4 rounded shadow">Loading items...</div>
        </div>
      )}

      {viewData && viewData.sale_data && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', width: '100%', maxWidth: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '1.125rem', margin: 0 }}>Reject Sale: Bill #{viewData.sale_data.billNo}</h3>
              <button 
                onClick={() => setViewData(null)} 
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              {/* Header Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', fontSize: '0.875rem', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
                <div>
                  <span style={{ color: '#6b7280', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</span>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{viewData.sale_data.customerName}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</span>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{viewData.sale_data.billDate}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Received</span>
                  <div>
                    Advance: <span style={{ fontWeight: 600 }}>₹{Number(viewData.sale_data.customerPayment?.advance || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    Paid Now: <span style={{ fontWeight: 600 }}>₹{Number(viewData.sale_data.customerPayment?.paidNow || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>Method: {viewData.sale_data.customerPayment?.method}</div>
                </div>
                <div>
                   <span style={{ color: '#6b7280', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Charges</span>
                   {Number(viewData.sale_data.gst || 0) > 0 && <div>GST: ₹{viewData.sale_data.gst}</div>}
                   {Number(viewData.sale_data.hamali || 0) > 0 && <div>Hamali: ₹{viewData.sale_data.hamali}</div>}
                   {Number(viewData.sale_data.transport || 0) > 0 && <div>Transport: ₹{viewData.sale_data.transport}</div>}
                   {Number(viewData.sale_data.discount?.amount || 0) > 0 && <div style={{color:'green'}}>Discount: -₹{viewData.sale_data.discount.amount}</div>}
                </div>
              </div>

              {/* Items Table */}
              <h4 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '1rem' }}>Items</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
                <thead style={{ backgroundColor: '#f3f4f6' }}>
                  <tr>
                    <th style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'left' }}>Product / Description</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'right', width: '80px' }}>Qty</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'right', width: '100px' }}>Rate</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'right', width: '120px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewData.sale_data.rows || []).map((row: any, i: number) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                         <div style={{fontWeight: 600}}>
                           {row.product || row.productName || row.name || row.item_name || row.item || row.product_name || "(No Name)"}
                         </div>
                         <div style={{fontSize: '0.8rem', color: '#666'}}>
                            {[row.material, row.size, row.unit].filter(Boolean).join(" · ")}
                         </div>
                      </td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'right' }}>{row.qty}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'right' }}>{row.rate}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'right' }}>
                        {((Number(row.qty) || 0) * (Number(row.rate) || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Payouts Section */}
              {viewData.sale_data.payouts && viewData.sale_data.payouts.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '1rem', color: '#b91c1c' }}>Payouts (To Others)</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', border: '1px solid #fee2e2' }}>
                    <thead style={{ backgroundColor: '#fef2f2' }}>
                      <tr>
                        <th style={{ border: '1px solid #fee2e2', padding: '8px', textAlign: 'left' }}>Recipient</th>
                        <th style={{ border: '1px solid #fee2e2', padding: '8px', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewData.sale_data.payouts.map((p: any, i: number) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #fee2e2', padding: '8px' }}>{p.recipientName}</td>
                          <td style={{ border: '1px solid #fee2e2', padding: '8px', textAlign: 'right', fontWeight: 600 }}>₹{Number(p.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              <div style={{ marginTop: '16px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.25rem', borderTop: '2px dashed #ccc', paddingTop: '16px' }}>
                 Grand Total: ₹{(viewData.sale_data.rows?.reduce((acc: number, r: any) => acc + (Number(r.qty||0) * Number(r.rate||0)), 0) || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
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
