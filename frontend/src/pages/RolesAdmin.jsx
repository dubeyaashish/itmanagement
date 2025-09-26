import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { Navigate } from 'react-router-dom';

export default function RolesAdmin() {
  // Hooks must be called unconditionally
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const me = getUser();

  async function load() {
    try {
      const { data } = await api.get('/roles/users', { params: { q, page, pageSize } });
      setRows(data.data || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, page]);

  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  async function updateRole(id, role) {
    try {
      setSavingId(id);
      await api.put(`/roles/users/${id}`, { role });
      setRows(prev => prev.map(r => r.id === id ? { ...r, role } : r));
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to update');
    } finally { setSavingId(null); }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-slate-900 text-2xl font-bold">Roles</h1>
        <p className="text-slate-500 text-sm">Assign Admin/User roles.</p>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <input value={q} onChange={(e)=>{ setQ(e.target.value); setPage(1); }} placeholder="Search email or name" className="rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2">{u.name || '-'}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <select value={u.role} onChange={(e)=>setRows(prev=>prev.map(r=>r.id===u.id?{...r, role:e.target.value}:r))} className="rounded-md border-slate-300">
                    <option value="user">user</option>
                    <option value="hr">hr</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button disabled={savingId===u.id} onClick={()=>updateRole(u.id, u.role)} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Update</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No users</td></tr>}
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
