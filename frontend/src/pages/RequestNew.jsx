import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

export default function RequestNew() {
  const navigate = useNavigate();

  // Data sources
  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catsError, setCatsError] = useState('');
  const [licenseTypes, setLicenseTypes] = useState([]);
  const [accTypesMap, setAccTypesMap] = useState({}); // { slug: [ {id,name} ] }
  const [deptOptions, setDeptOptions] = useState([]);

  // Form state: multiple users, each with multiple items
  const [users, setUsers] = useState([
    {
      mode: 'new', // 'new' | 'existing'
      empQuery: '',
      empResults: [],
      employee: { employee_id: '', name: '', email: '', departments: '', job_title: '', phone_number: '', table_number: '' },
      items: [ { category_slug: '', start_date: '', end_date: '', accessories: [], licenses: [] } ],
    }
  ]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const STORAGE_KEY = 'request_new_draft_v1';

  // Load categories + license types
  useEffect(() => {
    (async () => {
      setCatsLoading(true);
      setCatsError('');
      try {
        let cats = [];
        try {
          const { data } = await api.get('/categories', { params: { pageSize: 100 } });
          cats = data?.data || [];
        } catch (e) {
          setCatsError(e?.response?.data?.error || 'Failed to load categories');
        }
        if (!cats.length) {
          try { const { data: stats } = await api.get('/categories/stats'); cats = (stats||[]).map(s=>({ slug:s.slug, name:s.name })); } catch {}
        }
        setCategories(cats);
        // seed any empty item category_slug with first
        if (cats.length) {
          setUsers(prev => prev.map(u => ({
            ...u,
            items: u.items.map(it => ({ ...it, category_slug: it.category_slug || cats[0].slug }))
          })));
        }
      } finally { setCatsLoading(false); }
      try { const { data } = await api.get('/licenses'); setLicenseTypes(data || []); } catch {}
      try { const { data } = await api.get('/users/departments'); setDeptOptions(Array.isArray(data)? data : []); } catch {}
    })();
  }, []);

  // Load existing draft from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && Array.isArray(draft.users)) setUsers(draft.users);
      if (typeof draft?.notes === 'string') setNotes(draft.notes);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft
  useEffect(() => {
    try {
      const payload = JSON.stringify({ users, notes });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {}
  }, [users, notes]);

  // Prefetch accessory types for any categories currently selected in items
  const itemSlugsKey = useMemo(() => {
    try {
      const slugs = [];
      for (const u of users) {
        for (const it of u.items || []) {
          if (it.category_slug) slugs.push(it.category_slug);
        }
      }
      // deterministic key for dependency tracking
      return Array.from(new Set(slugs)).sort().join('|');
    } catch { return ''; }
  }, [users]);

  useEffect(() => {
    (async () => {
      if (!itemSlugsKey) return;
      const uniq = itemSlugsKey.split('|').filter(Boolean);
      for (const slug of uniq) {
        if (accTypesMap[slug] === undefined) {
          await ensureAccTypes(slug);
        }
      }
    })();
  }, [itemSlugsKey]);

  async function ensureAccTypes(slug) {
    if (!slug) return [];
    if (accTypesMap[slug]) return accTypesMap[slug];
    try {
      const { data } = await api.get(`/categories/${slug}/accessories`);
      setAccTypesMap(prev => ({ ...prev, [slug]: data || [] }));
      return data || [];
    } catch {
      setAccTypesMap(prev => ({ ...prev, [slug]: [] }));
      return [];
    }
  }

  async function searchEmployee(idx, q) {
    if (!q) return setUsers(prev => prev.map((u,i)=> i===idx? { ...u, empResults: [] } : u));
    try {
      const { data } = await api.get('/asset-users/search', { params: { q } });
      setUsers(prev => prev.map((u,i)=> i===idx? { ...u, empResults: data || [] } : u));
    } catch { setUsers(prev => prev.map((u,i)=> i===idx? { ...u, empResults: [] } : u)); }
  }

  function addUser() {
    setUsers(prev => ([ ...prev, { mode:'new', empQuery:'', empResults:[], employee:{ employee_id:'', name:'', email:'', departments:'', job_title:'', phone_number:'', table_number:'' }, items:[{ category_slug: categories[0]?.slug || '', start_date:'', end_date:'', accessories:[], licenses:[] }] } ]));
  }
  function removeUser(idx) {
    setUsers(prev => prev.filter((_,i)=>i!==idx));
  }
  function addItem(uIdx) {
    setUsers(prev => prev.map((u,i)=> i===uIdx ? { ...u, items:[ ...u.items, { category_slug: categories[0]?.slug || '', start_date:'', end_date:'', accessories:[], licenses:[] } ] } : u));
  }
  function removeItem(uIdx, itemIdx) {
    setUsers(prev => prev.map((u,i)=> i===uIdx ? { ...u, items: u.items.filter((_,j)=>j!==itemIdx) } : u));
  }

  function addAcc(uIdx, itemIdx) {
    const slug = users[uIdx]?.items?.[itemIdx]?.category_slug;
    if (slug) void ensureAccTypes(slug);
    setUsers(prev => prev.map((u,i)=> i===uIdx ? { ...u, items: u.items.map((it,j)=> j===itemIdx ? { ...it, accessories:[ ...(it.accessories||[]), { type_id:'', newName:'', quantity:1 } ] } : it) } : u));
  }
  function removeAcc(uIdx, itemIdx, accIdx) {
    setUsers(prev => prev.map((u,i)=> i===uIdx ? { ...u, items: u.items.map((it,j)=> j===itemIdx ? { ...it, accessories: it.accessories.filter((_,k)=>k!==accIdx) } : it) } : u));
  }
  function addLic(uIdx, itemIdx) {
    setUsers(prev => prev.map((u,i)=> i===uIdx ? { ...u, items: u.items.map((it,j)=> j===itemIdx ? { ...it, licenses:[ ...(it.licenses||[]), { type_id:'', newName:'' } ] } : it) } : u));
  }
  function removeLic(uIdx, itemIdx, licIdx) {
    setUsers(prev => prev.map((u,i)=> i===uIdx ? { ...u, items: u.items.map((it,j)=> j===itemIdx ? { ...it, licenses: it.licenses.filter((_,k)=>k!==licIdx) } : it) } : u));
  }

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!users.length) return false;
    for (const u of users) {
      if (u.mode === 'existing') {
        if (!u.employee?.employee_id) return false;
      } else {
        if (!u.employee?.employee_id || !u.employee?.name) return false;
      }
      if (!u.items?.length) return false;
      for (const it of u.items) {
        if (!it.category_slug) return false;
      }
    }
    return true;
  }, [users, saving]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSaving(true);
    try {
      const payloadUsers = [];
      for (const u of users) {
        const items = (u.items||[]).map(it => ({
          category_slug: it.category_slug,
          start_date: it.start_date || null,
          end_date: it.end_date || null,
          accessories: (it.accessories||[]).filter(a=>a.type_id || (a.newName||'').trim()).map(a => (
            a.type_id === '__new' ? { name: (a.newName||'').trim(), quantity: Math.max(parseInt(a.quantity||1,10)||1,1) } : { type_id: parseInt(a.type_id,10), quantity: Math.max(parseInt(a.quantity||1,10)||1,1) }
          )),
          licenses: (it.licenses||[]).filter(l=>l.type_id || (l.newName||'').trim()).map(l => (
            l.type_id === '__new' ? { name: (l.newName||'').trim() } : { type_id: parseInt(l.type_id,10) }
          )),
        }));
        if (u.mode === 'existing') {
          payloadUsers.push({ employee_id: u.employee.employee_id, items });
        } else {
          // send with full employee object
          payloadUsers.push({ employee: {
            employee_id: u.employee.employee_id,
            name: u.employee.name,
            email: u.employee.email || null,
            departments: u.employee.departments || null,
            phone_number: u.employee.phone_number || null,
            job_title: u.employee.job_title || null,
            table_number: u.employee.table_number || null,
          }, items });
        }
      }

      await api.post('/requests', { users: payloadUsers, notes: notes || null });
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      navigate('/requests');
    } catch (e2) {
      setError(e2?.response?.data?.error || 'Failed to create');
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-slate-900 text-2xl font-bold">New Request</h1>
        <button type="button" onClick={addUser} className="rounded-md border px-3 py-1.5 text-sm">Add User</button>
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}

      <form onSubmit={onSubmit} className="space-y-6">
        {users.map((u, uIdx) => (
          <div key={uIdx} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-slate-800 font-semibold">User {uIdx+1}</div>
              {users.length > 1 && (
                <button type="button" onClick={()=>removeUser(uIdx)} className="text-red-600 text-sm">Remove</button>
              )}
            </div>

            {/* Existing/New toggle */}
            <div className="mb-3 flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name={`mode-${uIdx}`} checked={u.mode==='existing'} onChange={()=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, mode:'existing' } : x))} /> Existing employee
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`mode-${uIdx}`} checked={u.mode==='new'} onChange={()=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, mode:'new', empQuery:'', empResults:[] } : x))} /> New employee
              </label>
            </div>

            {u.mode === 'existing' ? (
              <div>
                <label className="block text-sm text-slate-600 mb-1">Search Employee</label>
                <input
                  value={u.empQuery}
                  onChange={(e)=>{ const q=e.target.value; setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, empQuery:q } : x)); searchEmployee(uIdx, q); }}
                  placeholder="Search by name, email, or employee ID"
                  className="w-full rounded-md border-slate-300"
                />
                {u.empResults.length>0 && (
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {u.empResults.map(r => (
                      <button type="button" key={r.employee_id} onClick={()=>{
                        setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, employee_id:r.employee_id, name:r.name, email:r.email }, empQuery:`${r.name} · ${r.employee_id}`, empResults:[] } : x));
                      }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                        <div className="font-medium text-slate-800">{r.name} <span className="text-slate-500">· {r.employee_id}</span></div>
                        <div className="text-slate-500">{r.email || '-'}</div>
                      </button>
                    ))}
                  </div>
                )}
                {u.employee.employee_id && <div className="text-xs text-slate-600 mt-1">Selected: {u.employee.name || '-'} · {u.employee.employee_id}</div>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600">Employee ID</label>
                  <input value={u.employee.employee_id} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, employee_id:e.target.value } } : x))} className="mt-1 w-full rounded-md border-slate-300" required />
                </div>
                <div>
                  <label className="block text-sm text-slate-600">Name</label>
                  <input value={u.employee.name} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, name:e.target.value } } : x))} className="mt-1 w-full rounded-md border-slate-300" required />
                </div>
                <div>
                  <label className="block text-sm text-slate-600">Email</label>
                  <input value={u.employee.email} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, email:e.target.value } } : x))} className="mt-1 w-full rounded-md border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600">Department</label>
                  <input list="departments-options" value={u.employee.departments}
                    onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, departments:e.target.value } } : x))}
                    placeholder="Select or type to add"
                    className="mt-1 w-full rounded-md border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600">Job Title</label>
                  <input value={u.employee.job_title} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, job_title:e.target.value } } : x))} className="mt-1 w-full rounded-md border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600">Phone</label>
                  <input value={u.employee.phone_number} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, phone_number:e.target.value } } : x))} className="mt-1 w-full rounded-md border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600">Table Number</label>
                  <input value={u.employee.table_number} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, employee:{ ...x.employee, table_number:e.target.value } } : x))} className="mt-1 w-full rounded-md border-slate-300" />
                </div>
              </div>
            )}

            {/* Items for this user */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-slate-700 font-medium">Assets for this user</div>
                <button type="button" onClick={()=>addItem(uIdx)} className="rounded-md border px-3 py-1.5 text-sm">Add Asset</button>
              </div>
              {u.items.map((it, itemIdx) => (
                <div key={itemIdx} className="rounded-md border border-slate-200 p-3 mb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-slate-600">Category</label>
                      <select value={it.category_slug} onChange={async (e)=>{
                        const slug = e.target.value; setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items: x.items.map((y,j)=> j===itemIdx? { ...y, category_slug: slug, accessories:[] } : y) } : x)); await ensureAccTypes(slug);
                      }} className="mt-1 w-full rounded-md border-slate-300" disabled={catsLoading}>
                        {categories.map(c => (<option key={c.slug} value={c.slug}>{c.name}</option>))}
                      </select>
                      {catsError && <div className="text-xs text-red-600 mt-1">{catsError}</div>}
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600">Start Date</label>
                      <input type="date" value={it.start_date} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, start_date:e.target.value } : y) } : x))} className="mt-1 w-full rounded-md border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600">End Date (optional)</label>
                      <input type="date" value={it.end_date} onChange={(e)=>setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, end_date:e.target.value } : y) } : x))} className="mt-1 w-full rounded-md border-slate-300" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm text-slate-700">Accessories</div>
                      <button type="button" onClick={()=>addAcc(uIdx,itemIdx)} className="rounded-md border px-2 py-1 text-xs">Add</button>
                    </div>
                    {(it.accessories||[]).map((a, accIdx) => {
                      const types = accTypesMap[it.category_slug] || [];
                      return (
                        <div key={accIdx} className="flex flex-wrap items-center gap-2 mb-2">
                          <select value={a.type_id||''} onChange={(e)=>{
                            const val=e.target.value; setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, accessories: y.accessories.map((z,k)=> k===accIdx? { ...z, type_id: val, newName: val==='__new'? (z.newName||'') : '' } : z) } : y) } : x));
                          }} className="rounded-md border-slate-300 min-w-[180px]">
                            <option value="">Select type</option>
                            {types.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                            <option value="__new">+ New type…</option>
                          </select>
                          {a.type_id === '__new' && (
                            <input value={a.newName||''} onChange={(e)=>{
                              setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, accessories: y.accessories.map((z,k)=> k===accIdx? { ...z, newName:e.target.value } : z) } : y) } : x));
                            }} placeholder="New type name" className="rounded-md border-slate-300" />
                          )}
                          <input type="number" min="1" value={a.quantity||1} onChange={(e)=>{
                            const q = Math.max(parseInt(e.target.value||'1',10)||1,1);
                            setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, accessories: y.accessories.map((z,k)=> k===accIdx? { ...z, quantity:q } : z) } : y) } : x));
                          }} className="w-20 rounded-md border-slate-300" />
                          <button type="button" onClick={()=>removeAcc(uIdx,itemIdx,accIdx)} className="text-red-600 text-xs">Remove</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm text-slate-700">Licenses</div>
                      <button type="button" onClick={()=>addLic(uIdx,itemIdx)} className="rounded-md border px-2 py-1 text-xs">Add</button>
                    </div>
                    {(it.licenses||[]).map((l, licIdx) => (
                      <div key={licIdx} className="flex flex-wrap items-center gap-2 mb-2">
                        <select value={l.type_id||''} onChange={(e)=>{
                          const val=e.target.value; setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, licenses: y.licenses.map((z,k)=> k===licIdx? { ...z, type_id: val, newName: val==='__new'? (z.newName||'') : '' } : z) } : y) } : x));
                        }} className="rounded-md border-slate-300 min-w-[180px]">
                          <option value="">Select license</option>
                          {licenseTypes.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                          <option value="__new">+ New type…</option>
                        </select>
                        {l.type_id === '__new' && (
                          <input value={l.newName||''} onChange={(e)=>{
                            setUsers(prev=>prev.map((x,i)=> i===uIdx? { ...x, items:x.items.map((y,j)=> j===itemIdx? { ...y, licenses: y.licenses.map((z,k)=> k===licIdx? { ...z, newName:e.target.value } : z) } : y) } : x));
                          }} placeholder="New license name" className="rounded-md border-slate-300" />
                        )}
                        <button type="button" onClick={()=>removeLic(uIdx,itemIdx,licIdx)} className="text-red-600 text-xs">Remove</button>
                      </div>
                    ))}
                  </div>
                  {u.items.length>1 && (
                    <div className="text-right">
                      <button type="button" onClick={()=>removeItem(uIdx,itemIdx)} className="text-red-600 text-xs">Remove Asset</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm text-slate-600 mb-1">Notes</label>
          <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} className="w-full rounded-md border-slate-300" rows={3} />
        </div>

      <div className="flex gap-2">
        <button disabled={!canSubmit} className="rounded-md bg-primary text-white px-4 py-2 text-sm disabled:opacity-50">Submit Request</button>
        <button type="button" onClick={()=>navigate(-1)} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
    {/* Global datalist for Department suggestions */}
    <datalist id="departments-options">
      {deptOptions.map((d, idx)=>(<option key={idx} value={d} />))}
    </datalist>
    </div>
  );
}
