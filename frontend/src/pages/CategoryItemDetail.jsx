import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getUser } from '../api';
import { formatDate, toInputDate } from '../utils/date';

export default function CategoryItemDetail() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const isAdmin = user?.role === 'admin';
  const [item, setItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [histMeta, setHistMeta] = useState({ total: 0, page: 1, pageSize: 10 });
  const [form, setForm] = useState({ brand: '', serial_number: '', start_date: '', condition: '', condition_comments: '' });
  const [txn, setTxn] = useState({ employee_id: '', start_date: '', end_date: '' });
  const [empQuery, setEmpQuery] = useState('');
  const [empResults, setEmpResults] = useState([]);
  const [empOpen, setEmpOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [accTypes, setAccTypes] = useState([]);
  const [txnAccessories, setTxnAccessories] = useState([]); // [{nameOrId: '', quantity: 1}]
  const [currentAccessories, setCurrentAccessories] = useState([]);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0,10);
  const hasActive = (() => {
    // Prefer deriving from visible history (most recent first); fallback to item holder
    if (history && history.length) {
      const active = history.some(h => {
        const end = toInputDate(h.end_date);
        return !end || end > today;
      });
      return active;
    }
    return !!(item && item.employee_email);
  })();
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0,10));

  async function load(page = 1) {
    try {
      const { data } = await api.get(`/categories/${slug}/items/${id}`, { params: { hist_page: page, hist_page_size: histMeta.pageSize } });
      setItem(data.item);
      setHistory(data.history);
      const current = (data.history && data.history.length) ? data.history[0] : null;
      setCurrentAccessories(current?.accessories || []);
      setHistMeta(data.history_meta || { total: 0, page: 1, pageSize: histMeta.pageSize });
      setForm({
        brand: data.item.brand || '',
        serial_number: data.item.serial_number || '',
        start_date: toInputDate(data.item.start_date) || '',
        condition: data.item.condition || '',
        condition_comments: data.item.condition_comments || '',
        has_bag: !!data.item.has_bag,
        has_mouse: !!data.item.has_mouse,
        has_charger: !!data.item.has_charger,
        has_windows_license: !!data.item.has_windows_license,
      });
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load');
    }
  }

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, [slug, id]);
  useEffect(() => { (async ()=>{ try { const {data} = await api.get(`/categories/${slug}/accessories`); setAccTypes(data||[]); } catch{} })(); }, [slug]);

  async function refreshAccessoryTypes() {
    try { const { data } = await api.get(`/categories/${slug}/accessories`); setAccTypes(data || []); return data || []; } catch { return []; }
  }

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const onTxnChange = (e) => setTxn({ ...txn, [e.target.name]: e.target.value });

  async function searchEmployees(q) {
    if (!q) { setEmpResults([]); return; }
    try {
      const { data } = await api.get('/users/search', { params: { q } });
      setEmpResults(data || []);
    } catch {
      setEmpResults([]);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/categories/${slug}/items/${id}`, form);
      if (hasActive && (txn.employee_id || txn.start_date || txn.end_date)) {
        setError('End current assignment first before adding a new one.');
        return;
      }
      if (txn.employee_id && txn.start_date) {
        // prepare accessories payload
        const accPayload = txnAccessories
          .filter(a => (a.name || a.type_id))
          .map(a => ({
            type_id: a.type_id || null,
            name: a.name || null,
            quantity: parseInt(a.quantity || 1, 10) || 1,
          }));
        await api.post(`/categories/${slug}/items/${id}/transactions`, { ...txn, accessories: accPayload });
        setTxn({ employee_id: '', start_date: '', end_date: '' });
        setEmpQuery('');
        setTxnAccessories([]);
      }
      await load(histMeta.page || 1);
      setIsEditing(false);
    } catch (err) { setError(err?.response?.data?.error || 'Failed to save'); }
  }

  async function endAssignment() {
    setError('');
    try {
      await api.put(`/categories/${slug}/items/${id}/transactions/end`, { end_date: endDate });
      await load(histMeta.page || 1);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to end assignment');
    }
  }

  async function endNow() {
    const today = new Date().toISOString().slice(0,10);
    setEndDate(today);
    await endAssignment();
  }

  function cancelEdit() {
    if (!item) return;
    setForm({
      brand: item.brand || '',
      serial_number: item.serial_number || '',
      start_date: toInputDate(item.start_date) || '',
      condition: item.condition || '',
      condition_comments: item.condition_comments || '',
      has_bag: !!item.has_bag,
      has_mouse: !!item.has_mouse,
      has_charger: !!item.has_charger,
      has_windows_license: !!item.has_windows_license,
    });
    setTxn({ employee_id: '', start_date: '', end_date: '' });
    setEmpQuery('');
    setIsEditing(false);
  }

  // accessories editing is part of main form now; no separate handlers

  if (!item) return (
    <div>
      <h1 className="text-slate-900 text-2xl font-bold mb-4">Item #{id}</h1>
      {error ? <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div> : <p className="text-slate-500">Loading...</p>}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-slate-900 text-2xl font-bold">{item.serial_number}</h1>
        <button onClick={()=>navigate(-1)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Back</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-slate-800 font-semibold mb-3">Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-slate-500">Brand</div><div className="text-slate-800">{item.brand || '-'}</div></div>
              <div><div className="text-slate-500">Serial Number</div><div className="text-slate-800">{item.serial_number}</div></div>
              <div><div className="text-slate-500">Start Date</div><div className="text-slate-800">{formatDate(item.start_date)}</div></div>
              <div><div className="text-slate-500">Condition</div><div className="text-slate-800">{item.condition || '-'}</div></div>
              <div><div className="text-slate-500">Current Holder</div><div className="text-slate-800">{item.employee_email || '-'}</div></div>
              <div className="sm:col-span-2"><div className="text-slate-500">Condition Comments</div><div className="text-slate-800">{item.condition_comments || '-'}</div></div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 mt-6">
            <h2 className="text-slate-800 font-semibold mb-2">Accessories</h2>
            {currentAccessories.length ? (
              <ul className="list-disc ml-5 text-sm text-slate-800">
                {currentAccessories.map((a, i)=>(<li key={i}>{a.name} {a.quantity>1?`x${a.quantity}`:''}</li>))}
              </ul>
            ) : (
              <div className="text-sm text-slate-500">No accessories for current assignment</div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 mt-6">
            <h2 className="text-slate-800 font-semibold mb-3">History</h2>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2 text-left">User</th>
                    <th className="px-4 py-2 text-left">Start</th>
                    <th className="px-4 py-2 text-left">End</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-t">
                      <td className="px-4 py-2">{h.employee_email || h.employee_name || h.employee_id}</td>
                      <td className="px-4 py-2">{formatDate(h.start_date)}</td>
                      <td className="px-4 py-2">{formatDate(h.end_date)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={3}>No history yet</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-slate-600">Page {histMeta.page} of {Math.max(1, Math.ceil((histMeta.total||0) / (histMeta.pageSize||10)))} · {histMeta.total} total</div>
              <div className="flex gap-2">
                <button disabled={histMeta.page<=1} onClick={()=>load(histMeta.page-1)} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Prev</button>
                <button disabled={histMeta.page>=Math.ceil((histMeta.total||0)/(histMeta.pageSize||10))} onClick={()=>load(histMeta.page+1)} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {isAdmin && (!isEditing ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <button type="button" onClick={()=>setIsEditing(true)} className="rounded-md border px-3 py-2 text-sm">Edit</button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="font-semibold text-slate-800">Edit</h3>
                <input name="brand" value={form.brand} onChange={onChange} placeholder="Brand" className="w-full rounded-md border-slate-300" />
                <input name="serial_number" value={form.serial_number} onChange={onChange} placeholder="Serial Number" className="w-full rounded-md border-slate-300" />
                <input type="date" name="start_date" value={form.start_date||''} onChange={onChange} className="w-full rounded-md border-slate-300" />
                <input name="condition" value={form.condition} onChange={onChange} placeholder="Condition" className="w-full rounded-md border-slate-300" />
                <textarea name="condition_comments" value={form.condition_comments} onChange={onChange} placeholder="Condition Comments" className="w-full rounded-md border-slate-300" />
              </div>
              <form onSubmit={save} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="font-semibold text-slate-800">Assignment (optional)</h3>
                {hasActive && (
                  <div className="rounded-md bg-yellow-50 text-yellow-800 px-3 py-2 text-sm">
                    <div className="mb-2">Currently assigned to {item.employee_email}. End the current assignment before reassigning.</div>
                    <div className="flex items-center gap-2">
                      <label className="text-yellow-900">End Date</label>
                      <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="rounded-md border-slate-300" />
                      <button type="button" onClick={endAssignment} className="rounded-md bg-yellow-600 text-white px-3 py-1.5 text-sm">End Assignment</button>
                      <button type="button" onClick={endNow} className="rounded-md border border-yellow-600 text-yellow-700 px-3 py-1.5 text-sm">End Now</button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Select Employee</label>
                  <input
                    value={empQuery}
                    onChange={(e)=>{ if (hasActive) return; setEmpQuery(e.target.value); setEmpOpen(true); searchEmployees(e.target.value); }}
                    onFocus={()=>{ if (hasActive) return; setEmpOpen(true); if (empQuery) searchEmployees(empQuery); }}
                    placeholder="Search by ID, name, email"
                    className="w-full rounded-md border-slate-300"
                    disabled={hasActive}
                  />
                  {empOpen && empResults.length > 0 && (
                    <div className="mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {empResults.map((u)=> (
                        <button type="button" key={u.employee_id} onClick={()=>{ if (hasActive) return; setTxn({...txn, employee_id: u.employee_id}); setEmpQuery(`${u.employee_id} - ${u.name} (${u.email||''})`); setEmpOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm" disabled={hasActive}>
                          <div className="font-medium text-slate-800">{u.name} <span className="text-slate-500">· {u.employee_id}</span></div>
                          <div className="text-slate-500">{u.email || '-'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  <input type="hidden" name="employee_id" value={txn.employee_id} />
                  {txn.employee_id && <div className="text-xs text-slate-600 mt-1">Selected ID: {txn.employee_id}</div>}
                </div>
                <label className="block text-sm text-slate-600">Start Date</label>
                <input type="date" name="start_date" value={txn.start_date} onChange={onTxnChange} className="w-full rounded-md border-slate-300" disabled={hasActive} />
                <label className="block text-sm text-slate-600">End Date (optional)</label>
                <input type="date" name="end_date" value={txn.end_date} onChange={onTxnChange} className="w-full rounded-md border-slate-300" disabled={hasActive} />
                <div className="mt-3">
                  <div className="font-medium text-slate-800 mb-1">Accessories (optional)</div>
                  {txnAccessories.map((a, idx)=>{
                    const chosenIds = txnAccessories
                      .map((x, i) => (i !== idx && x.type_id ? parseInt(x.type_id, 10) : null))
                      .filter(Boolean);
                    const available = accTypes.filter(t => !chosenIds.includes(t.id));
                    return (
                      <div key={idx} className="flex flex-wrap items-center gap-2 mb-2">
                        <select
                          value={a.type_id || ''}
                          onChange={(e)=>{
                            const val = e.target.value;
                            const copy = [...txnAccessories];
                            if (val === '__new') {
                              copy[idx] = { ...copy[idx], type_id: null, newName: '' };
                            } else {
                              copy[idx] = { ...copy[idx], type_id: val ? parseInt(val,10) : null, newName: '' };
                            }
                            setTxnAccessories(copy);
                          }}
                          className="rounded-md border-slate-300 min-w-[180px]"
                          disabled={hasActive}
                        >
                          <option value="">Select type</option>
                          {available.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                          <option value="__new">+ New type…</option>
                        </select>
                        {(a.type_id === null) && (
                          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                            <input
                              value={a.newName || ''}
                              onChange={(e)=>{ const copy=[...txnAccessories]; copy[idx]={...copy[idx], newName:e.target.value, name:e.target.value}; setTxnAccessories(copy); }}
                              placeholder="New type name"
                              className="rounded-md border-slate-300 flex-1"
                              disabled={hasActive}
                            />
                            <button type="button" disabled={hasActive || !(a.newName||'').trim()} className="rounded-md border px-2 py-1 text-sm"
                              onClick={async ()=>{
                                const nm = (a.newName||'').trim(); if (!nm) return;
                                try {
                                  await api.post(`/categories/${slug}/accessories`, { name: nm });
                                  const list = await refreshAccessoryTypes();
                                  const found = (list||[]).find(x=> (x.name||'').toLowerCase() === nm.toLowerCase());
                                  const copy=[...txnAccessories];
                                  copy[idx] = { ...copy[idx], type_id: found?found.id:null, name: '', newName: '' };
                                  setTxnAccessories(copy);
                                } catch {}
                              }}>Create</button>
                          </div>
                        )}
                        <input type="number" min="1" value={a.quantity||1} onChange={(e)=>{
                          const copy=[...txnAccessories]; copy[idx]={...copy[idx], quantity: parseInt(e.target.value||'1',10)||1}; setTxnAccessories(copy);
                        }} className="w-20 rounded-md border-slate-300" disabled={hasActive} />
                        <button type="button" onClick={()=>{const copy=[...txnAccessories]; copy.splice(idx,1); setTxnAccessories(copy);}} className="text-red-600 text-sm" disabled={hasActive}>Remove</button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={()=>setTxnAccessories([...txnAccessories,{ type_id:'', quantity:1 }])} className="rounded-md border px-3 py-1.5 text-sm" disabled={hasActive}>Add Accessory</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-md bg-primary text-white px-3 py-2 text-sm">Save All</button>
                  <button type="button" onClick={cancelEdit} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
                </div>
              </form>
            </>
          ))}
          {!isAdmin && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">You have read-only access to this item.</div>
          )}
        </div>
      </div>
    </div>
  );
}
