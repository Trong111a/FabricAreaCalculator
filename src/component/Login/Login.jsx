import React, { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import './Login.css';

const hardUsers = [   // gán cứng danh sách tài khoản
    { email: 'test@example.com', password: '123456', name: 'Test User' },
    { email: 'admin@example.com', password: 'admin123', name: 'Admin' },
];

function Login({ onLoginSuccess, onNavigate }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        setError('');
        const found = hardUsers.find(u => u.email === email && u.password === password);
        if (!found) return setError('Email hoặc mật khẩu không đúng!');
        onLoginSuccess(found);
    };

    return (
        <div className="login-wrap">
            <div className="login-card">
                <h2>Đăng Nhập</h2>
                {error && <div className="error">{error}</div>}
                <div className="input-group">
                    <Mail size={18} />
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="input-group">
                    <Lock size={18} />
                    <input type="password" placeholder="Mật khẩu" value={password} onChange={e => setPassword(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleLogin()} />
                </div>
                <button className="btn-primary" onClick={handleLogin}>Đăng Nhập</button>

                <div className="links">
                    <button onClick={() => onNavigate('forgot')}>Quên mật khẩu?</button>
                    <span>Chưa có tài khoản? <b onClick={() => onNavigate('register')}>Đăng ký</b></span>
                </div>

                <div className="demo">
                    <p>Demo:</p>
                    <p>test@example.com / 123456</p>
                    <p>admin@example.com / admin123</p>
                </div>
            </div>
        </div>
    );
}

export default Login;