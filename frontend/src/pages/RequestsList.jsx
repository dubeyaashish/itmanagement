import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/date';

export default function RequestsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const me = getUser();
  const isAdmin = me?.role === 'admin';

  async function load() {
    try {
      const { data } = await api.get('/requests', { params: { page, pageSize, status } });
      setRows(data.data || []);
      setTotal(data.total || 0);
    } catch (e) { setError(e?.response?.data?.error || 'Failed to load'); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, status]);

  if (!me) return <Navigate to="/login" replace />;

  async function setReqStatus(id, s) {
    try {
      await api.put(`/requests/${id}/status`, { status: s });
      await load();
    } catch (e) { setError(e?.response?.data?.error || 'Failed to update'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 text-2xl font-bold">Requests</h1>
          <p className="text-slate-500 text-sm">{isAdmin? 'Review and fulfill' : 'Your submitted requests'}</p>
        </div>
        <button onClick={()=>navigate('/requests/new')} className="rounded-md bg-primary text-white px-3 py-2 text-sm">New Request</button>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <label className="text-sm text-slate-600">Status</label>
        <select value={status} onChange={(e)=>{ setStatus(e.target.value); setPage(1); }} className="rounded-md border-slate-300">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Requester</th>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Categories</th>
              <th className="px-4 py-2 text-left">Start</th>
              <th className="px-4 py-2 text-left">End</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2"></th>
              {isAdmin && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.requester_email}</td>
                <td className="px-4 py-2">{r.employee_name || r.employee_email || r.employee_id}</td>
                <td className="px-4 py-2">{r.categories || r.category_slug || '-'}</td>
                <td className="px-4 py-2">{formatDate(r.start_date)}</td>
                <td className="px-4 py-2">{formatDate(r.end_date)}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2 text-right">
                  <Link to={`/requests/${r.id}`} className="text-primary text-sm">View</Link>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2 text-right space-x-2">
                    {r.status === 'pending' && (
                      <>
                        <button onClick={()=>setReqStatus(r.id,'fulfilled')} className="rounded-md border px-2 py-1 text-sm">Mark Fulfilled</button>
                        <button onClick={()=>setReqStatus(r.id,'rejected')} className="rounded-md border px-2 py-1 text-sm">Reject</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={isAdmin?8:7}>No requests</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-slate-600">Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {total} total</div>
        <div className="flex gap-2">
          <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Prev</button>
          <button disabled={page>=Math.ceil(total/pageSize)} onClick={()=>setPage(p=>p+1)} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}
