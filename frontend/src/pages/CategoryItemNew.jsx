import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export default function CategoryItemNew() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ brand: '', serial_number: '', start_date: '', condition: '', condition_comments: '' });
  const [error, setError] = useState('');

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post(`/categories/${slug}/items`, form);
      navigate(`/categories/${slug}/${data.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create');
    }
  }

  return (
    <div>
      <h1 className="text-slate-900 text-2xl font-bold mb-4">New Item</h1>
      {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
      <form className="space-y-4 max-w-xl" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm text-slate-600">Brand</label>
          <input name="brand" value={form.brand} onChange={onChange} className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
        </div>
        <div>
          <label className="block text-sm text-slate-600">Serial Number</label>
          <input name="serial_number" value={form.serial_number} onChange={onChange} required className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-600">Start Date</label>
            <input type="date" name="start_date" value={form.start_date} onChange={onChange} className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm text-slate-600">Condition</label>
            <input name="condition" value={form.condition} onChange={onChange} className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm text-slate-600">Condition Comments</label>
            <textarea name="condition_comments" value={form.condition_comments} onChange={onChange} className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" />
          </div>
        </div>
        <div className="flex gap-3">
          <button className="rounded-md bg-primary text-white px-4 py-2 text-sm">Create</button>
          <button type="button" onClick={()=>navigate(-1)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button>
        </div>
      </form>
    </div>
  );
}

