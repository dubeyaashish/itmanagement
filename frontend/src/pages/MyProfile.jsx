import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { formatDate } from '../utils/date';

export default function MyProfile() {
  const me = getUser();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/users/me', { params: { q, page, pageSize } });
        setUser(data.user); setItems(data.items?.data || []); setTotal(data.items?.total || 0);
      } catch (e) {
        setError(e?.response?.data?.error || 'Failed to load');
      }
    })();
  }, [q, page]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-slate-900 text-2xl font-bold">My Profile</h1>
        <p className="text-slate-500 text-sm">{me?.username}</p>
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
              <div><span className="text-slate-500">Name: </span><span className="text-slate-800">{user.name}</span></div>
              <div><span className="text-slate-500">Email: </span><span className="text-slate-800">{user.email || '-'}</span></div>
              <div><span className="text-slate-500">Department: </span><span className="text-slate-800">{user.departments || '-'}</span></div>
              <div><span className="text-slate-500">Job title: </span><span className="text-slate-800">{user.job_title || '-'}</span></div>
              <div><span className="text-slate-500">Employee ID: </span><span className="text-slate-800">{user.employee_id}</span></div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-slate-800 font-semibold mb-3">My Items</h2>
              <div className="p-3 border-b border-slate-200 flex items-center gap-3">
                <input value={q} onChange={(e)=>{ setQ(e.target.value); setPage(1); }} placeholder="Search category, brand, serial, condition" className="rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Category</th>
                      <th className="px-4 py-2 text-left">Brand</th>
                      <th className="px-4 py-2 text-left">Serial</th>
                      <th className="px-4 py-2 text-left">Condition</th>
                      <th className="px-4 py-2 text-left">Start Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={`${it.category_slug}-${it.id}-${idx}`} className="border-t">
                        <td className="px-4 py-2">{it.category_name}</td>
                        <td className="px-4 py-2">{it.brand || '-'}</td>
                        <td className="px-4 py-2">{it.serial_number}</td>
                        <td className="px-4 py-2">{it.condition || '-'}</td>
                        <td className="px-4 py-2">{formatDate(it.start_date)}</td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No items</td></tr>}
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
          </div>
        </div>
      )}
    </div>
  );
}
