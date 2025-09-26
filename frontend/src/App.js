import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAuth, getUser } from './api';

function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const logout = () => { clearAuth(); navigate('/login'); };
  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="flex items-center justify-between border-b border-primary/20 dark:border-primary/30 px-6 md:px-10 py-4">
        <div className="flex items-center gap-3 text-slate-800">
          <div className="text-primary">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 2H20C21.1 2 22 2.9 22 4V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V4C2 2.9 2.9 2 4 2ZM10 12H4V18H10V12ZM20 12H14V18H20V12ZM10 6H4V10H10V6ZM20 6H14V10H20V6Z"></path></svg>
          </div>
          <h2 className="text-slate-800 text-xl font-bold tracking-tight">AssetTrack</h2>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <NavLink to="/" className={({isActive})=>`text-sm font-medium ${isActive? 'text-primary font-bold':'text-slate-600 hover:text-primary'}`}>Dashboard</NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin/categories" className={({isActive})=>`text-sm font-medium ${isActive? 'text-primary font-bold':'text-slate-600 hover:text-primary'}`}>Categories</NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/users" className={({isActive})=>`text-sm font-medium ${isActive? 'text-primary font-bold':'text-slate-600 hover:text-primary'}`}>Users</NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin/roles" className={({isActive})=>`text-sm font-medium ${isActive? 'text-primary font-bold':'text-slate-600 hover:text-primary'}`}>Roles</NavLink>
          )}
          {(user?.role === 'admin' || user?.role === 'hr') && (
            <NavLink to="/requests" className={({isActive})=>`text-sm font-medium ${isActive? 'text-primary font-bold':'text-slate-600 hover:text-primary'}`}>Requests</NavLink>
          )}
        </nav>
        <div className="flex items-center gap-4">
          {user && (
            <>
              <span className="text-slate-700 text-sm">{user.full_name || user.username}</span>
              <NavLink to="/me" className={({isActive})=>`hidden sm:inline-flex items-center rounded-md px-3 py-1.5 text-sm ${isActive? 'bg-slate-200 text-slate-800':'border border-slate-300 text-slate-700'}`}>My Profile</NavLink>
              <button onClick={logout} className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-white text-sm">Logout</button>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return <Layout />;
}
