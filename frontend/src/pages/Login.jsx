import { useState } from 'react';
import { api, setAuth, getUser } from '../api';
import { Navigate, useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const existing = getUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (existing) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-[Inter]">
      <div className="w-full max-w-sm bg-white shadow-sm rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-800 mb-4">Sign in</h1>
        {error && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 mb-3">{error}</div>}
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-slate-600">Username</label>
            <input value={username} onChange={(e)=>setUsername(e.target.value)} className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" required />
          </div>
          <div>
            <label className="block text-sm text-slate-600">Password</label>
            <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="mt-1 w-full rounded-md border-slate-300 focus:border-primary focus:ring-primary" required />
          </div>
          <button className="w-full rounded-md bg-primary text-white py-2 font-medium">Login</button>
        </form>
      </div>
    </div>
  );
}

