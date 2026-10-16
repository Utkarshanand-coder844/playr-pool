import React, { useState } from 'react';
import { Alert } from '../components/Alert';

export const ForgotPassword = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState(new URLSearchParams(window.location.search).get('resetToken') || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestReset = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to request a reset');
      setMessage(data.message);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const confirmReset = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password }) });
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to reset password');
      setMessage(data.message); setPassword('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return <div className="auth-card">
    <div className="auth-header"><h1>Reset Password</h1><p>Enter your registered college email to receive a one-hour recovery link.</p></div>
    <Alert type="error" message={error} />
    {message && <div className="alert alert-success">{message}</div>}
    <form onSubmit={requestReset}><div className="form-group"><label className="form-label">College email</label><input type="email" autoComplete="email" className="form-input no-icon" value={email} onChange={e => setEmail(e.target.value)} required /></div><button className="btn btn-secondary" disabled={busy}>Email reset link</button></form>
    <form onSubmit={confirmReset} style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="form-group"><label className="form-label">Reset token</label><input className="form-input no-icon" value={resetToken} onChange={e => setResetToken(e.target.value)} required /></div>
      <div className="form-group"><label className="form-label">New password (min 8 characters)</label><input type="password" minLength="8" className="form-input no-icon" value={password} onChange={e => setPassword(e.target.value)} required /></div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Working…' : 'Set new password'}</button>
    </form>
    <div className="auth-footer"><a href="#login" onClick={e => { e.preventDefault(); onNavigate('login'); }}>Back to sign in</a></div>
  </div>;
};
