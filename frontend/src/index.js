import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CategoriesAdmin from './pages/CategoriesAdmin';
import CategoryItemsList from './pages/CategoryItemsList';
import CategoryItemNew from './pages/CategoryItemNew';
import CategoryItemDetail from './pages/CategoryItemDetail';
import UsersList from './pages/UsersList';
import UserDetail from './pages/UserDetail';
import MyProfile from './pages/MyProfile';
import RolesAdmin from './pages/RolesAdmin';
import RequestsList from './pages/RequestsList';
import RequestNew from './pages/RequestNew';
import RequestDetail from './pages/RequestDetail';
import { getUser } from './api';

const root = ReactDOM.createRoot(document.getElementById('root'));
function RequireAuth({ children }) {
  const user = getUser();
  return user ? children : <Navigate to="/login" replace />;
}

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><App /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="categories/:slug" element={<CategoryItemsList />} />
          <Route path="categories/:slug/new" element={<CategoryItemNew />} />
          <Route path="categories/:slug/:id" element={<CategoryItemDetail />} />
          <Route path="admin/categories" element={<CategoriesAdmin />} />
          <Route path="users" element={<UsersList />} />
          <Route path="users/:employeeId" element={<UserDetail />} />
          <Route path="me" element={<MyProfile />} />
          <Route path="admin/roles" element={<RolesAdmin />} />
          <Route path="requests" element={<RequestsList />} />
          <Route path="requests/new" element={<RequestNew />} />
          <Route path="requests/:id" element={<RequestDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
