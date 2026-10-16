import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { getAuthHeaders } from '../utils/authFetch';

const SPORT_OPTIONS = [
  'All',
  'Football',
  'Cricket',
  'Basketball',
  'Badminton',
  'Volleyball',
  'Table Tennis',
  'General'
];

const CATEGORY_OPTIONS = [
  'All',
  'Tournament Experience',
  'Match Strategy',
  'Court Feedback & Drills',
  'Equipment & Gear',
  'Team Dynamics',
  'General Review'
];

const RATING_CAPTIONS = {
  1: '1.0 — Needs Improvement',
  2: '2.0 — Fair Effort',
  3: '3.0 — Good Experience',
  4: '4.0 — Very Good Gameplay',
  5: '5.0 — Exceptional Experience!'
};

const SPORT_ICONS = {
  Football: '⚽',
  Cricket: '🏏',
  Basketball: '🏀',
  Badminton: '🏸',
  Volleyball: '🏐',
  'Table Tennis': '🏓',
  General: '🏆'
};

const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const PlayerExperiences = ({ onNavigate }) => {
  const { user, token, isAuthenticated } = useAuth();

  const [experiences, setExperiences] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [sortBy, setSortBy] = useState('recent');

  // Modal & Posting
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [copiedId, setCopiedId] = useState(null);

  // Form Fields
  const [formData, setFormData] = useState({
    authorName: '',
    authorRole: '',
    campus: 'Main Campus',
    sport: 'Football',
    rating: 5,
    experienceType: 'Tournament Experience',
    title: '',
    experience: '',
    recommendations: ''
  });

  // Pre-fill user data when modal opens
  const openModal = () => {
    setFormData({
      authorName: user?.name || '',
      authorRole: user?.role === 'admin' ? 'Tournament Admin' : (user ? 'Athlete' : 'Player'),
      campus: user?.campus || 'Main Campus',
      sport: 'Football',
      rating: 5,
      experienceType: 'Tournament Experience',
      title: '',
      experience: '',
      recommendations: ''
    });
    setFormError('');
    setHoverRating(0);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (!submitting) {
      setIsModalOpen(false);
    }
  };

  // Fetch experiences
  const loadExperiences = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedSport && selectedSport !== 'All') params.set('sport', selectedSport);
      if (selectedType && selectedType !== 'All') params.set('type', selectedType);
      if (search.trim()) params.set('search', search.trim());
      if (sortBy) params.set('sort', sortBy);

      const res = await fetch(`/api/experiences?${params.toString()}`, {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load experiences');
      setExperiences(data.experiences || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const loadStats = async () => {
    try {
      const res = await fetch('/api/experiences/stats');
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    loadExperiences();
  }, [selectedSport, selectedType, sortBy, token]);

  useEffect(() => {
    loadStats();
  }, []);

  // Handle Search submit / debounce
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadExperiences();
  };

  // Toggle upvote
  const handleToggleUpvote = async (expId) => {
    try {
      const res = await fetch(`/api/experiences/${expId}/upvote`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) return;

      setExperiences((prev) =>
        prev.map((item) =>
          item.id === expId
            ? { ...item, upvotes: data.upvotes, has_upvoted: data.upvoted }
            : item
        )
      );

      // Refresh stats count
      loadStats();
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  };

  // Share experience link
  const handleShare = (item) => {
    const textToCopy = `${item.title ? `${item.title} — ` : ''}${item.author_name}'s review on Playr-Pool: "${item.experience.slice(0, 100)}..."`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${window.location.origin}/experiences#${item.id}`).catch(() => {});
    }
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 2500);
  };

  // Delete experience
  const handleDelete = async (expId) => {
    if (!window.confirm('Are you sure you want to delete this experience post?')) return;
    try {
      const res = await fetch(`/api/experiences/${expId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete');

      setExperiences((prev) => prev.filter((item) => item.id !== expId));
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  };

  // Submit experience form
  const handleSubmitExperience = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!isAuthenticated && (!formData.authorName || formData.authorName.trim().length < 2)) {
      setFormError('Please enter your name (at least 2 characters).');
      return;
    }

    if (!formData.experience || formData.experience.trim().length < 10) {
      setFormError('Please describe your user experience in at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        authorName: isAuthenticated ? user.name : formData.authorName.trim(),
        authorRole: formData.authorRole?.trim() || (isAuthenticated ? 'Athlete' : 'Player'),
        campus: formData.campus?.trim() || 'Main Campus',
        sport: formData.sport,
        rating: formData.rating,
        experienceType: formData.experienceType,
        title: formData.title?.trim() || '',
        experience: formData.experience.trim(),
        recommendations: formData.recommendations?.trim() || ''
      };

      const res = await fetch('/api/experiences', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to publish');

      setIsModalOpen(false);
      loadExperiences();
      loadStats();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating || formData.rating;

  return (
    <div className="experiences-page-container">
      {/* Hero Banner & Stats Overview */}
      <section className="experiences-hero">
        <div className="experiences-hero-header">
          <div className="experiences-hero-title-group">
            <h1>
              <span>📣</span> Player Experiences & Advice
            </h1>
            <p className="experiences-hero-subtitle">
              Authentic tournament feedback, match takeaways, court breakdowns, and tactical recommendations from players across campus.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
          >
            <span>✍️</span> Share Your Experience
          </button>
        </div>

        {/* Aggregate Stats Strip */}
        <div className="experiences-stats-strip">
          <div className="stat-chip-card">
            <span className="stat-chip-label">Community Rating</span>
            <div className="stat-chip-value">
              <span style={{ color: '#fbbf24' }}>★</span>
              <span>{stats?.overview?.avg_rating || '5.0'}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 5.0</span>
            </div>
          </div>

          <div className="stat-chip-card">
            <span className="stat-chip-label">Total Stories</span>
            <div className="stat-chip-value">
              <span>{stats?.overview?.total_experiences || experiences.length}</span>
            </div>
          </div>

          <div className="stat-chip-card">
            <span className="stat-chip-label">Community Recommendations</span>
            <div className="stat-chip-value" style={{ color: 'var(--accent-emerald)' }}>
              <span>💡 {stats?.overview?.total_upvotes || 0}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>helpful votes</span>
            </div>
          </div>

          <div className="stat-chip-card">
            <span className="stat-chip-label">Verified Athletes</span>
            <div className="stat-chip-value" style={{ color: 'var(--accent-cyan)' }}>
              <span>🛡️ {stats?.overview?.verified_count || 0}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search Controls */}
      <div className="experiences-filter-bar">
        <form onSubmit={handleSearchSubmit} className="experiences-search-row">
          <div className="experiences-search-input-wrapper">
            <span className="experiences-search-icon">🔍</span>
            <input
              type="text"
              className="experiences-search-input"
              placeholder="Search experiences, advice, players, or equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="experiences-select-filter"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            aria-label="Filter by category"
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'All' ? 'All Categories' : cat}
              </option>
            ))}
          </select>

          <select
            className="experiences-select-filter"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort by"
          >
            <option value="recent">⏱️ Most Recent</option>
            <option value="top">👍 Most Helpful (Upvoted)</option>
            <option value="rating">⭐ Highest Rated</option>
            <option value="oldest">📅 Oldest</option>
          </select>

          <button type="submit" className="btn btn-secondary btn-sm" style={{ height: '42px' }}>
            Filter
          </button>
        </form>

        {/* Sport Pills Filter */}
        <div className="sport-pills-row" role="tablist" aria-label="Filter by sport">
          {SPORT_OPTIONS.map((sport) => {
            const isActive = selectedSport === sport;
            const icon = SPORT_ICONS[sport] || '🏅';
            return (
              <button
                type="button"
                key={sport}
                className={`sport-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedSport(sport)}
              >
                <span>{icon}</span>
                <span>{sport}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Alert type="error" message={error} />

      {/* Feed List */}
      {loading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1rem',
            gap: '1rem',
            color: 'var(--text-muted)'
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--accent-cyan)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          <p>Loading player stories & recommendations…</p>
        </div>
      ) : experiences.length === 0 ? (
        <div
          className="auth-card"
          style={{
            maxWidth: '100%',
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ fontSize: '3rem' }}>💡</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            No Player Experiences Found
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
            {search || selectedSport !== 'All' || selectedType !== 'All'
              ? 'Try adjusting your search terms or filters to find other campus stories.'
              : 'Be the first athlete to post your tournament gameplay experience and recommendations!'}
          </p>
          <button type="button" className="btn btn-primary" onClick={openModal} style={{ marginTop: '0.5rem' }}>
            ✍️ Post the First Experience
          </button>
        </div>
      ) : (
        <div className="experience-cards-grid">
          {experiences.map((item) => {
            const isAuthor = user && (user.id === item.user_id || user.role === 'admin');
            const sportIcon = SPORT_ICONS[item.sport] || '🏆';

            return (
              <article key={item.id} id={item.id} className="experience-card">
                {/* Header */}
                <div className="experience-card-header">
                  <div className="experience-author-cluster">
                    <div className="experience-author-avatar">
                      {item.author_photo ? (
                        <img src={item.author_photo} alt={item.author_name} />
                      ) : (
                        item.author_name ? item.author_name[0].toUpperCase() : 'P'
                      )}
                    </div>
                    <div className="experience-author-meta">
                      <div className="experience-author-name-row">
                        <span className="experience-author-name">{item.author_name}</span>
                        {item.is_verified_player ? (
                          <span className="verified-player-badge" title="Verified Campus Athlete">
                            ✓ Verified Athlete
                          </span>
                        ) : (
                          <span className="guest-player-badge">Guest Athlete</span>
                        )}
                      </div>
                      <div className="experience-author-submeta">
                        {item.author_role && <span>{item.author_role}</span>}
                        {item.author_department && <span>• {item.author_department}</span>}
                        {item.campus && <span>• {item.campus}</span>}
                        <span>• {formatTimeAgo(item.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Header Category and Sport Badges */}
                  <div className="experience-header-tags">
                    <span className="sport-tag-pill">
                      {sportIcon} {item.sport}
                    </span>
                    <span className="category-tag-pill">{item.experience_type}</span>
                  </div>
                </div>

                {/* Star Rating Display */}
                <div className="star-rating-strip" aria-label={`Rating: ${item.rating} out of 5 stars`}>
                  <div className="stars-row">
                    {'★'.repeat(item.rating)}
                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>{'★'.repeat(5 - item.rating)}</span>
                  </div>
                  <span className="rating-numeric">{item.rating}.0</span>
                </div>

                {/* Title */}
                {item.title && <h2 className="experience-story-title">{item.title}</h2>}

                {/* Experience Narrative */}
                <div className="experience-story-narrative">{item.experience}</div>

                {/* Recommendation Spotlight Callout Box */}
                {item.recommendations && (
                  <div className="recommendation-spotlight-box">
                    <div className="recommendation-box-header">
                      <span>💡</span>
                      <span>Player Recommendations & Advice</span>
                    </div>
                    <div className="recommendation-box-text">{item.recommendations}</div>
                  </div>
                )}

                {/* Card Actions Footer */}
                <div className="experience-card-footer">
                  <div className="experience-footer-actions">
                    <button
                      type="button"
                      className={`experience-upvote-btn ${item.has_upvoted ? 'upvoted' : ''}`}
                      onClick={() => handleToggleUpvote(item.id)}
                      title={item.has_upvoted ? 'Remove helpful vote' : 'Mark this experience as helpful'}
                    >
                      <span>👍</span>
                      <span>{item.has_upvoted ? 'Helpful' : 'Mark Helpful'}</span>
                      <strong style={{ marginLeft: 3 }}>({item.upvotes || 0})</strong>
                    </button>

                    <button
                      type="button"
                      className="experience-share-btn"
                      onClick={() => handleShare(item)}
                      title="Share link to this recommendation"
                    >
                      <span>🔗</span>
                      <span>{copiedId === item.id ? 'Copied Link!' : 'Share'}</span>
                    </button>
                  </div>

                  {isAuthor && (
                    <button
                      type="button"
                      className="experience-delete-btn"
                      onClick={() => handleDelete(item.id)}
                      title="Delete your post"
                    >
                      🗑️ Delete Post
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Submission Modal Dialog */}
      {isModalOpen && (
        <div className="experience-modal-overlay" onClick={closeModal}>
          <div
            className="experience-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-experience-title"
          >
            <div className="experience-modal-header">
              <div>
                <h2 id="modal-experience-title">Share Your Experience & Advice</h2>
                <p>Help future tournament players, teams, and organizers with your genuine takeaways.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Authentication status banner */}
            {isAuthenticated ? (
              <div className="auth-status-prompt">
                <div>
                  <strong>Posting as {user.name}</strong> · Verified {user.role === 'admin' ? 'Admin' : 'Athlete'}
                </div>
                <span className="verified-player-badge">✓ Verified Badge Attached</span>
              </div>
            ) : (
              <div className="auth-status-prompt guest">
                <div>
                  <strong>Guest Athlete Mode</strong> — Anyone can post!
                  <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.85 }}>
                    Have an account? Log in to show your official Verified Athlete badge.
                  </span>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      closeModal();
                      onNavigate('login');
                    }}
                  >
                    Log In
                  </button>
                )}
              </div>
            )}

            <Alert type="error" message={formError} />

            <form onSubmit={handleSubmitExperience}>
              {/* Unregistered Guest details */}
              {!isAuthenticated && (
                <div className="form-group-grid" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">
                      Your Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="form-input no-icon"
                      required
                      placeholder="e.g. Alex Chen"
                      value={formData.authorName}
                      onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Playing Role / Position</label>
                    <input
                      type="text"
                      className="form-input no-icon"
                      placeholder="e.g. Forward, Captain, Singles"
                      value={formData.authorRole}
                      onChange={(e) => setFormData({ ...formData, authorRole: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Sport & Category Row */}
              <div className="form-group-grid" style={{ marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sport</label>
                  <select
                    className="form-select no-icon"
                    value={formData.sport}
                    onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                  >
                    {SPORT_OPTIONS.filter((s) => s !== 'All').map((sport) => (
                      <option key={sport} value={sport}>
                        {SPORT_ICONS[sport] || '🏅'} {sport}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <select
                    className="form-select no-icon"
                    value={formData.experienceType}
                    onChange={(e) => setFormData({ ...formData, experienceType: e.target.value })}
                  >
                    {CATEGORY_OPTIONS.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Campus */}
              <div className="form-group">
                <label className="form-label">Campus / Ground Location</label>
                <input
                  type="text"
                  className="form-input no-icon"
                  placeholder="e.g. Main Campus, North Turf, Sports Arena"
                  value={formData.campus}
                  onChange={(e) => setFormData({ ...formData, campus: e.target.value })}
                />
              </div>

              {/* Interactive Star Rating */}
              <div className="form-group">
                <label className="form-label">Your Experience Rating</label>
                <div className="interactive-stars-picker">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`interactive-star-btn ${star <= activeRating ? 'active' : ''}`}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setFormData({ ...formData, rating: star })}
                      aria-label={`${star} star`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="star-rating-caption">{RATING_CAPTIONS[activeRating]}</span>
                </div>
              </div>

              {/* Post Title */}
              <div className="form-group">
                <label className="form-label">Post Title (Headline)</label>
                <input
                  type="text"
                  className="form-input no-icon"
                  placeholder="e.g. Intense Semis Atmosphere & Turf Adaptability"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              {/* User Experience Narrative */}
              <div className="form-group">
                <label className="form-label">
                  Your User Experience <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <textarea
                  className="form-textarea no-icon"
                  required
                  rows={4}
                  placeholder="Describe what it was like playing in the tournament, atmosphere, organization, pace of play, refereeing, or court condition..."
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                />
              </div>

              {/* Recommendations Spotlight */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>💡</span> Recommendations & Tactical Tips
                </label>
                <textarea
                  className="form-textarea no-icon"
                  rows={3}
                  placeholder="What advice, tactical adjustments, gear recommendations, or preparation tips would you give to other players or organizers?"
                  value={formData.recommendations}
                  onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ minWidth: 160 }}
                >
                  {submitting ? 'Publishing…' : 'Publish Experience 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerExperiences;
