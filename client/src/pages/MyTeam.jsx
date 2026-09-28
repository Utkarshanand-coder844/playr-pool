import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { formatSportProfile } from '../utils/sportRoles';
import { getAuthHeaders } from '../utils/authFetch';

export const MyTeam = ({ onNavigate }) => {
  const { user, token } = useAuth();

  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [invitePlayerId, setInvitePlayerId] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [transferringOwnership, setTransferringOwnership] = useState(false);
  const [playerDepartment, setPlayerDepartment] = useState('All');
  const [playerYear, setPlayerYear] = useState('All');
  const [tournamentLocked, setTournamentLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Admin Removal Poll
  const [pollData, setPollData] = useState(null);   // { vote_summary, has_voted, admin_id }
  const [pollLoading, setPollLoading] = useState(false);
  const [pollVoting, setPollVoting] = useState(false);
  const [pollError, setPollError] = useState('');
  const [pollSuccess, setPollSuccess] = useState('');

  // Error / Success messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State for Create / Edit
  const [teamName, setTeamName] = useState('');
  const [sport, setSport] = useState('Football');
  const [customSport, setCustomSport] = useState('');
  const [members, setMembers] = useState([
    { member_name: '', member_user_id: '', player_search: '', position: 'Team Captain' }
  ]);

  // Fetch current user's team
  const fetchTeam = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teams/mine', {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTeam(data.team);
        setTournamentLocked(Boolean(data.tournament_locked));
        if (data.team) {
          const standardSports = ['Badminton', 'Table Tennis', 'Cricket', 'Football'];
          if (standardSports.includes(data.team.sport)) {
            setSport(data.team.sport);
            setCustomSport('');
          } else {
            setSport('Other');
            setCustomSport(data.team.sport || '');
          }
          setTeamName(data.team.name);
          setMembers(
            data.team.members && data.team.members.length > 0
              ? data.team.members.map(m => ({ member_name: m.member_name, member_user_id: m.member_user_id || '', player_search: m.member_name || '', position: m.position }))
              : [{ member_name: '', member_user_id: '', player_search: '', position: 'Team Captain' }]
          );
        }
      } else {
        setError(data.message || 'Failed to load team details');
      }
    } catch (err) {
      setError('Connection error loading team: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const fetchPollStatus = useCallback(async (teamId) => {
    if (!token || !teamId) return;
    setPollLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/admin-removal-votes`, { headers: getAuthHeaders(token) });
      const data = await res.json();
      if (res.ok && data.success) setPollData(data);
    } catch { /* non-fatal */ } finally { setPollLoading(false); }
  }, [token]);

  // Load poll whenever team changes
  useEffect(() => { if (team?.id) fetchPollStatus(team.id); }, [team?.id, fetchPollStatus]);

  const castVote = async () => {
    if (!team) return;
    if (!window.confirm(`Vote to remove the admin of "${team.name}"? This action cannot be undone. A 90% threshold of all roster members is required to demote the admin.`)) return;
    setPollVoting(true); setPollError(''); setPollSuccess('');
    try {
      const res = await fetch(`/api/teams/${team.id}/admin-removal-votes`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ target_admin_id: pollData?.admin_id || team.owner_user_id })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Vote failed');
      setPollSuccess(data.message);
      if (data.vote_summary) setPollData(prev => ({ ...prev, vote_summary: data.vote_summary, has_voted: true }));
      if (data.removed) { fetchTeam(); }
    } catch (err) { setPollError(err.message); } finally { setPollVoting(false); }
  };

  useEffect(() => {
    if (!token) return;
    fetch('/api/teams/players', { headers: getAuthHeaders(token) })
      .then(res => res.json())
      .then(data => { if (data.success) setPlayers(data.players || []); })
      .catch(() => setError('Unable to load registered players.'));
  }, [token]);

  const fetchInvites = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/teams/invites/mine', { headers: getAuthHeaders(token) });
    const data = await res.json();
    if (res.ok && data.success) setInvites(data.invites || []);
  }, [token]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const sendInvite = async () => {
    if (!invitePlayerId || !team || !token) return;
    setInviteSending(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/teams/${team.id}/invites`, { method: 'POST', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ invited_user_id: invitePlayerId }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to send invitation');
      setSuccess(data.message); setInvitePlayerId('');
    } catch (err) { setError(err.message); } finally { setInviteSending(false); }
  };

  const respondToInvite = async (id, status) => {
    if (!token) return;
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/teams/invites/${id}`, { method: 'PUT', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to respond');
      setSuccess(data.message); fetchInvites(); fetchTeam();
    } catch (err) { setError(err.message); }
  };

  const transferOwnership = async () => {
    if (!team || !newOwnerId || !token || !window.confirm('Transfer team ownership? You will become a regular roster player.')) return;
    setTransferringOwnership(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/teams/${team.id}/ownership`, { method: 'PUT', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ new_owner_user_id: newOwnerId }) });
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to transfer ownership');
      setSuccess(data.message); setNewOwnerId(''); fetchTeam();
    } catch (err) { setError(err.message); } finally { setTransferringOwnership(false); }
  };

  // Add teammate row
  const handleAddMember = () => {
    setMembers([...members, { member_name: '', member_user_id: '', player_search: '', position: 'Player' }]);
  };

  // Remove teammate row
  const handleRemoveMember = (index) => {
    if (members.length <= 1) return;
    setMembers(members.filter((_, i) => i !== index));
  };

  // Update teammate field
  const handleMemberChange = (index, field, value) => {
    const updated = [...members];
    updated[index][field] = value;
    if (field === 'member_user_id') {
      const player = players.find(p => p.id === value);
      updated[index].member_name = player ? player.name : '';
      updated[index].player_search = player ? player.name : updated[index].player_search;

      // Suggest sport role if position is empty or generic
      const currentSport = sport === 'Other' ? customSport.trim() : sport;
      const prof = player?.sport_profiles?.[currentSport];
      if (prof && (!updated[index].position || updated[index].position === 'Player')) {
        const suggestedRole = prof.primary_role || prof.position || prof.event_category;
        if (suggestedRole) {
          updated[index].position = suggestedRole;
        }
      }
    }
    setMembers(updated);
  };

  const getMatchingPlayers = (member) => {
    const search = (member.player_search || '').trim().toLowerCase();
    if (!search) return players;
    return players.filter(player =>
      (player.name.toLowerCase().includes(search) || player.college_id.toLowerCase().includes(search)) &&
      (playerDepartment === 'All' || player.department === playerDepartment) &&
      (playerYear === 'All' || player.year === playerYear)
    );
  };

  // Handle Team Creation
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!teamName.trim()) {
      setError('Please provide a team name');
      return;
    }
    const selectedSport = sport === 'Other' ? customSport.trim() : sport;
    if (!selectedSport) {
      setError('Please enter the sport name');
      return;
    }

    const filteredMembers = members.filter(m => m.member_name && m.member_name.trim());
    if (filteredMembers.length === 0) {
      setError('Please add at least one squad member');
      return;
    }

    if (!token) {
      setError('You must be signed in to create a team');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: teamName.trim(),
          sport: selectedSport,
          members: filteredMembers
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create team');
      }

      setSuccess('🎉 Team registered successfully for the tournament!');
      setTeam(data.team);
      setIsEditing(false);
      fetchTeam();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Team Update (Edit)
  const handleUpdateTeam = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const finalSport = sport === 'Other' ? customSport.trim() : sport;
    if (!finalSport) {
      setError('Please select or specify a sport');
      return;
    }

    if (!teamName.trim()) {
      setError('Team name cannot be empty');
      return;
    }

    const filteredMembers = members.filter(m => m.member_name && m.member_name.trim());
    if (filteredMembers.length === 0) {
      setError('Team must have at least one member');
      return;
    }

    if (!token) {
      setError('You must be signed in to update a team');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: teamName.trim(),
          sport: finalSport,
          members: filteredMembers
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update team');
      }

      setSuccess('✅ Team details, sport, and roster updated successfully!');
      setTeam(data.team);
      setIsEditing(false);
      fetchTeam();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Team Deletion (Disband)
  const handleDeleteTeam = async () => {
    if (!team || !token) return;
    const confirmDisband = window.confirm(
      `Are you sure you want to disband "${team.name}" (${team.sport})?\n\nThis will remove the squad, its roster, and all pending invites. This action cannot be undone.`
    );
    if (!confirmDisband) return;

    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to disband team');
      }

      setSuccess(`✅ Squad "${team.name}" has been successfully disbanded.`);
      setTeam(null);
      setIsEditing(false);
      setTeamName('');
      setSport('Football');
      setCustomSport('');
      setMembers([
        { member_name: user?.name || '', member_user_id: user?.id || '', player_search: '', position: 'Team Captain' }
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Admin lock toggle for testing and control
  const handleToggleAdminLock = async () => {
    if (!token) return;
    setError('');
    setSuccess('');
    const endpoint = tournamentLocked ? '/api/admin/unlock-teams' : '/api/admin/lock-teams';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTournamentLocked(Boolean(data.tournament_started));
        setSuccess(data.message);
        fetchTeam();
      } else {
        setError(data.message || 'Admin action failed');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const isLocked = Boolean(tournamentLocked || (team && team.locked));

  if (loading) {
    return (
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--accent-cyan)' }}>Loading squad roster...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ maxWidth: '960px' }}>
      {/* Admin Quick Tournament Control Bar */}
      {user && user.role === 'admin' && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <span style={{ fontWeight: 700, color: '#fb7185', textTransform: 'uppercase', fontSize: '0.85rem' }}>
              🛡️ Admin Tournament Control:
            </span>{' '}
            <span style={{ fontSize: '0.9rem', color: '#fff' }}>
              Tournament Status is currently{' '}
              <strong style={{ color: tournamentLocked ? '#fb7185' : 'var(--accent-emerald)' }}>
                {tournamentLocked ? 'LOCKED (In Progress)' : 'OPEN FOR REGISTRATION'}
              </strong>
            </span>
          </div>
          <button
            className={`btn btn-sm ${tournamentLocked ? 'btn-secondary' : 'btn-danger'}`}
            onClick={handleToggleAdminLock}
          >
            {tournamentLocked ? '🔓 Unlock Teams (Open Registration)' : '🔒 Lock Teams (Start Tournament)'}
          </button>
        </div>
      )}

      {/* Global Notifications */}
      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      <div className="directory-filters" aria-label="Registered player filters">
        <span>Find roster players</span>
        <select className="form-select no-icon" value={playerDepartment} onChange={(e) => setPlayerDepartment(e.target.value)}><option>All</option>{[...new Set(players.map((player) => player.department).filter(Boolean))].sort().map((department) => <option key={department}>{department}</option>)}</select>
        <select className="form-select no-icon" value={playerYear} onChange={(e) => setPlayerYear(e.target.value)}><option>All</option>{[...new Set(players.map((player) => player.year).filter(Boolean))].sort().map((year) => <option key={year}>{year}</option>)}</select>
      </div>

      {invites.filter(invite => invite.status === 'pending').length > 0 && (
        <div className="auth-card" style={{ maxWidth: '100%' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>📨 Team invitations</h3>
          {invites.filter(invite => invite.status === 'pending').map(invite => (
            <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.75rem 0', borderTop: '1px solid var(--border-subtle)' }}>
              <span><strong>{invite.team_name}</strong> ({invite.sport}) invited by {invite.invited_by_name}</span>
              <span style={{ display: 'flex', gap: '0.5rem' }}><button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => respondToInvite(invite.id, 'accepted')}>Accept</button><button className="btn btn-danger btn-sm" onClick={() => respondToInvite(invite.id, 'declined')}>Decline</button></span>
            </div>
          ))}
        </div>
      )}

      {/* CASE 1: USER HAS NO TEAM */}
      {!team && (
        <div className="auth-card" style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div className="auth-header">
            <h1>Create Your Tournament Squad</h1>
            <p>Assemble your team roster to compete in the upcoming college sports matches</p>
          </div>

          {tournamentLocked ? (
            <div className="alert alert-error" style={{ fontSize: '1rem', padding: '1.25rem' }}>
              <span className="alert-icon">🔒</span>
              <div>
                <strong>Team locked — tournament in progress</strong>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>
                  Registration is currently closed because the tournament fixtures have started.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateTeam}>
              <div className="form-group full-width">
                <label className="form-label" htmlFor="sport">Sport *</label>
                <select id="sport" className="form-select no-icon" value={sport} onChange={(e) => setSport(e.target.value)}>
                  <option>Badminton</option><option>Table Tennis</option><option>Cricket</option><option>Football</option><option>Other</option>
                </select>
                {sport === 'Other' && <input className="form-input no-icon" style={{ marginTop: '0.5rem' }} placeholder="Enter sport name" value={customSport} onChange={(e) => setCustomSport(e.target.value)} required />}
              </div>
              <div className="form-group full-width">
                <label className="form-label" htmlFor="team_name">Team Name *</label>
                <div className="input-wrapper">
                  <span className="input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34" />
                      <rect x="6" y="2" width="12" height="12" rx="2" />
                    </svg>
                  </span>
                  <input
                    id="team_name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Phoenix Strikers, Titan Wolves"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Dynamic Roster Members */}
              <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Squad Roster ({members.length} Players)
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddMember}
                  >
                    + Add Teammate
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {members.map((member, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr auto',
                        gap: '0.75rem',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.03)',
                        padding: '0.6rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <input className="form-input no-icon" placeholder="Search player name or College ID" value={member.player_search || ''} onChange={(e) => handleMemberChange(index, 'player_search', e.target.value)} />
                        <select className="form-select no-icon" value={member.member_user_id || ''} onChange={(e) => handleMemberChange(index, 'member_user_id', e.target.value)} required>
                          <option value="" disabled>Choose a registered player</option>
                          {getMatchingPlayers(member).map(player => {
                            const currentSport = sport === 'Other' ? customSport.trim() : sport;
                            const prof = player.sport_profiles?.[currentSport];
                            const roleText = prof ? formatSportProfile(currentSport, prof).join(' • ') : '';
                            return (
                              <option key={player.id} value={player.id}>
                                {player.name} — {player.college_id}{roleText ? ` (${roleText})` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {(() => {
                          const currentSport = sport === 'Other' ? customSport.trim() : sport;
                          const selPlayer = players.find(p => p.id === member.member_user_id);
                          const prof = selPlayer?.sport_profiles?.[currentSport];
                          const tags = prof ? formatSportProfile(currentSport, prof) : [];
                          if (tags.length === 0) return null;
                          return (
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                              {tags.map((t, idx) => (
                                <span key={idx} style={{
                                  fontSize: '0.72rem',
                                  background: 'rgba(0, 242, 254, 0.12)',
                                  color: 'var(--accent-cyan)',
                                  border: '1px solid rgba(0, 242, 254, 0.25)',
                                  padding: '0.1rem 0.45rem',
                                  borderRadius: '10px',
                                  fontWeight: 600
                                }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <input
                        type="text"
                        className="form-input no-icon"
                        placeholder="Position / Role (e.g. Captain, Striker)"
                        value={member.position}
                        onChange={(e) => handleMemberChange(index, 'position', e.target.value)}
                      />
                      {members.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoveMember(index)}
                          title="Remove player"
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{ marginTop: '1.25rem' }}
              >
                {submitting ? 'Registering Squad...' : 'Complete Team Registration'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* CASE 2: USER HAS A TEAM */}
      {team && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Team Hero Card */}
          <div className="id-card-hero">
            <div className="id-card-header">
              <div className="id-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>OFFICIAL TOURNAMENT SQUAD</span>
              </div>

              <span className={`role-pill ${isLocked ? 'admin' : 'player'}`}>
                {isLocked ? '🔒 SQUAD LOCKED' : '🟢 ACTIVE ROSTER'}
              </span>
            </div>

            <div className="profile-avatar-wrap">
              <div className="profile-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                {team.sport === 'Cricket' ? '🏏' : team.sport === 'Badminton' ? '🏸' : team.sport === 'Table Tennis' ? '🏓' : '⚽'}
              </div>
              <div className="profile-info">
                <h2>{team.name}</h2>
                <div className="profile-sub">
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{team.sport || 'Football'}</span>
                  <span>•</span>
                  <span>Owner: <strong>{user.name}</strong> ({user.college_id})</span>
                  <span>•</span>
                  <span>{team.members ? team.members.length : 0} Roster Athletes</span>
                </div>
              </div>
            </div>

            {/* Lock Status Alert */}
            {isLocked ? (
              <div 
                className="alert alert-error" 
                style={{ marginTop: '1.5rem', marginBottom: 0, padding: '1rem 1.25rem' }}
              >
                <span className="alert-icon" style={{ fontSize: '1.25rem' }}>🔒</span>
                <div>
                  <strong style={{ fontSize: '1.05rem', display: 'block' }}>
                    Team locked — tournament in progress
                  </strong>
                  <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                    Roster edits and name changes are disabled while tournament matches are underway.
                  </span>
                </div>
              </div>
            ) : team.owner_user_id === (user?.id || user?.userId) ? (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!isEditing ? (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsEditing(true)}
                    >
                      ✏️ Edit Team (Name, Sport, Roster)
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleDeleteTeam}
                      disabled={deleting}
                    >
                      {deleting ? 'Disbanding...' : '🗑️ Disband Team'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setIsEditing(false);
                        setTeamName(team.name);
                        const standardSports = ['Badminton', 'Table Tennis', 'Cricket', 'Football'];
                        if (standardSports.includes(team.sport)) {
                          setSport(team.sport);
                          setCustomSport('');
                        } else {
                          setSport('Other');
                          setCustomSport(team.sport || '');
                        }
                      }}
                    >
                      Cancel Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleDeleteTeam}
                      disabled={deleting}
                    >
                      {deleting ? 'Disbanding...' : '🗑️ Disband Team'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p style={{ marginTop: '1.5rem', marginBottom: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                You are a member of this squad. Only the team owner can edit its roster.
              </p>
            )}

            {!isLocked && team.owner_user_id === (user?.id || user?.userId) && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                <label className="form-label" style={{ marginBottom: '0.4rem' }}>Invite a registered player</label>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <select className="form-select no-icon" style={{ flex: 1, minWidth: '220px' }} value={invitePlayerId} onChange={(e) => setInvitePlayerId(e.target.value)}><option value="">Choose player to invite</option>{players.filter(player => player.id !== (user?.id || user?.userId) && !team.members?.some(member => member.member_user_id === player.id)).map(player => <option key={player.id} value={player.id}>{player.name} — {player.college_id}</option>)}</select>
                  <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} disabled={!invitePlayerId || inviteSending} onClick={sendInvite}>{inviteSending ? 'Sending...' : 'Send invite'}</button>
                </div>
                <label className="form-label" style={{ marginTop: '1rem', marginBottom: '0.4rem' }}>Transfer team ownership</label>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <select className="form-select no-icon" style={{ flex: 1, minWidth: '220px' }} value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}><option value="">Choose a current roster member</option>{team.members?.filter(member => member.member_user_id && member.member_user_id !== (user?.id || user?.userId)).map(member => <option key={member.member_user_id} value={member.member_user_id}>{member.member_name}</option>)}</select>
                  <button type="button" className="btn btn-danger btn-sm" style={{ width: 'auto' }} onClick={transferOwnership} disabled={!newOwnerId || transferringOwnership}>{transferringOwnership ? 'Transferring...' : 'Transfer ownership'}</button>
                </div>
              </div>
            )}
          </div>

          {/* EDIT FORM VIEW */}
          {isEditing && !isLocked && (
            <div className="auth-card" style={{ maxWidth: '100%' }}>
              <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.4rem' }}>Edit Team Name, Sport & Roster</h2>
                <p>Modify squad title, sport category, or adjust team members before the tournament locks</p>
              </div>

              <form onSubmit={handleUpdateTeam}>
                <div className="form-group full-width">
                  <label className="form-label" htmlFor="edit_sport">Sport *</label>
                  <select
                    id="edit_sport"
                    className="form-select no-icon"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                  >
                    <option>Badminton</option>
                    <option>Table Tennis</option>
                    <option>Cricket</option>
                    <option>Football</option>
                    <option>Other</option>
                  </select>
                  {sport === 'Other' && (
                    <input
                      className="form-input no-icon"
                      style={{ marginTop: '0.5rem' }}
                      placeholder="Enter sport name"
                      value={customSport}
                      onChange={(e) => setCustomSport(e.target.value)}
                      required
                    />
                  )}
                </div>

                <div className="form-group full-width">
                  <label className="form-label" htmlFor="edit_team_name">Team Name *</label>
                  <input
                    id="edit_team_name"
                    type="text"
                    className="form-input no-icon"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>Roster Members</label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleAddMember}
                    >
                      + Add Player
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {members.map((member, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr auto',
                          gap: '0.75rem',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.03)',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)'
                        }}
                      >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <input className="form-input no-icon" placeholder="Search player name or College ID" value={member.player_search || ''} onChange={(e) => handleMemberChange(index, 'player_search', e.target.value)} />
                        <select className="form-select no-icon" value={member.member_user_id || ''} onChange={(e) => handleMemberChange(index, 'member_user_id', e.target.value)} required>
                          <option value="" disabled>Choose a registered player</option>
                          {getMatchingPlayers(member).map(player => {
                            const currentSport = isEditing ? (sport === 'Other' ? customSport : sport) : (team?.sport || sport);
                            const prof = player.sport_profiles?.[currentSport];
                            const roleText = prof ? formatSportProfile(currentSport, prof).join(' • ') : '';
                            return (
                              <option key={player.id} value={player.id}>
                                {player.name} — {player.college_id}{roleText ? ` (${roleText})` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {(() => {
                          const currentSport = isEditing ? (sport === 'Other' ? customSport : sport) : (team?.sport || sport);
                          const selPlayer = players.find(p => p.id === member.member_user_id);
                          const prof = selPlayer?.sport_profiles?.[currentSport];
                          const tags = prof ? formatSportProfile(currentSport, prof) : [];
                          if (tags.length === 0) return null;
                          return (
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                              {tags.map((t, idx) => (
                                <span key={idx} style={{
                                  fontSize: '0.72rem',
                                  background: 'rgba(0, 242, 254, 0.12)',
                                  color: 'var(--accent-cyan)',
                                  border: '1px solid rgba(0, 242, 254, 0.25)',
                                  padding: '0.1rem 0.45rem',
                                  borderRadius: '10px',
                                  fontWeight: 600
                                }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                        <input
                          type="text"
                          className="form-input no-icon"
                          placeholder="Position / Role"
                          value={member.position}
                          onChange={(e) => handleMemberChange(index, 'position', e.target.value)}
                        />
                        {members.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemoveMember(index)}
                            title="Remove player"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                    style={{ flex: 1 }}
                  >
                    {submitting ? 'Saving...' : 'Save Team Changes (Name, Sport, Roster)'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* READ-ONLY SQUAD ROSTER CARDS */}
          <div>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
              OFFICIAL SQUAD ROSTER ({team.members ? team.members.length : 0} REGISTERED)
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1rem'
            }}>
              {team.members && team.members.length > 0 ? (
                team.members.map((member, i) => (
                  <div
                    key={member.id || i}
                    onClick={() => member.member_user_id && onNavigate && onNavigate('player-profile', member.member_user_id)}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      transition: 'all 0.2s ease',
                      cursor: member.member_user_id ? 'pointer' : 'default'
                    }}
                  >
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: i === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1rem',
                      color: '#fff'
                    }}>
                      {i === 0 ? '👑' : `#${i + 1}`}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>
                        {member.member_name}
                      </div>
                      <div style={{
                        display: 'inline-block',
                        fontSize: '0.75rem',
                        color: 'var(--accent-cyan)',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        letterSpacing: '0.04em'
                      }}>
                        {member.position || 'Player'}
                      </div>
                      {(() => {
                        const p = players.find(x => x.id === member.member_user_id);
                        const prof = p?.sport_profiles?.[team.sport];
                        const tags = prof ? formatSportProfile(team.sport, prof) : [];
                        if (tags.length === 0) return null;
                        return (
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                            {tags.map((t, tidx) => (
                              <span key={tidx} style={{
                                fontSize: '0.68rem',
                                background: 'rgba(0, 242, 254, 0.1)',
                                color: 'var(--accent-cyan)',
                                border: '1px solid rgba(0, 242, 254, 0.2)',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '8px'
                              }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {member.member_user_id && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>View player profile →</div>}
                      </div>

                    {isLocked && (
                      <span title="Locked" style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                        🔒
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No members registered in this squad.</p>
              )}
            </div>
          </div>

          {/* ADMIN REMOVAL POLL — visible to all team members */}
          {pollData && pollData.vote_summary && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.07), rgba(20, 14, 30, 0.6))',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              marginTop: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fb7185', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🗳️ Admin Removal Poll
                  </h3>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    If 90% of roster members vote, the team admin will be demoted to a player account.
                  </p>
                </div>
                {pollLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</span>}
              </div>

              {/* Progress Bar */}
              {(() => {
                const { votes = 0, threshold = 0, eligible_voters = 0 } = pollData.vote_summary;
                const pct = threshold > 0 ? Math.min(100, Math.round((votes / threshold) * 100)) : 0;
                return (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                      <span><strong style={{ color: '#fb7185', fontSize: '1rem' }}>{votes}</strong> of <strong>{threshold}</strong> votes needed</span>
                      <span>{eligible_voters} eligible voter{eligible_voters !== 1 ? 's' : ''} · {pct}% reached</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: pct >= 100 ? 'var(--accent-emerald)' : 'linear-gradient(90deg, #fb7185, #f43f5e)',
                        borderRadius: '999px',
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                    {eligible_voters < 3 && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        ⚠️ At least 3 non-admin roster members are required to activate this poll.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Feedback */}
              {pollError && <div className="alert alert-error" style={{ padding: '0.6rem 1rem', marginBottom: '0.75rem', fontSize: '0.84rem' }}>{pollError}</div>}
              {pollSuccess && <div className="alert alert-success" style={{ padding: '0.6rem 1rem', marginBottom: '0.75rem', fontSize: '0.84rem' }}>{pollSuccess}</div>}

              {/* Vote Button (only non-owners can vote) */}
              {user && user.id !== team.owner_user_id && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {pollData.has_voted ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.35)',
                      color: '#fb7185', padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.84rem', fontWeight: 600
                    }}>✅ Your vote has been recorded</span>
                  ) : (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={castVote}
                      disabled={pollVoting || pollData.vote_summary?.eligible_voters < 3}
                      style={{ background: 'linear-gradient(135deg, #f43f5e, #be123c)', borderColor: 'transparent' }}
                    >
                      {pollVoting ? 'Casting vote…' : '🗳️ Vote to Remove Admin'}
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => fetchPollStatus(team.id)} disabled={pollLoading}>
                    🔄 Refresh
                  </button>
                </div>
              )}

              {/* Owner view — can see votes but cannot vote */}
              {user && (user.id || user.userId) === team.owner_user_id && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>You are the admin — you cannot vote in this poll.</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => fetchPollStatus(team.id)} disabled={pollLoading}>🔄 Refresh</button>
                </div>
              )}
            </div>
          )}

          {/* DANGER ZONE: DISBAND TEAM */}
          {!isLocked && team.owner_user_id === (user?.id || user?.userId) && (
            <div className="auth-card" style={{ maxWidth: '100%', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#ef4444', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    ⚠️ Disband Team
                  </h3>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                    Permanently delete this team, remove all athletes from the roster, and cancel all pending invitations.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleDeleteTeam}
                  disabled={deleting}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {deleting ? 'Disbanding...' : '🗑️ Disband Team'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
