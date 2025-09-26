import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getUser } from '../api';
import { formatDate } from '../utils/date';

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/requests/${id}`);
        setData(data);
      } catch (e) {
        setError(e?.response?.data?.error || 'Failed to load');
      }
    })();
  }, [id]);

  if (!me) return null; // guarded by router

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 text-2xl font-bold">Request #{id}</h1>
          <p className="text-slate-500 text-sm">Status: {data?.request?.status}</p>
        </div>
        <button onClick={()=>navigate(-1)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Back</button>
      </div>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      {!data ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
              <div><span className="text-slate-500">Requested By: </span><span className="text-slate-800">{data.request.requester_email || '-'}</span></div>
              <div><span className="text-slate-500">Employee ID: </span><span className="text-slate-800">{data.request.employee_id}</span></div>
              <div><span className="text-slate-500">Employee Name: </span><span className="text-slate-800">{data.request.employee_name || '-'}</span></div>
              <div><span className="text-slate-500">Employee Email: </span><span className="text-slate-800">{data.request.employee_email || '-'}</span></div>
              <div><span className="text-slate-500">Department: </span><span className="text-slate-800">{data.request.departments || '-'}</span></div>
              <div><span className="text-slate-500">Job Title: </span><span className="text-slate-800">{data.request.job_title || '-'}</span></div>
              <div><span className="text-slate-500">Created: </span><span className="text-slate-800">{formatDate(data.request.created_at)}</span></div>
              <div><span className="text-slate-500">Updated: </span><span className="text-slate-800">{formatDate(data.request.updated_at)}</span></div>
            </div>
            {(data.legacy?.accessories?.length || data.legacy?.licenses?.length) ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <div className="text-slate-700 font-medium mb-2">Legacy (request-level)</div>
                {data.legacy?.accessories?.length ? (
                  <div className="mb-2">
                    <div className="text-slate-600">Accessories</div>
                    <ul className="list-disc ml-5">
                      {data.legacy.accessories.map((a, idx)=>(<li key={idx}>{a.name} × {a.quantity}</li>))}
                    </ul>
                  </div>
                ) : null}
                {data.legacy?.licenses?.length ? (
                  <div>
                    <div className="text-slate-600">Licenses</div>
                    <ul className="list-disc ml-5">
                      {data.legacy.licenses.map((l, idx)=>(<li key={idx}>{l.name}</li>))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-slate-700 font-medium mb-2">Notes</div>
              <div className="text-slate-800 text-sm whitespace-pre-wrap">{data.request.notes || '-'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-slate-700 font-medium mb-3">Requested Items</div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Category</th>
                      <th className="px-4 py-2 text-left">Start</th>
                      <th className="px-4 py-2 text-left">End</th>
                      <th className="px-4 py-2 text-left">Accessories</th>
                      <th className="px-4 py-2 text-left">Licenses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items?.map(it => (
                      <tr key={it.id} className="border-t">
                        <td className="px-4 py-2">{it.category_name || it.category_slug}</td>
                        <td className="px-4 py-2">{formatDate(it.start_date)}</td>
                        <td className="px-4 py-2">{formatDate(it.end_date)}</td>
                        <td className="px-4 py-2">
                          {(it.accessories||[]).length ? (
                            <ul className="list-disc ml-5">
                              {it.accessories.map((a, idx)=>(<li key={idx}>{a.name} × {a.quantity}</li>))}
                            </ul>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-2">
                          {(it.licenses||[]).length ? (
                            <ul className="list-disc ml-5">
                              {it.licenses.map((l, idx)=>(<li key={idx}>{l.name}</li>))}
                            </ul>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                    {(!data.items || data.items.length===0) && (
                      <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No items</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

