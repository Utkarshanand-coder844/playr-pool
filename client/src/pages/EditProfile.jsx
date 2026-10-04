import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';

export const EditProfile = ({ onNavigate }) => {
  const { user, updateProfile } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    department: '',
    campus: '',
    year: '1st Year',
    email: '',
    phone: '',
    profile_photo: ''
  });

  const [photoPreview, setPhotoPreview] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Pre-fill form with current user data on mount
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        department: user.department || '',
        campus: user.campus || '',
        year: user.year || '1st Year',
        email: user.email || '',
        phone: user.phone || '',
        profile_photo: user.profile_photo || ''
      });
      setPhotoPreview(user.profile_photo || '');
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = Math.min(360, image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const cropSize = Math.min(image.width, image.height);
        const offsetX = (image.width - cropSize) / 2;
        const offsetY = (image.height - cropSize) / 2;
        ctx.drawImage(image, offsetX, offsetY, cropSize, cropSize, 0, 0, size, size);
        let quality = 0.8;
        let compressed = canvas.toDataURL('image/jpeg', quality);
        while (compressed.length > 170000 && quality > 0.35) {
          quality -= 0.1;
          compressed = canvas.toDataURL('image/jpeg', quality);
        }
        if (compressed.length > 170000) {
          setError('This image could not be compressed enough. Please choose another photo.');
          return;
        }
        setFormData(prev => ({ ...prev, profile_photo: compressed }));
        setPhotoPreview(compressed);
        setError('');
      };
      image.onerror = () => setError('Unable to read that image.');
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview('');
    setFormData(prev => ({ ...prev, profile_photo: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) { setError('Full Name is required'); return; }
    if (!formData.department.trim()) { setError('Department is required'); return; }
    if (!formData.campus.trim()) { setError('Campus is required'); return; }
    if (!formData.email.trim()) { setError('Email address is required'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError('Please provide a valid email format (e.g. name@college.edu)');
      return;
    }
    if (!formData.phone.trim()) { setError('Phone number is required'); return; }

    setSaving(true);
    try {
      await updateProfile({
        name: formData.name,
        department: formData.department,
        campus: formData.campus,
        year: formData.year,
        email: formData.email,
        phone: formData.phone,
        profile_photo: formData.profile_photo || null
      });
      setSuccess('Your registration details have been updated successfully!');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : 'AT';

  return (
    <div className="dashboard-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span>✏️</span>
          <span>Update Registration</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Edit your personal details, contact information, and profile photo below.
          Your College ID and account role cannot be changed here.
        </p>
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      <div className="auth-card" style={{ maxWidth: '100%' }}>
        {/* Read-only identity strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px', padding: '0.85rem 1.1rem', marginBottom: '1.75rem'
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
            background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0
          }}>
            {photoPreview
              ? <img src={photoPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#fff', fontSize: '1rem' }}>{user?.name}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
              <span>ID: {user?.college_id}</span>
              <span>•</span>
              <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
            </div>
          </div>
          <span style={{
            marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.6rem',
            borderRadius: '6px', whiteSpace: 'nowrap'
          }}>
            🔒 Read-only
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">

            {/* Full Name */}
            <div className="form-group">
              <label className="form-label" htmlFor="ep_name">Full Name *</label>
              <input
                id="ep_name" name="name" type="text"
                className="form-input no-icon"
                placeholder="e.g. Alex Morgan"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            {/* Department */}
            <div className="form-group">
              <label className="form-label" htmlFor="ep_department">Department / Branch *</label>
              <input
                id="ep_department" name="department" type="text"
                className="form-input no-icon"
                placeholder="e.g. Computer Science"
                value={formData.department}
                onChange={handleChange}
                required
              />
            </div>

            {/* Campus */}
            <div className="form-group">
              <label className="form-label" htmlFor="ep_campus">Campus *</label>
              <input
                id="ep_campus" name="campus" type="text"
                className="form-input no-icon"
                placeholder="e.g. Campus A"
                value={formData.campus}
                onChange={handleChange}
                required
                maxLength="100"
              />
            </div>

            {/* Academic Year */}
            <div className="form-group">
              <label className="form-label" htmlFor="ep_year">Academic Year *</label>
              <select
                id="ep_year" name="year"
                className="form-select no-icon"
                value={formData.year}
                onChange={handleChange}
                required
              >
                <option value="1st Year">1st Year (Freshman)</option>
                <option value="2nd Year">2nd Year (Sophomore)</option>
                <option value="3rd Year">3rd Year (Junior)</option>
                <option value="4th Year">4th Year (Senior)</option>
                <option value="Postgraduate">Postgraduate</option>
                <option value="Staff/Faculty">Staff / Faculty</option>
              </select>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="ep_email">College Email *</label>
              <input
                id="ep_email" name="email" type="email"
                className="form-input no-icon"
                placeholder="alex@college.edu"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            {/* Phone */}
            <div className="form-group">
              <label className="form-label" htmlFor="ep_phone">Contact Phone *</label>
              <input
                id="ep_phone" name="phone" type="tel"
                className="form-input no-icon"
                placeholder="+1 (555) 019-2834"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>

            {/* Profile Photo */}
            <div className="form-group full-width">
              <label className="form-label" htmlFor="ep_profile_photo">
                Profile Photo{' '}
                <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
              </label>
              <div className="profile-photo-picker">
                {photoPreview
                  ? <img src={photoPreview} alt="Profile preview" />
                  : <div className="profile-photo-placeholder">📷</div>
                }
                <div>
                  <input
                    id="ep_profile_photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                  />
                  <p>JPEG, PNG, or WebP. The image is cropped and compressed before upload.</p>
                  {photoPreview && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleRemovePhoto}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Helper notice */}
          <div style={{
            marginTop: '1.25rem', padding: '0.75rem 1rem',
            background: 'rgba(6,182,212,0.06)',
            border: '1px solid rgba(6,182,212,0.2)',
            borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)'
          }}>
            🔑 To change your <strong>password</strong>, use the{' '}
            <a
              href="#"
              style={{ color: 'var(--accent-cyan)', cursor: 'pointer' }}
              onClick={(e) => { e.preventDefault(); onNavigate('forgot-password'); }}
            >
              Forgot Password
            </a>{' '}
            flow. To update your <strong>sports &amp; playing roles</strong>,{' '}
            <a
              href="#"
              style={{ color: 'var(--accent-cyan)', cursor: 'pointer' }}
              onClick={(e) => { e.preventDefault(); onNavigate('my-sports'); }}
            >
              go to My Sports
            </a>.
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button
              type="submit"
              id="ep_save_btn"
              className="btn btn-primary"
              disabled={saving}
              style={{ width: 'auto', padding: '0.75rem 2rem' }}
            >
              {saving ? (
                <span>Saving Changes...</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '0.4rem', verticalAlign: 'middle' }}>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Changes
                </>
              )}
            </button>

            <button
              type="button"
              id="ep_cancel_btn"
              className="btn btn-secondary"
              onClick={() => onNavigate('dashboard')}
              style={{ width: 'auto' }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
