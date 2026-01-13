import React, { useState } from 'react';
import Login from './component/Login/Login';
import Register from './component/Register/Register';
import ForgotPass from './component/ForgotPass/ForgotPass';
import ViewMain from './component/ViewMain/ViewMain';

export default function App() {
  const [page, setPage] = useState('login'); // 'login' | 'register' | 'forgot' | 'main'
  const [user, setUser] = useState(null);

  const loginSuccess = u => { setUser(u); setPage('main'); };
  const logout = () => { setUser(null); setPage('login'); };
  const nav = p => setPage(p);

  if (page === 'login') return <Login onLoginSuccess={loginSuccess} onNavigate={nav} />;
  if (page === 'register') return <Register onNavigate={nav} />;
  if (page === 'forgot') return <ForgotPass onNavigate={nav} />;
  if (page === 'main') return <ViewMain user={user} onLogout={logout} />;
  return null;
}