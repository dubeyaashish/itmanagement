import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { Navigate } from 'react-router-dom';
import { formatDate } from '../utils/date';

export default function CategoriesAdmin() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const user = getUser();

  useEffect(() => {
    if (user?.role !== 'admin') return;
    (async () => {
      try {
        const { data } = await api.get('/categories', { params: { q, page, pageSize } });
        setList(data.data || []);
        setTotal(data.total || 0);
      } catch (e) {
        setError(e?.response?.data?.error || 'Failed to load');
      }
    })();
  }, [user, q, page]);

  async function addCategory(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/categories', { name: name || undefined, slug: slug || undefined });
      setName(''); setSlug('');
      setPage(1);
      const { data } = await api.get('/categories', { params: { q, page: 1, pageSize } });
      setList(data.data || []);
      setTotal(data.total || 0);
    } catch (e2) {
      setError(e2?.response?.data?.error || 'Failed to create');
    }
  }

  async function delCategory(slugValue) {
    if (!window.confirm(`Delete category ${slugValue}? This drops its tables.`)) return;
    setError('');
    try {
      await api.delete(`/categories/${slugValue}`);
      const { data } = await api.get('/categories', { params: { q, page, pageSize } });
      setList(data.data || []);
      setTotal(data.total || 0);
    } catch (e2) {
      setError(e2?.response?.data?.error || 'Failed to delete');
    }
  }

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-slate-900 text-2xl font-bold">Manage Categories</h1>
        <p className="text-slate-500 text-sm">Add or delete asset categories. Adding creates the per-category tables automatically.</p>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <input value={q} onChange={(e)=>{ setQ(e.target.value); setPage(1); }} placeholder="Search name or slug" className="rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      <form onSubmit={addCategory} className="rounded-lg border border-slate-200 bg-white p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-slate-600">Name</label>
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. tablets" className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
        </div>
        <div>
          <label className="block text-sm text-slate-600">Slug (optional)</label>
          <input value={slug} onChange={(e)=>setSlug(e.target.value)} placeholder="lowercase, a-z0-9_" className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
        </div>
        <div className="flex items-end">
          <button className="rounded-md bg-primary text-white px-4 py-2 text-sm">Add Category</button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Slug</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.slug}</td>
                <td className="px-4 py-2">{formatDate(c.created_at)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={()=>delCategory(c.slug)} className="text-red-600 text-sm">Delete</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No categories</td></tr>}
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
