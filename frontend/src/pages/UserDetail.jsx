import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { formatDate } from '../utils/date';
import { useNavigate, useParams, Navigate } from 'react-router-dom';

export default function UserDetail() {
  const { employeeId } = useParams();
  const me = getUser();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [licenseEdit, setLicenseEdit] = useState(false);
  const [licenseTypes, setLicenseTypes] = useState([]);
  const [assignedLicenses, setAssignedLicenses] = useState([]); // array of type ids
  const [newLicense, setNewLicense] = useState({ type_id: '', newName: '' });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/users/${employeeId}`, { params: { q, page, pageSize } });
        setUser(data.user);
        setItems(data.items?.data || []);
        setTotal(data.items?.total || 0);
      } catch (e) {
        setError(e?.response?.data?.error || 'Failed to load');
      }
    })();
  }, [employeeId, q, page]);

  useEffect(() => {
    (async () => {
      try {
        const [typesRes, assignedRes] = await Promise.all([
          api.get('/licenses'),
          api.get(`/users/${employeeId}/licenses`),
        ]);
        setLicenseTypes(typesRes.data || []);
        setAssignedLicenses((assignedRes.data || []).map(x=>x.id));
      } catch (e) { /* ignore */ }
    })();
  }, [employeeId]);

  if (!me) return <Navigate to="/login" replace />;
  if (!user && !error) return <p className="text-slate-500">Loading...</p>;

  async function addLicense() {
    if (!licenseEdit) return;
    try {
      setSaving(true);
      if (newLicense.type_id === '__new') {
        const nm = (newLicense.newName || '').trim();
        if (!nm) return;
        await api.post('/licenses', { name: nm });
        const types = (await api.get('/licenses')).data || [];
        setLicenseTypes(types);
        const found = types.find(t => (t.name || '').toLowerCase() === nm.toLowerCase());
        if (found) {
          await api.post(`/users/${employeeId}/licenses`, { type_id: found.id });
          setAssignedLicenses(prev => [...new Set([...prev, found.id])]);
        }
      } else if (newLicense.type_id) {
        const id = parseInt(newLicense.type_id, 10);
        await api.post(`/users/${employeeId}/licenses`, { type_id: id });
        setAssignedLicenses(prev => [...new Set([...prev, id])]);
      }
      setNewLicense({ type_id: '', newName: '' });
    } finally { setSaving(false); }
  }

  async function removeLicense(typeId) {
    if (!licenseEdit) return;
    try {
      setSaving(true);
      await api.delete(`/users/${employeeId}/licenses/${typeId}`);
      setAssignedLicenses(prev => prev.filter(id => id !== typeId));
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 text-2xl font-bold">{user?.name || 'User'}</h1>
          <p className="text-slate-500 text-sm">{user?.email}</p>
        </div>
        <button onClick={()=>navigate(-1)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Back</button>
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
            <div><span className="text-slate-500">Name: </span><span className="text-slate-800">{user?.name}</span></div>
            <div><span className="text-slate-500">Email: </span><span className="text-slate-800">{user?.email || '-'}</span></div>
            <div><span className="text-slate-500">Department: </span><span className="text-slate-800">{user?.departments || '-'}</span></div>
            <div><span className="text-slate-500">Job title: </span><span className="text-slate-800">{user?.job_title || '-'}</span></div>
            <div><span className="text-slate-500">Employee ID: </span><span className="text-slate-800">{user?.employee_id}</span></div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-slate-700 font-medium">Licenses</div>
              {me?.role === 'admin' && !licenseEdit && (
                <button onClick={()=>setLicenseEdit(true)} className="rounded-md border px-3 py-1 text-sm">Edit</button>
              )}
            </div>
            {licenseEdit ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 mb-1">
                  {assignedLicenses.map(id => {
                    const t = licenseTypes.find(x=>x.id===id);
                    return (
                      <span key={id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1">
                        {t?.name || id}
                        <button onClick={()=>removeLicense(id)} className="text-red-600 text-xs">Remove</button>
                      </span>
                    );
                  })}
                  {assignedLicenses.length === 0 && <span className="text-slate-500">No licenses</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={newLicense.type_id} onChange={(e)=>setNewLicense({ type_id: e.target.value, newName: '' })} className="rounded-md border-slate-300 min-w-[200px]">
                    <option value="">Select license</option>
                    {licenseTypes.filter(t=>!assignedLicenses.includes(t.id)).map(t=>(
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    <option value="__new">+ New type…</option>
                  </select>
                  {newLicense.type_id === '__new' && (
                    <>
                      <input value={newLicense.newName} onChange={(e)=>setNewLicense(prev=>({...prev, newName:e.target.value}))} placeholder="New license name" className="rounded-md border-slate-300" />
                    </>
                  )}
                  <button disabled={saving || (!newLicense.type_id && !(newLicense.newName||'').trim())} onClick={addLicense} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">Add</button>
                  <button disabled={saving} onClick={()=>{ setLicenseEdit(false); setNewLicense({type_id:'', newName:''}); }} className="rounded-md border px-3 py-1 text-sm">Done</button>
                </div>
              </div>
            ) : (
              <ul className="list-disc ml-5 text-slate-700">
                {assignedLicenses.length ? assignedLicenses.map(id => (
                  <li key={id}>{licenseTypes.find(t=>t.id===id)?.name || id}</li>
                )) : <li className="text-slate-500">No licenses</li>}
              </ul>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-slate-800 font-semibold mb-3">Assigned Items</h2>
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
    </div>
  );
}
