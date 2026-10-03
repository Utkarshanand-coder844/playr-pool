import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { SPORT_LIST, emptyProfile } from '../utils/sportRoles';
import { SportRoleFields } from '../components/SportRoleFields';

export const Signup = ({ onNavigate }) => {
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    college_id: '',
    name: '',
    department: '',
    campus: 'Main Campus',
    year: '1st Year',
    email: '',
    phone: '',
    role: 'player',
    admin_code: '',
    password: '',
    confirmPassword: '',
    sports: []
  });

  // sport_profiles: { Cricket: { primary_role: '', batting_hand: '', ... }, Football: {...}, ... }
  const [sportProfiles, setSportProfiles] = useState({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [showAdminCode, setShowAdminCode] = useState(false);

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = Math.min(360, image.width, image.height);
        const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d');
        const offsetX = (image.width - Math.min(image.width, image.height)) / 2;
        const offsetY = (image.height - Math.min(image.width, image.height)) / 2;
        const cropSize = Math.min(image.width, image.height);
        context.drawImage(image, offsetX, offsetY, cropSize, cropSize, 0, 0, size, size);
        let quality = 0.8;
        let compressed = canvas.toDataURL('image/jpeg', quality);
        while (compressed.length > 170000 && quality > 0.35) { quality -= 0.1; compressed = canvas.toDataURL('image/jpeg', quality); }
        if (compressed.length > 170000) { setError('This image could not be compressed enough. Please choose another photo.'); return; }
        setFormData((current) => ({ ...current, profile_photo: compressed }));
        setPhotoPreview(compressed); setError('');
      };
      image.onerror = () => setError('Unable to read that image.');
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const toggleSport = (sport) => {
    const current = formData.sports;
    if (current.includes(sport)) {
      setFormData(fd => ({ ...fd, sports: fd.sports.filter(s => s !== sport) }));
      setSportProfiles(sp => { const updated = { ...sp }; delete updated[sport]; return updated; });
    } else {
      setFormData(fd => ({ ...fd, sports: [...fd.sports, sport] }));
      setSportProfiles(sp => ({ ...sp, [sport]: emptyProfile(sport) }));
    }
    if (error) setError('');
  };

  const handleProfileChange = (sport, field, value) => {
    setSportProfiles(sp => ({
      ...sp,
      [sport]: { ...(sp[sport] || emptyProfile(sport)), [field]: value }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.college_id.trim()) { setError('College ID is required'); return; }
    if (!formData.name.trim()) { setError('Full Name is required'); return; }
    if (!formData.department.trim()) { setError('Department is required'); return; }
    if (!formData.email.trim()) { setError('Email address is required'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) { setError('Please provide a valid email format (e.g. name@college.edu)'); return; }
    if (!formData.phone.trim()) { setError('Phone number is required'); return; }
    if (formData.role === 'player' && formData.sports.length === 0) { setError('Select at least one sport.'); return; }
    if (!formData.password) { setError('Password is required'); return; }
    if (formData.password.length < 6) { setError('Password must be at least 6 characters long'); return; }
    if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: formData.college_id,
          name: formData.name,
          department: formData.department,
          campus: formData.campus,
          year: formData.year,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          admin_code: (formData.admin_code || '').trim(),
          password: formData.password,
          profile_photo: formData.profile_photo || null,
          sports: formData.sports,
          sportProfiles // send role profiles alongside sport list
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Registration failed. Please check your details.');
      }

      setSuccess('Account created successfully! Logging you in...');
      setTimeout(() => {
        login(data.token, data.user);
        onNavigate('dashboard');
      }, 700);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sportEmojis = {
    Football: '⚽', Cricket: '🏏', Basketball: '🏀', Volleyball: '🏐',
    Badminton: '🏸', 'Table Tennis': '🏓', Athletics: '🏃', Chess: '♟️'
  };

  return (
    <div className="auth-card" style={{ maxWidth: '680px' }}>
      <div className="auth-header">
        <h1>Athlete Registration</h1>
        <p>Join your college sports roster and create or join sports teams</p>
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {/* College ID */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_college_id">College ID / Roll No *</label>
            <input id="reg_college_id" name="college_id" type="text" placeholder="e.g. CS2026-101" className="form-input no-icon" value={formData.college_id} onChange={handleChange} required />
          </div>

          {/* Full Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_name">Full Name *</label>
            <input id="reg_name" name="name" type="text" placeholder="e.g. Alex Morgan" className="form-input no-icon" value={formData.name} onChange={handleChange} required />
          </div>

          {/* Department */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_department">Department / Branch *</label>
            <input id="reg_department" name="department" type="text" placeholder="e.g. Computer Science" className="form-input no-icon" value={formData.department} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg_campus">Campus *</label>
            <input id="reg_campus" name="campus" type="text" placeholder="e.g. Campus A" className="form-input no-icon" value={formData.campus} onChange={handleChange} required maxLength="100" />
          </div>

          {/* Academic Year */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_year">Academic Year *</label>
            <select id="reg_year" name="year" className="form-select no-icon" value={formData.year} onChange={handleChange} required>
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
            <label className="form-label" htmlFor="reg_email">College Email *</label>
            <input id="reg_email" name="email" type="email" placeholder="alex@college.edu" className="form-input no-icon" value={formData.email} onChange={handleChange} required />
          </div>

          {/* Phone */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_phone">Contact Phone *</label>
            <input id="reg_phone" name="phone" type="tel" placeholder="+1 (555) 019-2834" className="form-input no-icon" value={formData.phone} onChange={handleChange} required />
          </div>

          {/* Profile Photo */}
          <div className="form-group full-width">
            <label className="form-label" htmlFor="reg_profile_photo">Profile photo <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
            <div className="profile-photo-picker">
              {photoPreview ? <img src={photoPreview} alt="Profile preview" /> : <div className="profile-photo-placeholder">📷</div>}
              <div>
                <input id="reg_profile_photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} />
                <p>JPEG, PNG, or WebP. The image is cropped and compressed before upload.</p>
                {photoPreview && <button type="button" className="btn btn-danger btn-sm" onClick={() => { setPhotoPreview(''); setFormData((current) => ({ ...current, profile_photo: '' })); }}>Remove photo</button>}
              </div>
            </div>
          </div>

          {/* Sports Selection with Role Fields — available to both players and admins */}
          {(
            <div className="form-group full-width">
              <label className="form-label">Sports you want to register for {formData.role === 'player' ? '*' : '(optional)'}</label>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', marginTop: '-0.1rem' }}>
                Select each sport and fill in your playing role/position below it.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {SPORT_LIST.map(sport => (
                  <div key={sport}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      cursor: 'pointer',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: formData.sports.includes(sport)
                        ? 'rgba(6, 182, 212, 0.12)'
                        : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${formData.sports.includes(sport) ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.07)'}`,
                      transition: 'all 0.2s'
                    }}>
                      <input
                        type="checkbox"
                        checked={formData.sports.includes(sport)}
                        onChange={() => toggleSport(sport)}
                        style={{ accentColor: 'var(--accent-cyan)', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '1rem' }}>{sportEmojis[sport] || '🏆'}</span>
                      <span style={{
                        fontWeight: formData.sports.includes(sport) ? 600 : 400,
                        color: formData.sports.includes(sport) ? 'var(--accent-cyan)' : 'var(--text-secondary)'
                      }}>{sport}</span>
                    </label>

                    {/* Role fields expand when sport is selected */}
                    {formData.sports.includes(sport) && (
                      <SportRoleFields
                        sport={sport}
                        profile={sportProfiles[sport] || emptyProfile(sport)}
                        onChange={(field, value) => handleProfileChange(sport, field, value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Role */}
          <div className="form-group full-width">
            <label className="form-label" htmlFor="reg_role">Account Role</label>
            <select id="reg_role" name="role" className="form-select no-icon" value={formData.role} onChange={handleChange}>
              <option value="player">Player (Compete &amp; form teams)</option>
              <option value="admin">Tournament Admin (Manage scores &amp; fixtures)</option>
            </select>
          </div>

          {formData.role === 'admin' && (
            <div className="form-group full-width">
              <label className="form-label" htmlFor="reg_admin_code">
                <span>Admin Access Code *</span>
                <button
                  type="button"
                  onClick={() => setShowAdminCode(!showAdminCode)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.75rem', textTransform: 'none' }}
                >
                  {showAdminCode ? 'Hide' : 'Show code'}
                </button>
              </label>
              <input
                id="reg_admin_code"
                type={showAdminCode ? 'text' : 'password'}
                name="admin_code"
                className="form-input no-icon"
                placeholder="Default tournament code: 1234"
                value={formData.admin_code}
                onChange={handleChange}
                required
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                Organizer access code (Default: <strong style={{ color: 'var(--text-primary)' }}>1234</strong>)
              </small>
            </div>
          )}

          {/* Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_password">Password (min 6) *</label>
            <input id="reg_password" name="password" type="password" placeholder="••••••••" className="form-input no-icon" value={formData.password} onChange={handleChange} required />
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg_confirm_password">Confirm Password *</label>
            <input id="reg_confirm_password" name="confirmPassword" type="password" placeholder="••••••••" className="form-input no-icon" value={formData.confirmPassword} onChange={handleChange} required />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1.25rem' }}>
          {loading ? (
            <span>Creating Profile...</span>
          ) : (
            <>
              <span>Complete Registration</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </form>

      <div className="auth-footer">
        Already registered with your College ID?{' '}
        <a href="#login" onClick={(e) => { e.preventDefault(); onNavigate('login'); }}>
          Sign In here
        </a>
      </div>
    </div>
  );
};
