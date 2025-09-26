import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getUser } from '../api';
import { formatDate } from '../utils/date';

export default function CategoryItemsList() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [catName, setCatName] = useState(slug);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    api.get(`/categories/${slug}/items`, { params: { q, page, pageSize } }).then(r=>{ setItems(r.data.data || []); setTotal(r.data.total || 0); }).catch(()=>{});
    api.get('/categories', { params: { pageSize: 1000 } }).then(r => {
      const c = (r.data?.data || []).find(x=>x.slug===slug);
      if (c) setCatName(c.name);
    }).catch(()=>{});
  }, [slug, q, page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 text-2xl font-bold tracking-tight">{catName}</h1>
          <p className="text-slate-500 mt-1 text-sm">Browse items in this category.</p>
        </div>
        {isAdmin && (
          <button onClick={()=>navigate(`/categories/${slug}/new`)} className="rounded-md bg-primary text-white px-3 py-2 text-sm">New Item</button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-200 flex items-center gap-3">
          <input value={q} onChange={(e)=>{ setQ(e.target.value); setPage(1); }} placeholder="Search brand, serial, condition, holder" className="rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Brand</th>
              <th className="px-4 py-2 text-left">Serial</th>
              <th className="px-4 py-2 text-left">Start Date</th>
              <th className="px-4 py-2 text-left">Condition</th>
              <th className="px-4 py-2 text-left">Holder</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2">{a.brand || '-'}</td>
                <td className="px-4 py-2">{a.serial_number}</td>
                <td className="px-4 py-2">{formatDate(a.start_date)}</td>
                <td className="px-4 py-2">{a.condition || '-'}</td>
                <td className="px-4 py-2">{a.employee_email || '-'}</td>
                <td className="px-4 py-2 text-right">
                  <Link to={`/categories/${slug}/${a.id}`} className="text-primary text-sm">View</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No items</td></tr>
            )}
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
