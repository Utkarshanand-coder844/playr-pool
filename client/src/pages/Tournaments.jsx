import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../utils/authFetch';

const API = '/api/tournaments';

// ─────────────────────────────────────────────────
// Shared inline styles to match the existing codebase's premium dark aesthetic
// ─────────────────────────────────────────────────
const styles = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '2rem 1rem' },
  heading: { fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem', background: 'linear-gradient(135deg, var(--primary), var(--accent, #38bdf8))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  sub: { color: 'var(--text-secondary)', marginBottom: '1.5rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '1.25rem' },
  card: { background: 'var(--card-bg, #1e293b)', borderRadius: 16, padding: '1.25rem 1.5rem', border: '1px solid var(--border, #334155)', transition: 'transform .15s, box-shadow .15s', cursor: 'pointer', position: 'relative', overflow: 'hidden' },
  cardHover: { transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(0,0,0,.3)' },
  badge: { display: 'inline-block', fontSize: '.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 9999, textTransform: 'uppercase', letterSpacing: '.5px' },
  statusColors: { draft: '#64748b', registration: '#22c55e', live: '#f59e0b', completed: '#6366f1' },
  verifiedBadge: { background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff', marginLeft: 8 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, border: 'none', fontWeight: 600, fontSize: '.875rem', cursor: 'pointer', transition: 'all .15s' },
  btnPrimary: { background: 'linear-gradient(135deg, var(--primary), var(--accent, #38bdf8))', color: '#fff' },
  btnSecondary: { background: 'var(--card-bg, #1e293b)', color: 'var(--text-primary)', border: '1px solid var(--border, #334155)' },
  btnDanger: { background: '#ef4444', color: '#fff' },
  btnSm: { padding: '6px 14px', fontSize: '.8rem', borderRadius: 8 },
  input: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--text-primary)', fontSize: '.875rem', outline: 'none', transition: 'border-color .15s' },
  label: { display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 },
  modal: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' },
  modalContent: { background: 'var(--card-bg, #1e293b)', borderRadius: 20, padding: '2rem', maxWidth: 560, width: '90vw', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border, #334155)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' },
  stat: { textAlign: 'center' },
  statValue: { fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' },
  statLabel: { fontSize: '.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' },
  divider: { border: 'none', borderTop: '1px solid var(--border, #334155)', margin: '1rem 0' },
  tag: { display: 'inline-block', fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,.15)', color: '#818cf8', marginRight: 4, marginBottom: 4 },
  emptyState: { textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' },
  roleOwner: { background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff' },
  roleAdmin: { background: 'linear-gradient(135deg, #6366f1, #7c3aed)', color: '#fff' },
  alert: { padding: '12px 16px', borderRadius: 12, fontSize: '.875rem', marginBottom: '1rem' },
  alertSuccess: { background: 'rgba(34,197,94,.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,.25)' },
  alertError: { background: 'rgba(239,68,68,.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,.25)' },
};

// ─────────────────────────────────────────────────
export const Tournaments = ({ onNavigate }) => {
  const { user, token, isAuthenticated } = useAuth();
  const [tab, setTab] = useState('browse');       // browse | mine | create
  const [tournaments, setTournaments] = useState([]);
  const [myTournaments, setMyTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hoveredCard, setHoveredCard] = useState(null);

  // ── Detail view state ──
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [detailTab, setDetailTab] = useState('teams');
  const [tournamentTeams, setTournamentTeams] = useState([]);
  const [tournamentAdmins, setTournamentAdmins] = useState([]);
  const [eligibleAdmins, setEligibleAdmins] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Create form state ──
  const [form, setForm] = useState({
    name: '', description: '', campus: user?.campus || '', sports: '', status: 'draft',
    registration_opens_at: '', registration_closes_at: ''
  });
  const [creating, setCreating] = useState(false);

  const headers = useCallback(() => token ? getAuthHeaders(token, { 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' }, [token]);

  // ── Fetch ──
  const fetchPublic = useCallback(async () => {
    try {
      const res = await fetch(`${API}?campus=${encodeURIComponent(user?.campus || '')}`, token ? { headers: getAuthHeaders(token) } : {});
      const data = await res.json();
      if (data.success) setTournaments(data.tournaments || []);
    } catch { /* ignore */ }
  }, [token, user?.campus]);

  const fetchMine = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/mine`, { headers: getAuthHeaders(token) });
      const data = await res.json();
      if (data.success) setMyTournaments(data.tournaments || []);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPublic(), isAuthenticated ? fetchMine() : Promise.resolve()]).finally(() => setLoading(false));
  }, [fetchPublic, fetchMine, isAuthenticated]);

  // ── Create tournament ──
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const sportsArray = form.sports ? form.sports.split(',').map(s => s.trim()).filter(Boolean) : [];
      const res = await fetch(API, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...form, sports: sportsArray })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
      setSuccess(data.message || 'Tournament created!');
      setForm({ name: '', description: '', campus: user?.campus || '', sports: '', status: 'draft', registration_opens_at: '', registration_closes_at: '' });
      fetchPublic();
      fetchMine();
      setTab('mine');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // ── Detail view ──
  const openDetail = async (tournament) => {
    setSelectedTournament(tournament);
    setDetailTab('teams');
    setDetailLoading(true);
    try {
      const [teamsRes, adminsRes] = await Promise.all([
        fetch(`${API}/${tournament.id}/teams`, token ? { headers: getAuthHeaders(token) } : {}),
        token ? fetch(`${API}/${tournament.id}/admins`, { headers: getAuthHeaders(token) }) : null
      ]);
      const teamsData = await teamsRes.json();
      setTournamentTeams(teamsData.success ? teamsData.teams : []);
      if (adminsRes) {
        const adminsData = await adminsRes.json();
        setTournamentAdmins(adminsData.success ? adminsData.admins : []);
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const fetchEligible = async (tournamentId) => {
    try {
      const res = await fetch(`${API}/${tournamentId}/eligible-admins`, { headers: getAuthHeaders(token) });
      const data = await res.json();
      if (data.success) setEligibleAdmins(data.players || []);
    } catch { /* ignore */ }
  };

  const promoteAdmin = async (tournamentId, userId) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API}/${tournamentId}/admins`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
      setSuccess('Player promoted to admin!');
      openDetail(selectedTournament);
      fetchEligible(tournamentId);
    } catch (err) { setError(err.message); }
  };

  const removeAdmin = async (tournamentId, userId) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API}/${tournamentId}/admins/${userId}`, {
        method: 'DELETE', headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
      setSuccess('Admin removed.');
      openDetail(selectedTournament);
    } catch (err) { setError(err.message); }
  };

  const updateTeamStatus = async (tournamentId, teamId, status) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API}/${tournamentId}/teams/${teamId}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
      setSuccess(`Team status → ${status}`);
      openDetail(selectedTournament);
    } catch (err) { setError(err.message); }
  };

  const canManage = (t) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return t.my_role === 'owner' || t.my_role === 'admin';
  };

  // ──────────────────────────────────
  // Render
  // ──────────────────────────────────

  // Detail modal
  if (selectedTournament) {
    const t = selectedTournament;
    const isManager = canManage(t);
    return (
      <div style={styles.page}>
        {error && <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>}
        {success && <div style={{ ...styles.alert, ...styles.alertSuccess }}>{success}</div>}

        <button style={{ ...styles.btn, ...styles.btnSecondary, marginBottom: '1rem' }} onClick={() => { setSelectedTournament(null); setError(''); setSuccess(''); }}>
          ← Back to Tournaments
        </button>

        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
            <h1 style={{ ...styles.heading, fontSize: '1.5rem', margin: 0 }}>{t.name}</h1>
            <span style={{ ...styles.badge, background: styles.statusColors[t.status] || '#64748b', color: '#fff' }}>{t.status}</span>
            {t.verified && <span style={{ ...styles.badge, ...styles.verifiedBadge }}>✓ Verified</span>}
            {t.locked && <span style={{ ...styles.badge, background: '#ef4444', color: '#fff' }}>🔒 Locked</span>}
          </div>
          {t.description && <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>{t.description}</p>}

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div style={styles.stat}><div style={styles.statValue}>{t.team_count || 0}</div><div style={styles.statLabel}>Teams</div></div>
            <div style={styles.stat}><div style={styles.statValue}>{t.admin_count || 0}</div><div style={styles.statLabel}>Admins</div></div>
            <div style={styles.stat}><div style={{ ...styles.statValue, fontSize: '1rem' }}>🏫 {t.campus}</div><div style={styles.statLabel}>Campus</div></div>
            <div style={styles.stat}><div style={{ ...styles.statValue, fontSize: '1rem' }}>👤 {t.creator_name || 'Admin'}</div><div style={styles.statLabel}>Created By</div></div>
          </div>

          {t.sports?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              {t.sports.map((s, i) => <span key={i} style={styles.tag}>{s}</span>)}
            </div>
          )}

          {t.my_role && (
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ ...styles.badge, ...(t.my_role === 'owner' ? styles.roleOwner : styles.roleAdmin) }}>
                {t.my_role === 'owner' ? '👑 Owner' : '⚡ Admin'}
              </span>
            </div>
          )}

          {isManager && (
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' }}>
              <button style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnSm }} onClick={() => onNavigate('admin-dashboard', t.id)}>
                ⚙️ Manage Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Detail Tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {['teams', isManager && 'admins', isManager && 'promote'].filter(Boolean).map(dt => (
            <button key={dt} style={{ ...styles.btn, ...(detailTab === dt ? styles.btnPrimary : styles.btnSecondary), ...styles.btnSm }} onClick={() => { setDetailTab(dt); if (dt === 'promote') fetchEligible(t.id); }}>
              {dt === 'teams' ? '🏆 Teams' : dt === 'admins' ? '👥 Admins' : '⬆️ Promote'}
            </button>
          ))}
        </div>

        {detailLoading ? (
          <div style={styles.emptyState}>Loading…</div>
        ) : detailTab === 'teams' ? (
          <div style={styles.grid}>
            {tournamentTeams.length === 0 ? (
              <div style={styles.emptyState}>No teams entered yet.</div>
            ) : tournamentTeams.map(team => (
              <div key={team.team_id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{team.team_name}</strong>
                    <span style={{ ...styles.tag, marginLeft: 8 }}>{team.sport}</span>
                  </div>
                  <span style={{ ...styles.badge, background: team.status === 'approved' ? '#22c55e' : team.status === 'removed' ? '#ef4444' : '#f59e0b', color: '#fff' }}>
                    {team.status}
                  </span>
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                  Captain: {team.owner_name || 'Unknown'} • {team.members?.length || 0} members
                </div>
                {isManager && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {team.status !== 'approved' && <button style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnSm }} onClick={() => updateTeamStatus(t.id, team.team_id, 'approved')}>✓ Approve</button>}
                    {team.status !== 'removed' && <button style={{ ...styles.btn, ...styles.btnDanger, ...styles.btnSm }} onClick={() => updateTeamStatus(t.id, team.team_id, 'removed')}>✗ Remove</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : detailTab === 'admins' ? (
          <div style={styles.grid}>
            {tournamentAdmins.map(admin => (
              <div key={admin.user_id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{admin.name}</strong>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>{admin.email} • {admin.college_id}</div>
                  </div>
                  <span style={{ ...styles.badge, ...(admin.role === 'owner' ? styles.roleOwner : styles.roleAdmin) }}>
                    {admin.role === 'owner' ? '👑 Owner' : '⚡ Admin'}
                  </span>
                </div>
                {admin.granted_by_name && <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>Promoted by {admin.granted_by_name}</div>}
                {admin.role !== 'owner' && t.my_role === 'owner' && (
                  <button style={{ ...styles.btn, ...styles.btnDanger, ...styles.btnSm, marginTop: 8 }} onClick={() => removeAdmin(t.id, admin.user_id)}>
                    Remove Admin
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>Eligible Players (from entered teams)</h3>
            {eligibleAdmins.length === 0 ? (
              <div style={styles.emptyState}>No eligible players found. Players must be on the roster of a team entered in this tournament.</div>
            ) : (
              <div style={styles.grid}>
                {eligibleAdmins.map(player => (
                  <div key={player.user_id} style={styles.card}>
                    <strong style={{ color: 'var(--text-primary)' }}>{player.name}</strong>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>{player.email} • {player.college_id}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>Team: {player.team_name} ({player.team_role})</div>
                    <button style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnSm, marginTop: 8 }} onClick={() => promoteAdmin(t.id, player.user_id)}>
                      ⬆️ Make Admin
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>🏆 Tournaments</h1>
      <p style={styles.sub}>Browse campus tournaments, create your own, or manage ones you administer.</p>

      {error && <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>}
      {success && <div style={{ ...styles.alert, ...styles.alertSuccess }}>{success}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button style={{ ...styles.btn, ...(tab === 'browse' ? styles.btnPrimary : styles.btnSecondary) }} onClick={() => setTab('browse')}>🌐 Browse</button>
        {isAuthenticated && <button style={{ ...styles.btn, ...(tab === 'mine' ? styles.btnPrimary : styles.btnSecondary) }} onClick={() => setTab('mine')}>📋 My Tournaments</button>}
        {isAuthenticated && <button style={{ ...styles.btn, ...(tab === 'create' ? styles.btnPrimary : styles.btnSecondary) }} onClick={() => setTab('create')}>➕ Create</button>}
      </div>

      {/* Browse Tab */}
      {tab === 'browse' && (
        loading ? <div style={styles.emptyState}>Loading tournaments…</div> : tournaments.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏟️</div>
            <h3>No Tournaments Yet</h3>
            <p style={{ maxWidth: 400, margin: '0 auto' }}>Be the first to create a tournament for your campus!</p>
            {isAuthenticated && <button style={{ ...styles.btn, ...styles.btnPrimary, marginTop: '1rem' }} onClick={() => setTab('create')}>➕ Create Tournament</button>}
          </div>
        ) : (
          <div style={styles.grid}>
            {tournaments.map(t => (
              <div key={t.id} style={{ ...styles.card, ...(hoveredCard === t.id ? styles.cardHover : {}) }} onMouseEnter={() => setHoveredCard(t.id)} onMouseLeave={() => setHoveredCard(null)} onClick={() => openDetail(t)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ ...styles.badge, background: styles.statusColors[t.status] || '#64748b', color: '#fff' }}>{t.status}</span>
                  {t.verified && <span style={{ ...styles.badge, ...styles.verifiedBadge }}>✓ Verified</span>}
                </div>
                <h3 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '1.1rem' }}>{t.name}</h3>
                <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>🏫 {t.campus} • 👤 {t.creator_name || 'Admin'}</div>
                {t.sports?.length > 0 && <div>{t.sports.slice(0, 4).map((s, i) => <span key={i} style={styles.tag}>{s}</span>)}{t.sports.length > 4 && <span style={styles.tag}>+{t.sports.length - 4}</span>}</div>}
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: 12 }}>
                  <div style={styles.stat}><div style={{ ...styles.statValue, fontSize: '1.1rem' }}>{t.team_count || 0}</div><div style={styles.statLabel}>Teams</div></div>
                  <div style={styles.stat}><div style={{ ...styles.statValue, fontSize: '1.1rem' }}>{t.admin_count || 0}</div><div style={styles.statLabel}>Admins</div></div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* My Tournaments Tab */}
      {tab === 'mine' && (
        loading ? <div style={styles.emptyState}>Loading…</div> : myTournaments.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <h3>No Tournaments</h3>
            <p>You haven't created or been promoted to admin on any tournament yet.</p>
            <button style={{ ...styles.btn, ...styles.btnPrimary, marginTop: '1rem' }} onClick={() => setTab('create')}>➕ Create One</button>
          </div>
        ) : (
          <div style={styles.grid}>
            {myTournaments.map(t => (
              <div key={t.id} style={{ ...styles.card, ...(hoveredCard === `mine-${t.id}` ? styles.cardHover : {}) }} onMouseEnter={() => setHoveredCard(`mine-${t.id}`)} onMouseLeave={() => setHoveredCard(null)} onClick={() => openDetail(t)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...styles.badge, background: styles.statusColors[t.status] || '#64748b', color: '#fff' }}>{t.status}</span>
                    {t.verified && <span style={{ ...styles.badge, ...styles.verifiedBadge }}>✓</span>}
                  </div>
                  <span style={{ ...styles.badge, ...(t.my_role === 'owner' ? styles.roleOwner : styles.roleAdmin) }}>
                    {t.my_role === 'owner' ? '👑 Owner' : '⚡ Admin'}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '1.1rem' }}>{t.name}</h3>
                <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>🏫 {t.campus} • {t.team_count || 0} teams</div>
                <button style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnSm, marginTop: 12 }} onClick={(e) => { e.stopPropagation(); onNavigate('admin-dashboard', t.id); }}>
                  ⚙️ Manage
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create Tab */}
      {tab === 'create' && (
        <div style={{ ...styles.card, maxWidth: 600 }}>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', fontSize: '1.25rem' }}>Create New Tournament</h2>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={styles.label}>Tournament Name *</label>
              <input style={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Inter-College Cricket Championship 2026" required maxLength={150} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={styles.label}>Description</label>
              <textarea style={{ ...styles.input, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional — describe your tournament" maxLength={2000} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={styles.label}>Campus</label>
                <input style={styles.input} value={form.campus} onChange={e => setForm(f => ({ ...f, campus: e.target.value }))} placeholder="Main Campus" maxLength={100} />
              </div>
              <div>
                <label style={styles.label}>Status</label>
                <select style={styles.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="registration">Registration Open</option>
                  <option value="live">Live</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={styles.label}>Sports (comma-separated)</label>
              <input style={styles.input} value={form.sports} onChange={e => setForm(f => ({ ...f, sports: e.target.value }))} placeholder="e.g. Football, Cricket, Basketball" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={styles.label}>Registration Opens</label>
                <input style={styles.input} type="datetime-local" value={form.registration_opens_at} onChange={e => setForm(f => ({ ...f, registration_opens_at: e.target.value }))} />
              </div>
              <div>
                <label style={styles.label}>Registration Closes</label>
                <input style={styles.input} type="datetime-local" value={form.registration_closes_at} onChange={e => setForm(f => ({ ...f, registration_closes_at: e.target.value }))} />
              </div>
            </div>
            <button type="submit" disabled={creating} style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', opacity: creating ? .6 : 1 }}>
              {creating ? 'Creating…' : '🏆 Create Tournament'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
