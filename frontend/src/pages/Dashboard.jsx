import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [cats, setCats] = useState([]);
  const user = getUser();
  useEffect(() => {
    api.get('/categories/stats').then(r => setCats(r.data)).catch(()=>{});
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-slate-900 text-3xl font-bold tracking-tight">Asset Categories</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage and browse your IT asset categories.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cats.map(c => (
          <Link key={c.slug} to={`/categories/${c.slug}`} className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">category</span>
                <h3 className="text-slate-800 text-lg font-bold">{c.name}</h3>
              </div>
              <p className="text-slate-500 mt-2 text-sm">Browse items in this category.</p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm font-medium text-slate-600">{c.count} Items</span>
              <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
            </div>
          </Link>
        ))}
        {user?.role === 'admin' && (
          <Link to="/admin/categories" className="flex flex-col justify-center items-center gap-4 rounded-xl p-6 bg-white shadow-sm border-2 border-dashed border-slate-300 hover:border-primary transition-colors">
            <div className="flex items-center justify-center bg-slate-100 rounded-full h-12 w-12">
              <span className="material-symbols-outlined text-primary text-2xl">add</span>
            </div>
            <h3 className="text-slate-800 text-lg font-bold">New Category</h3>
            <p className="text-slate-500 text-sm text-center">Create a new category for your assets.</p>
          </Link>
        )}
      </div>
    </div>
  );
}
