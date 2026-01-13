import React, { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import './ForgotPass.css';

function ForgotPass({ onNavigate }) {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);

    const handleSend = () => {
        if (!email) return;
        setSent(true);
        setTimeout(() => onNavigate('login'), 2000);
    };

    return (
        <div className="fp-wrap">
            <div className="fp-card">
                <button className="back" onClick={() => onNavigate('login')}><ArrowLeft size={20} /> Quay lại</button>
                <h2>Quên Mật Khẩu</h2>
                <p className="sub">Nhập email để nhận link đặt lại mật khẩu</p>
                {sent ? <div className="success">Đã gửi link – đang chuyển...</div> : null}
                <div className="input-group"><Mail size={18} /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" onKeyPress={e => e.key === 'Enter' && handleSend()} /></div>
                <button className="btn-primary" onClick={handleSend}>Gửi Link</button>
            </div>
        </div>
    );
}

export default ForgotPass;