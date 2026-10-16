import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';

export const Login = ({ onNavigate }) => {
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    college_id: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic frontend validation
    if (!formData.college_id.trim()) {
      setError('Please enter your College ID');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Login failed. Please verify your credentials.');
      }

      // Persist auth session to AuthContext state and localStorage so session survives refreshes
      login(data.token, data.user);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1>Athlete & Staff Portal</h1>
        <p>Enter your College ID and credentials to access tournament fixtures</p>
      </div>

      <Alert type="error" message={error} />

      <form onSubmit={handleSubmit}>
        <div className="form-group full-width">
          <label className="form-label" htmlFor="college_id">
            College ID / Roll No.
          </label>
          <div className="input-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="12" y2="16" />
              </svg>
            </span>
            <input
              id="college_id"
              name="college_id"
              type="text"
              placeholder="e.g. CS2026-042 or ADMIN-01"
              className="form-input"
              value={formData.college_id}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className="form-group full-width">
          <label className="form-label" htmlFor="password">
            Password
          </label>
          <div className="input-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              className="form-input"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={loading}
          style={{ marginTop: '0.75rem' }}
        >
          {loading ? (
            <span>Signing In...</span>
          ) : (
            <>
              <span>Sign In to Arena</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </form>

      <div style={{ textAlign: 'right', marginTop: '0.8rem' }}><a href="#forgot-password" onClick={(e) => { e.preventDefault(); onNavigate('forgot-password'); }}>Forgot password?</a></div>

      <div className="auth-footer">
        Don't have a tournament profile yet?{' '}
        <a href="#signup" onClick={(e) => { e.preventDefault(); onNavigate('signup'); }}>
          Register as an Athlete / Admin
        </a>
      </div>
    </div>
  );
};
