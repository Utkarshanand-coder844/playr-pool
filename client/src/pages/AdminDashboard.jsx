import React, { useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { SPORT_LIST, SPORT_ROLES, formatSportProfile } from '../utils/sportRoles';
import { getAuthHeaders } from '../utils/authFetch';

export const AdminDashboard = ({ onNavigate }) => {
  const { user, token } = useAuth();

  // Note: role guard is enforced by AdminRoute in App.jsx before this renders.
  // No useEffect redirect needed — AdminRoute blocks non-admins synchronously.

  // State data
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [bracketFixtures, setBracketFixtures] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [sportsAdmins, setSportsAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  // Athlete Directory & Role Filter
  const [playerSportFilter, setPlayerSportFilter] = useState('All');
  const [playerRoleFilter, setPlayerRoleFilter] = useState('All');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // Match creation form
  const [newMatchName, setNewMatchName] = useState('');
  const [newMatchDate, setNewMatchDate] = useState(new Date().toISOString().slice(0, 16));
  const [newMatchStatus, setNewMatchStatus] = useState('upcoming');
  const [newMatchSport, setNewMatchSport] = useState('Football');
  const [customMatchSport, setCustomMatchSport] = useState('');
  const [newMatchTeamA, setNewMatchTeamA] = useState('');
  const [newMatchTeamB, setNewMatchTeamB] = useState('');
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [deadlineSport, setDeadlineSport] = useState('Football');
  const [deadlineOpensAt, setDeadlineOpensAt] = useState('');
  const [deadlineClosesAt, setDeadlineClosesAt] = useState('');
  const [bracketSport, setBracketSport] = useState('Football');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementCategory, setAnnouncementCategory] = useState('tournament');
  const [announcementDate, setAnnouncementDate] = useState('');
  const [announcementPinned, setAnnouncementPinned] = useState(false);
  const [announcementCampus, setAnnouncementCampus] = useState('all');
  const [attachmentLabel, setAttachmentLabel] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentType, setAttachmentType] = useState('poster');
  const [announcementAttachments, setAnnouncementAttachments] = useState([]);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [adminSport, setAdminSport] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);

  const handleDevicePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    setPhotoUploading(true);
    setErrorMessage('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDimension = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 900000 && quality > 0.4) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        const labelName = file.name.replace(/\.[^/.]+$/, '').slice(0, 40) || 'Event Photo';
        setAnnouncementAttachments(prev => [
          ...prev,
          {
            label: labelName,
            url: dataUrl,
            type: 'poster'
          }
        ]);
        setPhotoUploading(false);
        showToast('Photo uploaded from device and attached!');
      };
      img.onerror = () => {
        setErrorMessage('Failed to process device image.');
        setPhotoUploading(false);
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file from device.');
      setPhotoUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Score update form (legacy simple upsert — kept for backwards compat)
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [scorePoints, setScorePoints] = useState(0);
  const [submittingScore, setSubmittingScore] = useState(false);

  // ── Live Scoring Engine state (sport-aware) ──
  const [lsMatchId, setLsMatchId] = useState('');
  const [lsLiveState, setLsLiveState] = useState(null);
  const [lsLoading, setLsLoading] = useState(false);
  const [lsUndoing, setLsUndoing] = useState(false);
  // Cricket sub-states
  const [lsStrikerName, setLsStrikerName] = useState('');
  const [lsNonStrikerName, setLsNonStrikerName] = useState('');
  const [lsBowlerName, setLsBowlerName] = useState('');
  const [lsWide, setLsWide] = useState(0);
  const [lsNb, setLsNb] = useState(0);
  const [lsWicketType, setLsWicketType] = useState('');
  const [lsNextBatsman, setLsNextBatsman] = useState('');
  const [lsShowLineup, setLsShowLineup] = useState(false);
  const [lsShowInnings2, setLsShowInnings2] = useState(false);
  const [lsInn2Striker, setLsInn2Striker] = useState('');
  const [lsInn2NonStriker, setLsInn2NonStriker] = useState('');
  const [lsInn2Bowler, setLsInn2Bowler] = useState('');
  // Football sub-states
  const [lsGoalScorer, setLsGoalScorer] = useState('');
  const [lsGoalMinute, setLsGoalMinute] = useState('');
  const [lsGoalAssist, setLsGoalAssist] = useState('');

  // Derived: currently selected match object
  const lsMatch = matches.find(m => String(m.id) === String(lsMatchId)) || null;
  const lsSport = (lsMatch?.sport || '').toLowerCase();
  const lsIsCricket = lsSport.includes('cricket');
  const lsIsFootball = lsSport.includes('football') || lsSport.includes('futsal') || lsSport.includes('soccer');
  const lsIsBasketball = lsSport.includes('basketball');
  const lsIsRacket = lsSport.includes('badminton') || lsSport.includes('volleyball') || lsSport.includes('table tennis') || lsSport.includes('tennis');
  const lsIsKabaddi = lsSport.includes('kabaddi');

  const lsMatchIdRef = useRef(lsMatchId);
  useEffect(() => {
    lsMatchIdRef.current = lsMatchId;
  }, [lsMatchId]);

  // Load live state for selected match
  const lsLoadState = async (mid) => {
    if (!mid) return;
    setLsLoading(true);
    setLsLiveState(null);
    try {
      const res = await fetch(`/api/live-scoring/${mid}`);
      const data = await res.json();
      if (data.success) setLsLiveState(data.liveState);
    } catch { /* ignore */ }
    setLsLoading(false);
  };

  // Real-time socket updates for Admin Desk
  useEffect(() => {
    const socket = io(window.location.origin);
    socket.on('match:live_update', (payload) => {
      if (String(payload?.matchId) === String(lsMatchIdRef.current)) {
        setLsLiveState(payload.liveState);
      }
      setMatches(prev => prev.map(m => {
        if (String(m.id) !== String(payload?.matchId)) return m;
        return {
          ...m,
          liveState: payload.liveState,
          status: payload.status || m.status,
          team_a_score: payload.scoreA,
          team_b_score: payload.scoreB
        };
      }));
    });
    return () => socket.disconnect();
  }, []);

  // Send a scoring event
  const lsSendEvent = async (eventType, payload = {}) => {
    if (!lsMatchId) {
      showToast('⚠️ Please select a match to score', true);
      return;
    }
    if (!token) {
      showToast('⚠️ Admin session expired or missing. Please log in again.', true);
      return;
    }
    try {
      const res = await fetch(`/api/live-scoring/${lsMatchId}/event`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ eventType, payload })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLsLiveState(data.liveState);
        setMatches(prev => prev.map(m => {
          if (String(m.id) !== String(lsMatchId)) return m;
          return {
            ...m,
            status: data.status || m.status,
            team_a_score: data.scoreA,
            team_b_score: data.scoreB,
            liveState: data.liveState
          };
        }));
        showToast(`✅ ${eventType} recorded!`);
      } else {
        showToast(`❌ ${data.message || 'Event failed'}`, true);
      }
    } catch (err) {
      showToast(`❌ Connection error: ${err.message}`, true);
    }
  };

  // Undo last event
  const lsUndo = async () => {
    if (!lsMatchId) {
      showToast('⚠️ Please select a match fixture', true);
      return;
    }
    if (!token) {
      showToast('⚠️ Admin session expired. Please log in again.', true);
      return;
    }
    setLsUndoing(true);
    try {
      const res = await fetch(`/api/live-scoring/${lsMatchId}/undo`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLsLiveState(data.liveState);
        setMatches(prev => prev.map(m => {
          if (String(m.id) !== String(lsMatchId)) return m;
          return {
            ...m,
            team_a_score: data.scoreA,
            team_b_score: data.scoreB,
            liveState: data.liveState
          };
        }));
        showToast('↩ Undo successful');
      } else {
        showToast(`❌ ${data.message || 'Nothing to undo'}`, true);
      }
    } catch (err) {
      showToast(`❌ Connection error: ${err.message}`, true);
    } finally {
      setLsUndoing(false);
    }
  };

  // Toast / Notification
  const [toastMessage, setToastMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Trigger temporary toast (supports string or object { text, isError })
  const showToast = (msg, isError = false) => {
    setToastMessage({ text: typeof msg === 'string' ? msg : msg?.text, isError });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Fetch all admin data
  const fetchData = useCallback(async () => {
    if (!token || !user || user.role !== 'admin') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const headers = getAuthHeaders(token);

      const [matchesRes, teamsRes, playersRes, scoresRes, deadlinesRes, auditRes, announcementsRes, sportsAdminsRes] = await Promise.all([
        fetch('/api/admin/matches', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/admin/teams', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/admin/players', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/admin/scores', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/admin/registration-deadlines', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/admin/audit-log?limit=20', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/announcements', { headers }).catch(e => ({ ok: false, error: e })),
        fetch('/api/sports-admins', { headers }).catch(e => ({ ok: false, error: e }))
      ]);

      const parseJson = async (res) => {
        try {
          if (!res || !res.ok) return { success: false };
          return await res.json();
        } catch {
          return { success: false };
        }
      };

      const [matchesData, teamsData, playersData, scoresData, deadlinesData, auditData, announcementsData, sportsAdminsData] = await Promise.all([
        parseJson(matchesRes),
        parseJson(teamsRes),
        parseJson(playersRes),
        parseJson(scoresRes),
        parseJson(deadlinesRes),
        parseJson(auditRes),
        parseJson(announcementsRes),
        parseJson(sportsAdminsRes)
      ]);

      if (matchesData.success && Array.isArray(matchesData.matches)) {
        setMatches(matchesData.matches);
        if (matchesData.matches.length > 0 && !selectedMatchId) {
          setSelectedMatchId(matchesData.matches[0].id);
        }
      }

      if (teamsData.success && Array.isArray(teamsData.teams)) {
        setTeams(teamsData.teams);
        if (teamsData.teams.length > 0 && !selectedTeamId) {
          setSelectedTeamId(teamsData.teams[0].id);
        }
      }
      if (playersData.success && Array.isArray(playersData.players)) {
        setPlayers(playersData.players);
      }

      if (scoresData.success && Array.isArray(scoresData.scores)) {
        setScores(scoresData.scores);
      }
      if (deadlinesData.success && Array.isArray(deadlinesData.deadlines)) {
        setDeadlines(deadlinesData.deadlines);
      }
      if (auditData.success && Array.isArray(auditData.entries)) {
        setAuditEntries(auditData.entries);
      }
      if (announcementsData.success && Array.isArray(announcementsData.announcements)) {
        setAnnouncements(announcementsData.announcements);
      }
      if (sportsAdminsData.success && Array.isArray(sportsAdminsData.admins)) {
        setSportsAdmins(sportsAdminsData.admins);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
      setErrorMessage('Failed to load admin data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Match Creation
  const handleCreateMatch = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!newMatchName.trim()) {
      setErrorMessage('Match title is required');
      return;
    }
    const sport = newMatchSport === 'Other' ? customMatchSport.trim() : newMatchSport;
    if (!sport) { setErrorMessage('Enter a sport for the fixture'); return; }
    if (!newMatchTeamA || !newMatchTeamB || newMatchTeamA === newMatchTeamB) { setErrorMessage('Choose two different teams for this fixture'); return; }

    setCreatingMatch(true);
    try {
      const res = await fetch('/api/admin/matches', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: newMatchName.trim(),
          sport,
          team_a_id: newMatchTeamA,
          team_b_id: newMatchTeamB,
          match_date: newMatchDate,
          status: newMatchStatus
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create match');
      }

      showToast(`🏆 Match "${data.match.name}" created successfully!`);
      setNewMatchName('');
      setNewMatchTeamA('');
      setNewMatchTeamB('');
      fetchData();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setCreatingMatch(false);
    }
  };

  // Handle Status Update
  const handleStatusChange = async (matchId, status) => {
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update status');
      }

      showToast(`Status updated to "${status.toUpperCase()}"`);
      fetchData();
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  // Handle Score Submit (UPSERT)
  const handleSaveScore = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedMatchId) {
      setErrorMessage('Please select a match');
      return;
    }
    if (!selectedTeamId) {
      setErrorMessage('Please select a team');
      return;
    }

    setSubmittingScore(true);
    try {
      const res = await fetch('/api/admin/scores', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          match_id: selectedMatchId,
          team_id: selectedTeamId,
          points: parseInt(scorePoints, 10)
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update score');
      }

      showToast(`✅ Score saved: ${scorePoints} points recorded!`);
      fetchData();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingScore(false);
    }
  };

  // Populate score edit from table click
  const handleQuickEdit = (scoreItem) => {
    setSelectedMatchId(scoreItem.match_id);
    setSelectedTeamId(scoreItem.team_id);
    setScorePoints(scoreItem.points);
    window.scrollTo({ top: 400, behavior: 'smooth' });
    showToast(`Loaded score for ${scoreItem.team_name} into editor`);
  };

  const handleSaveDeadline = async (e) => {
    e.preventDefault(); setErrorMessage('');
    try {
      const res = await fetch('/api/admin/registration-deadlines', { method: 'PUT', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ sport: deadlineSport, opens_at: deadlineOpensAt || null, closes_at: deadlineClosesAt || null }) });
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to save deadline');
      showToast(`Registration window saved for ${data.deadline.sport}`); fetchData();
    } catch (err) { setErrorMessage(err.message); }
  };

  const loadBracket = async (sport = bracketSport) => {
    try { const res = await fetch(`/api/admin/brackets?sport=${encodeURIComponent(sport)}`, { headers: getAuthHeaders(token) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message); setBracketFixtures(data.fixtures || []); } catch (err) { setErrorMessage(err.message); }
  };

  const handleGenerateBracket = async () => {
    setErrorMessage('');
    try { const res = await fetch('/api/admin/brackets/generate', { method: 'POST', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ sport: bracketSport }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to generate bracket'); showToast(data.message); loadBracket(); fetchData(); } catch (err) { setErrorMessage(err.message); }
  };

  const handlePostAnnouncement = async (event) => {
    event.preventDefault(); setErrorMessage('');
    if (!announcementTitle.trim() || !announcementMessage.trim()) { setErrorMessage('An event title and message are required.'); return; }
    setPostingAnnouncement(true);
    try {
      let finalAttachments = [...announcementAttachments];
      if (attachmentUrl && attachmentUrl.trim()) {
        let url = attachmentUrl.trim();
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        const label = attachmentLabel.trim() || 'Event Link';
        if (!finalAttachments.some(a => a.url === url)) {
          finalAttachments.push({ label, url, type: attachmentType || 'other' });
        }
      }
      const response = await fetch(editingAnnouncementId ? `/api/admin/announcements/${editingAnnouncementId}` : '/api/admin/announcements', { method: editingAnnouncementId ? 'PUT' : 'POST', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ title: announcementTitle, message: announcementMessage, category: announcementCategory, event_at: announcementDate || null, is_pinned: announcementPinned, campus: announcementCampus, attachments: finalAttachments }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to post announcement');
      showToast(editingAnnouncementId ? 'Announcement updated.' : 'Announcement posted to the public Events feed.');
      setAnnouncementTitle(''); setAnnouncementMessage(''); setAnnouncementDate(''); setAnnouncementPinned(false); setAnnouncementCampus('all'); setAnnouncementAttachments([]); setAttachmentLabel(''); setAttachmentUrl(''); setEditingAnnouncementId(null); fetchData();
    } catch (err) { setErrorMessage(err.message); }
    finally { setPostingAnnouncement(false); }
  };

  const startEditingAnnouncement = (item) => {
    setEditingAnnouncementId(item.id);
    setAnnouncementTitle(item.title);
    setAnnouncementMessage(item.message);
    setAnnouncementCategory(item.category);
    setAnnouncementDate(item.event_at ? new Date(item.event_at).toISOString().slice(0, 16) : '');
    setAnnouncementPinned(Boolean(item.is_pinned));
    setAnnouncementCampus(item.campus || 'all');
    setAnnouncementAttachments(item.attachments || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditingAnnouncement = () => {
    setEditingAnnouncementId(null); setAnnouncementTitle(''); setAnnouncementMessage(''); setAnnouncementDate(''); setAnnouncementPinned(false); setAnnouncementCampus('all'); setAnnouncementAttachments([]);
  };

  const handleDeleteAnnouncement = async (id) => {
    try {
      const response = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE', headers: getAuthHeaders(token) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || 'Unable to remove announcement');
      showToast('Announcement removed.'); fetchData();
    } catch (err) { setErrorMessage(err.message); }
  };

  const handleAssignMySport = async (event) => {
    event.preventDefault(); setErrorMessage('');
    if (!adminSport.trim()) return setErrorMessage('Enter a sport name.');
    try {
      const response = await fetch('/api/sports-admins/mine', { method: 'POST', headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ sport: adminSport.trim() }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || 'Unable to assign sport');
      showToast(data.message); setAdminSport(''); fetchData();
    } catch (err) { setErrorMessage(err.message); }
  };

  const handleRemoveMySport = async (sport) => {
    try {
      const response = await fetch(`/api/sports-admins/mine/${encodeURIComponent(sport)}`, { method: 'DELETE', headers: getAuthHeaders(token) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || 'Unable to remove sport');
      showToast(data.message); fetchData();
    } catch (err) { setErrorMessage(err.message); }
  };

  const exportCsv = (name, rows) => {
    if (!rows.length) { setErrorMessage(`There is no ${name} data to export yet.`); return; }
    const columns = Object.keys(rows[0]);
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [columns.join(','), ...rows.map(row => columns.map(column => quote(row[column])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `playrpool-${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  // Available roles for dynamic dropdown filter
  const availableRolesForFilter = (() => {
    if (playerSportFilter === 'All') return [];
    const cfg = SPORT_ROLES[playerSportFilter];
    if (!cfg) return [];
    const list = [];
    if (cfg.primaryRoles) list.push(...cfg.primaryRoles);
    if (cfg.positions) list.push(...cfg.positions);
    if (cfg.categories) list.push(...cfg.categories);
    if (cfg.events) list.push(...cfg.events);
    if (cfg.formats) list.push(...cfg.formats);
    return list;
  })();

  // Filtered players list
  const filteredPlayers = (Array.isArray(players) ? players : []).filter((p) => {
    if (!p) return false;
    if (playerSearchQuery.trim()) {
      const q = playerSearchQuery.trim().toLowerCase();
      const matchText =
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.college_id && p.college_id.toLowerCase().includes(q)) ||
        (p.department && p.department.toLowerCase().includes(q)) ||
        (p.campus && p.campus.toLowerCase().includes(q));
      if (!matchText) return false;
    }

    if (playerSportFilter !== 'All') {
      const prof = p.sport_profiles?.[playerSportFilter];
      if (!prof) return false;

      if (playerRoleFilter !== 'All') {
        const hasRole =
          prof.primary_role === playerRoleFilter ||
          prof.position === playerRoleFilter ||
          prof.event_category === playerRoleFilter ||
          prof.bowling_style === playerRoleFilter ||
          prof.batting_hand === playerRoleFilter ||
          prof.playing_style === playerRoleFilter;
        if (!hasRole) return false;
      }
    } else if (playerRoleFilter !== 'All') {
      const hasAnyRoleMatch = Object.values(p.sport_profiles || {}).some(
        (prof) =>
          prof && (
            prof.primary_role === playerRoleFilter ||
            prof.position === playerRoleFilter ||
            prof.event_category === playerRoleFilter
          )
      );
      if (!hasAnyRoleMatch) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="dashboard-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛡️</div>
        <h2 style={{ color: 'var(--text-secondary)' }}>Loading Admin Desk…</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Fetching tournament data, please wait.</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="auth-card" style={{ textAlign: 'center', margin: '3rem auto', maxWidth: '500px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
        <h2 style={{ color: 'var(--danger, #ef4444)' }}>Administrator Access Required</h2>
        <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>
          You must be signed in with an administrator account to view the tournament control desk.
        </p>
        <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ maxWidth: '1080px' }}>
      {/* Toast Notification Container */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '1rem',
          maxWidth: 'calc(100vw - 2rem)',
          zIndex: 9999,
          background: toastMessage.isError
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.96), rgba(185, 28, 28, 0.96))'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.96), rgba(5, 150, 105, 0.96))',
          color: '#fff',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          boxShadow: toastMessage.isError
            ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.4)'
            : '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.4)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          animation: 'slideDown 0.3s ease-out'
        }}>
          <span>{toastMessage.isError ? '⚠️' : '✨'}</span>
          <span>{toastMessage.text}</span>
          <button 
            onClick={() => setToastMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: '0.5rem', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Header */}
      <div className="id-card-hero">
        <div className="id-card-header">
          <div className="id-badge" style={{ borderColor: '#f43f5e', color: '#fda4af' }}>
            <span>🛡️ OFFICIAL TOURNAMENT CONTROL DESK</span>
          </div>
          <span className="role-pill admin">ADMIN CONSOLE</span>
        </div>

        <div className="profile-info">
          <h2>Live Score & Match Operations</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Schedule fixtures, toggle match statuses (Upcoming / Live / Completed), and update points live.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('players', players)}>Export players CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('teams', teams)}>Export teams CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('fixtures', matches)}>Export fixtures CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('scores', scores)}>Export scores CSV</button>
          </div>
        </div>
      </div>

      <Alert type="error" message={errorMessage} />

      <div className="auth-card" style={{ maxWidth: '100%' }}>
        <h3 style={{ marginBottom: '0.4rem' }}>📣 {editingAnnouncementId ? 'Edit event update' : 'Publish event update'}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Post official tournament news, match details, dates, venue reminders, or other instructions for every visitor.</p>
        <form onSubmit={handlePostAnnouncement}>
          <div className="form-grid"><div className="form-group"><label className="form-label">Event type</label><select className="form-select no-icon" value={announcementCategory} onChange={(e) => setAnnouncementCategory(e.target.value)}><option value="tournament">Tournament</option><option value="match">Match</option><option value="notice">General notice</option></select></div><div className="form-group"><label className="form-label">Event date and time (optional)</label><input type="datetime-local" className="form-input no-icon" value={announcementDate} onChange={(e) => setAnnouncementDate(e.target.value)} /></div></div>
          <div className="form-group"><label className="form-label">Audience campus</label><input className="form-input no-icon" value={announcementCampus} onChange={(e) => setAnnouncementCampus(e.target.value)} placeholder="all or exact campus name" /><small style={{ color: 'var(--text-muted)' }}>Use “all” for every campus. Campus notices are delivered only to matching campus accounts.</small></div>
          <div className="form-group"><label className="form-label">Title</label><input maxLength="120" className="form-input no-icon" placeholder="e.g. Football semi-final schedule" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Message</label><textarea maxLength="2000" className="form-input no-icon" style={{ minHeight: '110px', resize: 'vertical' }} placeholder="Include teams, venue, reporting time, or other important information." value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} required /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={announcementPinned} onChange={(e) => setAnnouncementPinned(e.target.checked)} /> Pin this update at the top of Events</label>

          {/* DEVICE PHOTO UPLOAD SECTION */}
          <div style={{ margin: '1rem 0', padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)' }}>📷 Upload Photo from Device</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Attach match posters, pictures, or event banners directly from your phone or computer</span>
              </div>
              <label className="btn btn-secondary btn-sm" style={{ cursor: photoUploading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <span>{photoUploading ? '⏳ Compressing...' : '📁 Select Picture'}</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/jpg"
                  style={{ display: 'none' }}
                  onChange={handleDevicePhotoUpload}
                  disabled={photoUploading}
                />
              </label>
            </div>
          </div>

          <div className="form-grid"><div className="form-group"><label className="form-label">Or Attachment label</label><input className="form-input no-icon" value={attachmentLabel} onChange={(e) => setAttachmentLabel(e.target.value)} placeholder="Tournament rules PDF" /></div><div className="form-group"><label className="form-label">Attachment URL (Optional)</label><input className="form-input no-icon" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://…" /></div></div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1rem' }}><select className="form-select no-icon" style={{ maxWidth: '160px' }} value={attachmentType} onChange={(e) => setAttachmentType(e.target.value)}><option value="poster">Poster / Image</option><option value="rules">Rules PDF</option><option value="venue_map">Venue map</option><option value="schedule">Schedule</option><option value="other">Link / Other</option></select><button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (attachmentUrl.trim()) { let url = attachmentUrl.trim(); if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/')) url = `https://${url}`; const label = attachmentLabel.trim() || 'Event Link'; setAnnouncementAttachments(items => [...items, { label, url, type: attachmentType || 'other' }]); setAttachmentLabel(''); setAttachmentUrl(''); } }}>Add URL link</button></div>

          {announcementAttachments.length > 0 && (
            <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>ATTACHED MEDIA & LINKS ({announcementAttachments.length}/8):</div>
              {announcementAttachments.map((attachment, index) => (
                <div key={`${attachment.url.slice(0, 30)}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {attachment.url.startsWith('data:image/') || attachment.type === 'poster' ? (
                    <img src={attachment.url} alt={attachment.label} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                  ) : (
                    <span style={{ fontSize: '1.25rem' }}>📎</span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachment.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{attachment.type === 'poster' ? 'Photo / Poster' : attachment.type}</div>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setAnnouncementAttachments(items => items.filter((_, i) => i !== index))}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={postingAnnouncement}>{postingAnnouncement ? 'Saving…' : editingAnnouncementId ? 'Save changes' : 'Post to Events'}</button>{editingAnnouncementId && <button type="button" className="btn btn-secondary" style={{ width: 'auto', marginLeft: '0.6rem' }} onClick={cancelEditingAnnouncement}>Cancel</button>}
        </form>
        {announcements.map((item) => <div key={item.id} className="admin-announcement"><span><strong>{item.is_pinned ? '📌 ' : ''}{item.title}</strong> · {item.category}{item.event_at ? ` · ${new Date(item.event_at).toLocaleString()}` : ''}</span><span style={{ display: 'flex', gap: '0.5rem' }}><button className="btn btn-secondary btn-sm" onClick={() => startEditingAnnouncement(item)}>Edit</button><button className="btn btn-danger btn-sm" onClick={() => handleDeleteAnnouncement(item.id)}>Remove</button></span></div>)}
      </div>

      <div className="auth-card" style={{ maxWidth: '100%' }}>
        <h3 style={{ marginBottom: '0.4rem' }}>🛡️ My sports administration</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Add the sports you manage. Players will find your contact information in the Sports Admins directory.</p>
        <form onSubmit={handleAssignMySport} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-select no-icon"
            style={{ maxWidth: '220px' }}
            value={SPORT_LIST.includes(adminSport) ? adminSport : adminSport ? '__custom__' : ''}
            onChange={(e) => {
              if (e.target.value === '__custom__') setAdminSport('');
              else setAdminSport(e.target.value);
            }}
          >
            <option value="">Choose standard sport...</option>
            {SPORT_LIST.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__custom__">Other / Custom Sport...</option>
          </select>
          {(!SPORT_LIST.includes(adminSport) || adminSport === '') && (
            <input
              className="form-input no-icon"
              style={{ maxWidth: '240px' }}
              value={adminSport}
              onChange={(e) => setAdminSport(e.target.value)}
              placeholder="Enter custom sport"
              maxLength="60"
            />
          )}
          <button className="btn btn-primary btn-sm" type="submit">Add sport</button>
        </form>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>{(Array.isArray(sportsAdmins) ? sportsAdmins : []).filter(item => item && user && item.admin_id === (user.id || user.userId)).map(item => <span key={item.id} className="role-pill admin">{item.sport} <button type="button" onClick={() => handleRemoveMySport(item.sport)} aria-label={`Remove ${item.sport}`} style={{ marginLeft: '0.35rem', border: 0, cursor: 'pointer', background: 'transparent', color: 'inherit' }}>×</button></span>)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="auth-card" style={{ maxWidth: '100%' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>Registration deadlines</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Set a separate opening and closing time for each sport.</p>
          <form onSubmit={handleSaveDeadline}>
            <input className="form-input no-icon" value={deadlineSport} onChange={(e) => setDeadlineSport(e.target.value)} placeholder="Sport" required />
            <label className="form-label" style={{ marginTop: '0.65rem' }}>Opens</label><input type="datetime-local" className="form-input no-icon" value={deadlineOpensAt} onChange={(e) => setDeadlineOpensAt(e.target.value)} />
            <label className="form-label" style={{ marginTop: '0.65rem' }}>Closes</label><input type="datetime-local" className="form-input no-icon" value={deadlineClosesAt} onChange={(e) => setDeadlineClosesAt(e.target.value)} />
            <button className="btn btn-primary btn-sm" style={{ marginTop: '0.8rem' }} type="submit">Save deadline</button>
          </form>
          {deadlines.map(d => <div key={d.sport} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.6rem' }}><strong>{d.sport}</strong>: {d.opens_at ? new Date(d.opens_at).toLocaleString() : 'open now'} → {d.closes_at ? new Date(d.closes_at).toLocaleString() : 'no close time'}</div>)}
        </div>
        <div className="auth-card" style={{ maxWidth: '100%' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>ScoreHub · Knockout format</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Create league fixtures with the match form below. Generate a knockout round here, then advance winners after decisive completed results.</p>
          <input className="form-input no-icon" value={bracketSport} onChange={(e) => setBracketSport(e.target.value)} placeholder="Sport" />
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}><button className="btn btn-primary btn-sm" onClick={handleGenerateBracket}>Generate next round</button><button className="btn btn-secondary btn-sm" onClick={() => loadBracket()}>View bracket</button></div>
          {bracketFixtures.map(f => <div key={f.id} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.55rem' }}>Round {f.round_number}: <strong>{f.team_a_name}</strong> vs <strong>{f.team_b_name}</strong> ({f.status})</div>)}
        </div>
      </div>

      {/* TWO COLUMN GRID: MATCH CREATION & SCORE CONTROLLER */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        
        {/* FORM 1: CREATE MATCH */}
        <div className="auth-card" style={{ maxWidth: '100%' }}>
          <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.35rem' }}>Create Tournament Match</h2>
            <p>Schedule a new fixture between competing teams</p>
          </div>

          <form onSubmit={handleCreateMatch}>
            <div className="form-group full-width">
              <label className="form-label">Match Title / Fixture *</label>
              <input
                type="text"
                className="form-input no-icon"
                placeholder="e.g. Quarterfinal 1: Strikers vs Phoenix"
                value={newMatchName}
                onChange={(e) => setNewMatchName(e.target.value)}
                required
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Sport *</label>
                <select className="form-select no-icon" value={newMatchSport} onChange={(e) => setNewMatchSport(e.target.value)}>
                  <option>Badminton</option><option>Table Tennis</option><option>Cricket</option><option>Football</option><option>Other</option>
                </select>
                {newMatchSport === 'Other' && <input className="form-input no-icon" style={{ marginTop: '0.5rem' }} placeholder="Custom sport" value={customMatchSport} onChange={(e) => setCustomMatchSport(e.target.value)} required />}
              </div>
              <div className="form-group">
                <label className="form-label">Team A *</label>
                <select className="form-select no-icon" value={newMatchTeamA} onChange={(e) => setNewMatchTeamA(e.target.value)} required>
                  <option value="" disabled>Choose Team A</option>
                  {teams.filter(team => team.sport === (newMatchSport === 'Other' ? customMatchSport.trim() : newMatchSport)).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Team B *</label>
                <select className="form-select no-icon" value={newMatchTeamB} onChange={(e) => setNewMatchTeamB(e.target.value)} required>
                  <option value="" disabled>Choose Team B</option>
                  {teams.filter(team => team.sport === (newMatchSport === 'Other' ? customMatchSport.trim() : newMatchSport) && team.id !== newMatchTeamA).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Match Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-input no-icon"
                  value={newMatchDate}
                  onChange={(e) => setNewMatchDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Initial Status</label>
                <select
                  className="form-select no-icon"
                  value={newMatchStatus}
                  onChange={(e) => setNewMatchStatus(e.target.value)}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="live">Live (In Progress)</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={creatingMatch}
              style={{ marginTop: '0.75rem' }}
            >
              {creatingMatch ? 'Scheduling...' : '➕ Schedule Match Fixture'}
            </button>
          </form>
        </div>

        {/* FORM 2: SPORT-AWARE LIVE SCORE ENGINE */}
        <div className="auth-card" style={{ maxWidth: '100%', padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontFamily: 'var(--font-serif)', marginBottom: '0.25rem' }}>⚙️ Live Score Control Panel</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Sport-specific scoring — event-sourced, real-time, with undo support</p>
          </div>

          {/* Match Picker */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>SELECT MATCH TO SCORE</label>
            <select
              className="form-select no-icon"
              value={lsMatchId}
              onChange={(e) => { setLsMatchId(e.target.value); setLsLiveState(null); setLsShowLineup(false); setLsShowInnings2(false); lsLoadState(e.target.value); }}
            >
              <option value="">-- Choose a match --</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  [{m.sport}] {m.team_a_name || 'TBA'} vs {m.team_b_name || 'TBA'} · {(m.status || 'upcoming').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {lsMatchId && (
            <>
              {/* Sport Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', padding: '0.65rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>SPORT</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{lsMatch?.sport?.toUpperCase()}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: lsLiveState?.isCompleted ? 'var(--accent-emerald)' : (lsMatch?.status === 'live' ? '#f43f5e' : 'var(--text-muted)') }}>
                  {lsLiveState?.isCompleted ? '✅ COMPLETED' : (lsMatch?.status === 'live' ? '🔴 LIVE' : (lsMatch?.status || 'UPCOMING').toUpperCase())}
                </span>
                <button onClick={() => lsLoadState(lsMatchId)} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa', fontSize: '0.72rem', cursor: 'pointer' }}>🔄 Refresh</button>
              </div>

              {lsLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading match state…</div>
              ) : (
                <>
                  {/* ── CRICKET ── */}
                  {lsIsCricket && (() => {
                    const inn = lsLiveState?.inningsNumber === 1 ? lsLiveState?.innings1 : lsLiveState?.innings2;
                    const needsLineup = lsLiveState && !lsLiveState.striker && !lsLiveState.isCompleted;
                    const needsBowler = lsLiveState && !lsLiveState.currentBowler && !lsLiveState.isCompleted;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Mini scoreboard */}
                        {lsLiveState && (
                          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{inn?.teamName || lsMatch?.team_a_name} — INN {lsLiveState.inningsNumber}</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{inn?.totalRuns ?? 0}<span style={{ opacity: 0.45, fontSize: '1.5rem' }}>/{inn?.wickets ?? 0}</span></div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{inn?.oversFormatted ?? '0.0'} ov · RR: {lsLiveState.currentRunRate ?? '0.00'}</div>
                            {lsLiveState.inningsNumber === 2 && lsLiveState.target && (
                              <div style={{ marginTop: 6, color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem' }}>Target: {lsLiveState.target} · Need {lsLiveState.target - (inn?.totalRuns ?? 0)}</div>
                            )}
                            {/* This over balls */}
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                              {(inn?.currentOverBalls || []).map((b, i) => {
                                const isW = b === 'W'; const is4 = b === '4'; const is6 = b === '6'; const isWide = b?.includes?.('Wd'); const isNb = b?.includes?.('NB');
                                return (
                                  <span key={i} style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', background: isW ? 'rgba(244,63,94,0.2)' : is4 ? 'rgba(56,189,248,0.2)' : is6 ? 'rgba(168,85,247,0.2)' : isWide ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)', color: isW ? '#f43f5e' : is4 ? '#38bdf8' : is6 ? '#a855f7' : isWide ? '#f59e0b' : '#a1a1aa', border: `1.5px solid ${isW ? '#f43f5e44' : is4 ? '#38bdf844' : is6 ? '#a855f744' : 'rgba(255,255,255,0.1)'}` }}>{b}</span>
                                );
                              })}
                            </div>
                            {lsLiveState.striker && (
                              <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                ⚡ {lsLiveState.striker.name} · 🏏 {lsLiveState.currentBowler?.name || '—'}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Lineup setup */}
                        {(needsLineup || lsShowLineup) && (
                          <div style={{ padding: '1rem', background: 'rgba(56,189,248,0.07)', borderRadius: 12, border: '1px solid rgba(56,189,248,0.2)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 10 }}>SET BATTING LINEUP</div>
                            {[['Striker (on strike)', lsStrikerName, setLsStrikerName], ['Non-Striker', lsNonStrikerName, setLsNonStrikerName], ['Opening Bowler', lsBowlerName, setLsBowlerName]].map(([label, val, setter]) => (
                              <input key={label} placeholder={label} value={val} onChange={e => setter(e.target.value)}
                                className="form-input no-icon" style={{ marginBottom: 8, fontFamily: 'var(--font-mono)' }} />
                            ))}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => { lsSendEvent('SET_LINEUP', { striker: { name: lsStrikerName, id: `p_${lsStrikerName.toLowerCase().replace(/\s/g,'_')}` }, nonStriker: { name: lsNonStrikerName, id: `p_${lsNonStrikerName.toLowerCase().replace(/\s/g,'_')}` }, bowler: { name: lsBowlerName, id: `b_${lsBowlerName.toLowerCase().replace(/\s/g,'_')}` } }); setLsShowLineup(false); }} className="btn btn-primary" style={{ flex: 1, fontSize: '0.82rem' }}>✓ Set Lineup</button>
                              {!needsLineup && <button onClick={() => setLsShowLineup(false)} className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>}
                            </div>
                          </div>
                        )}

                        {/* New bowler needed */}
                        {needsBowler && !needsLineup && !lsShowLineup && (
                          <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.07)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.25)' }}>
                            <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8 }}>🔄 OVER COMPLETE — SET NEXT BOWLER</div>
                            <input placeholder="Bowler name" value={lsBowlerName} onChange={e => setLsBowlerName(e.target.value)} className="form-input no-icon" style={{ marginBottom: 8, fontFamily: 'var(--font-mono)' }} />
                            <button onClick={() => { lsSendEvent('CHANGE_BOWLER', { bowler: { name: lsBowlerName, id: `b_${lsBowlerName.toLowerCase().replace(/\s/g,'_')}` } }); setLsBowlerName(''); }} className="btn btn-primary" style={{ fontSize: '0.82rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>Confirm Bowler</button>
                          </div>
                        )}

                        {/* Innings 2 prompt */}
                        {lsLiveState?.inningsNumber === 1 && lsLiveState?.target != null && (
                          <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.07)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.85rem' }}>🏏 1st Innings done — Target: {lsLiveState.target}</span>
                            <button onClick={() => setLsShowInnings2(true)} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>Start Innings 2</button>
                          </div>
                        )}
                        {lsShowInnings2 && (
                          <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.07)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 10 }}>INNINGS 2 LINEUP</div>
                            {[['Opener 1 (Striker)', lsInn2Striker, setLsInn2Striker], ['Opener 2 (Non-Striker)', lsInn2NonStriker, setLsInn2NonStriker], ['Opening Bowler', lsInn2Bowler, setLsInn2Bowler]].map(([label, val, setter]) => (
                              <input key={label} placeholder={label} value={val} onChange={e => setter(e.target.value)} className="form-input no-icon" style={{ marginBottom: 8, fontFamily: 'var(--font-mono)' }} />
                            ))}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => { lsSendEvent('START_INNINGS_2', { striker: { name: lsInn2Striker, id: `p_${lsInn2Striker.toLowerCase().replace(/\s/g,'_')}` }, nonStriker: { name: lsInn2NonStriker, id: `p_${lsInn2NonStriker.toLowerCase().replace(/\s/g,'_')}` }, bowler: { name: lsInn2Bowler, id: `b_${lsInn2Bowler.toLowerCase().replace(/\s/g,'_')}` } }); setLsShowInnings2(false); }} className="btn btn-primary" style={{ flex: 1, fontSize: '0.82rem', background: 'linear-gradient(135deg,#10b981,#059669)' }}>Start Innings 2</button>
                              <button onClick={() => setLsShowInnings2(false)} className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Ball entry — main */}
                        {!needsBowler && !lsLiveState?.isCompleted && lsLiveState?.striker && (
                          <>
                            {/* Run buttons */}
                            <div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.1em' }}>BALL-BY-BALL ENTRY</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                {[['•', 0, '#71717a'], ['1', 1, '#f4f4f5'], ['2', 2, '#f4f4f5'], ['3', 3, '#f4f4f5'], ['4 🔵', 4, '#38bdf8'], ['6 🟣', 6, '#a855f7'], ['5', 5, '#a1a1aa']].map(([label, runs, color]) => (
                                  <button key={label} onClick={() => lsSendEvent('RECORD_DELIVERY', { runs, deliveryType: 'LEGAL', striker: lsLiveState.striker, bowler: lsLiveState.currentBowler })}
                                    style={{ padding: '0.75rem 0.5rem', borderRadius: 10, border: `1.5px solid ${color}33`, background: `${color}11`, color, fontSize: '0.95rem', fontWeight: 800, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>{label}</button>
                                ))}
                                <button onClick={() => lsSendEvent('SWAP_STRIKE', {})} style={{ padding: '0.75rem 0.5rem', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>⇄ Swap</button>
                              </div>
                            </div>
                            {/* Byes / Leg byes */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                              {[[1, 'BYE'], [2, 'BYE'], [1, 'LEG_BYE'], [2, 'LEG_BYE']].map(([r, t]) => (
                                <button key={`${r}${t}`} onClick={() => lsSendEvent('RECORD_DELIVERY', { runs: r, deliveryType: t, striker: lsLiveState.striker, bowler: lsLiveState.currentBowler })}
                                  style={{ padding: '0.6rem', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>{r} {t.replace('_', ' ')}</button>
                              ))}
                            </div>
                            {/* Wide */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button onClick={() => { lsSendEvent('RECORD_DELIVERY', { runs: 0, deliveryType: 'WIDE', extraRuns: lsWide, striker: lsLiveState.striker, bowler: lsLiveState.currentBowler }); setLsWide(0); }}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1.5px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', color: '#f59e0b', fontWeight: 800, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>WIDE</button>
                              <input type="number" min="0" max="6" value={lsWide} onChange={e => setLsWide(Number(e.target.value))} placeholder="Extra"
                                style={{ width: 70, padding: '0.65rem', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', textAlign: 'center' }} />
                            </div>
                            {/* No Ball */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button onClick={() => { lsSendEvent('RECORD_DELIVERY', { runs: lsNb, deliveryType: 'NO_BALL', extraRuns: 0, striker: lsLiveState.striker, bowler: lsLiveState.currentBowler }); setLsNb(0); }}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1.5px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.08)', color: '#f97316', fontWeight: 800, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>NO BALL{lsLiveState.isFreeHit ? ' 🎯' : ''}</button>
                              <input type="number" min="0" max="6" value={lsNb} onChange={e => setLsNb(Number(e.target.value))} placeholder="Bat runs"
                                style={{ width: 70, padding: '0.65rem', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', textAlign: 'center' }} />
                            </div>
                            {/* Wicket */}
                            <div style={{ padding: '1rem', background: 'rgba(244,63,94,0.05)', borderRadius: 12, border: '1px solid rgba(244,63,94,0.18)' }}>
                              <div style={{ fontSize: '0.68rem', color: '#f43f5e', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8 }}>WICKET 🏏</div>
                              <select value={lsWicketType} onChange={e => setLsWicketType(e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', marginBottom: 8, fontSize: '0.88rem' }}>
                                <option value="">Select dismissal…</option>
                                {['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket', 'Handled Ball', 'Retired'].map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
                              </select>
                              <input placeholder="Next batsman (optional)" value={lsNextBatsman} onChange={e => setLsNextBatsman(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: 8 }} />
                              <button disabled={!lsWicketType} onClick={() => { lsSendEvent('RECORD_DELIVERY', { runs: 0, deliveryType: 'LEGAL', wicket: { dismissalType: lsWicketType, playerOut: lsLiveState.striker, nextBatsman: lsNextBatsman.trim() ? { name: lsNextBatsman.trim(), id: `p_${Date.now()}` } : null }, striker: lsLiveState.striker, bowler: lsLiveState.currentBowler }); setLsWicketType(''); setLsNextBatsman(''); }}
                                style={{ width: '100%', padding: '0.65rem', borderRadius: 10, border: '1.5px solid rgba(244,63,94,0.3)', background: lsWicketType ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.03)', color: lsWicketType ? '#f43f5e' : '#52525b', fontWeight: 800, cursor: lsWicketType ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-mono)' }}>W WICKET!</button>
                            </div>
                            {/* Lineup/Undo row */}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => setLsShowLineup(true)} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Change Batsman</button>
                              <button onClick={lsUndo} disabled={lsUndoing} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#f43f5e', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', opacity: lsUndoing ? 0.5 : 1 }}>↩ Undo</button>
                            </div>
                          </>
                        )}
                        {lsLiveState?.isCompleted && <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.25)', color: 'var(--accent-emerald)', fontWeight: 700 }}>✅ Match Completed — {lsLiveState.resultText}</div>}
                      </div>
                    );
                  })()}

                  {/* ── FOOTBALL / FUTSAL ── */}
                  {lsIsFootball && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {lsLiveState && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', alignItems: 'center' }}>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_a_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamA?.score ?? 0}</div></div>
                          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{lsLiveState.period || 'VS'}</div>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_b_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamB?.score ?? 0}</div></div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[[lsMatch?.team_a_id, lsMatch?.team_a_name, '#38bdf8'], [lsMatch?.team_b_id, lsMatch?.team_b_name, '#a855f7']].map(([id, name, color]) => (
                          <button key={id} onClick={() => lsSendEvent('GOAL', { teamId: id, scorer: lsGoalScorer, assist: lsGoalAssist, minute: parseInt(lsGoalMinute) || (lsLiveState?.currentMinute ?? 0) })}
                            style={{ padding: '1.1rem', borderRadius: 12, border: `1.5px solid ${color}33`, background: `${color}11`, color, fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1.4 }}>⚽ GOAL<br /><span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{name}</span></button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input placeholder="Goal scorer" value={lsGoalScorer} onChange={e => setLsGoalScorer(e.target.value)} style={{ flex: 2, padding: '0.55rem 0.75rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }} />
                        <input placeholder="Minute" value={lsGoalMinute} onChange={e => setLsGoalMinute(e.target.value)} style={{ flex: 1, padding: '0.55rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }} />
                        <input placeholder="Assist" value={lsGoalAssist} onChange={e => setLsGoalAssist(e.target.value)} style={{ flex: 1.5, padding: '0.55rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {[['🟨 Yellow', () => { const t = window.prompt(`Which team? ${lsMatch?.team_a_name} or ${lsMatch?.team_b_name}`) === lsMatch?.team_a_name ? lsMatch?.team_a_id : lsMatch?.team_b_id; lsSendEvent('CARD', { teamId: t, cardType: 'YELLOW', player: window.prompt('Player name?') || '' }); }, '#f59e0b'],
                          ['🟥 Red', () => { const t = window.prompt(`Which team? ${lsMatch?.team_a_name} or ${lsMatch?.team_b_name}`) === lsMatch?.team_a_name ? lsMatch?.team_a_id : lsMatch?.team_b_id; lsSendEvent('CARD', { teamId: t, cardType: 'RED', player: window.prompt('Player name?') || '' }); }, '#f43f5e'],
                          ['🔄 Substitution', () => { const t = window.prompt(`Which team? ${lsMatch?.team_a_name} or ${lsMatch?.team_b_name}`) === lsMatch?.team_a_name ? lsMatch?.team_a_id : lsMatch?.team_b_id; lsSendEvent('SUBSTITUTION', { teamId: t, playerIn: window.prompt('Player IN?') || '', playerOut: window.prompt('Player OUT?') || '' }); }, '#71717a']
                        ].map(([label, fn, c]) => (
                          <button key={label} onClick={fn} style={{ padding: '0.65rem', borderRadius: 10, border: `1px solid ${c}33`, background: `${c}11`, color: c, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {['1st Half', 'Half Time', '2nd Half', 'Full Time', 'Extra Time', 'Ended'].map(p => (
                          <button key={p} onClick={() => lsSendEvent('SET_PERIOD', { period: p })} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>{p}</button>
                        ))}
                      </div>
                      {lsLiveState?.isCompleted && <div style={{ padding: '0.75rem', textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderRadius: 10, color: 'var(--accent-emerald)', fontWeight: 700 }}>✅ {lsLiveState.resultText}</div>}
                      <button onClick={lsUndo} disabled={lsUndoing} style={{ padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.07)', color: '#f43f5e', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', opacity: lsUndoing ? 0.5 : 1 }}>↩ Undo Last Action</button>
                    </div>
                  )}

                  {/* ── BASKETBALL ── */}
                  {lsIsBasketball && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {lsLiveState && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', alignItems: 'center' }}>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_a_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamA?.score ?? 0}</div><div style={{ fontSize: '0.72rem', color: '#f43f5e' }}>Fouls: {lsLiveState.teamA?.fouls ?? 0}</div></div>
                          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{lsLiveState.quarter || 'VS'}<br /><span style={{ fontSize: '0.72rem' }}>{lsLiveState.gameClock || ''}</span></div>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_b_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamB?.score ?? 0}</div><div style={{ fontSize: '0.72rem', color: '#f43f5e' }}>Fouls: {lsLiveState.teamB?.fouls ?? 0}</div></div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[[lsMatch?.team_a_id, lsMatch?.team_a_name, '#38bdf8'], [lsMatch?.team_b_id, lsMatch?.team_b_name, '#a855f7']].map(([id, name, color]) => (
                          <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{name?.toUpperCase()}</div>
                            {[['+1', 1], ['+2', 2], ['+3', 3]].map(([label, pts]) => (
                              <button key={pts} onClick={() => lsSendEvent('SCORE_POINTS', { teamId: id, points: pts })} style={{ padding: '0.75rem', borderRadius: 10, border: `1.5px solid ${color}33`, background: `${color}11`, color, fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer' }}>{label}</button>
                            ))}
                            <button onClick={() => lsSendEvent('FOUL', { teamId: id })} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#f43f5e', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>🚨 Foul</button>
                            <button onClick={() => lsSendEvent('TIMEOUT', { teamId: id })} style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>⏸ Timeout</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'End'].map(q => (
                          <button key={q} onClick={() => lsSendEvent(q === 'End' ? 'END_GAME' : 'SET_QUARTER', q === 'End' ? {} : { quarter: q })} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>{q}</button>
                        ))}
                      </div>
                      <button onClick={lsUndo} disabled={lsUndoing} style={{ padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.07)', color: '#f43f5e', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', opacity: lsUndoing ? 0.5 : 1 }}>↩ Undo</button>
                    </div>
                  )}

                  {/* ── BADMINTON / VOLLEYBALL / TABLE TENNIS / TENNIS ── */}
                  {lsIsRacket && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {lsLiveState && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', alignItems: 'center' }}>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_a_name} {lsLiveState.servingTeamId === lsMatch?.team_a_id ? '● SERVE' : ''}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamA?.currentPoints ?? 0}</div><div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>Sets: {lsLiveState.teamA?.setsWon ?? 0}</div></div>
                          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Set {lsLiveState.currentSet || 1}</div>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_b_name} {lsLiveState.servingTeamId === lsMatch?.team_b_id ? '● SERVE' : ''}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamB?.currentPoints ?? 0}</div><div style={{ fontSize: '0.8rem', color: '#a855f7' }}>Sets: {lsLiveState.teamB?.setsWon ?? 0}</div></div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[[lsLiveState?.teamA?.id || lsMatch?.team_a_id || 'team_a', lsLiveState?.teamA?.name || lsMatch?.team_a_name || 'Team A', '#38bdf8'], [lsLiveState?.teamB?.id || lsMatch?.team_b_id || 'team_b', lsLiveState?.teamB?.name || lsMatch?.team_b_name || 'Team B', '#a855f7']].map(([id, name, color]) => (
                          <button key={id} type="button" onClick={() => lsSendEvent('POINT', { teamId: id })} style={{ padding: '1.25rem', borderRadius: 12, border: `1.5px solid ${color}33`, background: `${color}11`, color, fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', lineHeight: 1.4 }}>⊕ POINT<br /><span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{name}</span></button>
                        ))}
                      </div>
                      <button type="button" onClick={() => lsSendEvent('TOGGLE_SERVICE', {})} style={{ padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>⇄ Toggle Service</button>
                      {lsLiveState?.isCompleted && <div style={{ padding: '0.75rem', textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderRadius: 10, color: 'var(--accent-emerald)', fontWeight: 700 }}>✅ {lsLiveState.resultText}</div>}
                      <button type="button" onClick={lsUndo} disabled={lsUndoing} style={{ padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.07)', color: '#f43f5e', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', opacity: lsUndoing ? 0.5 : 1 }}>↩ Undo</button>
                    </div>
                  )}

                  {/* ── KABADDI ── */}
                  {lsIsKabaddi && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {lsLiveState && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', alignItems: 'center' }}>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_a_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamA?.score ?? 0}</div></div>
                          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{lsLiveState.half || 'VS'}</div>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_b_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamB?.score ?? 0}</div></div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[[lsMatch?.team_a_id, lsMatch?.team_a_name, '#38bdf8'], [lsMatch?.team_b_id, lsMatch?.team_b_name, '#a855f7']].map(([id, name, color]) => (
                          <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{name?.toUpperCase()}</div>
                            {[['🏃 Raid +1', 'RAID', 1], ['🔥 Super Raid +3', 'SUPER_RAID', 3], ['🛡 Tackle +1', 'TACKLE', 1], ['⚡ Super Tackle +2', 'SUPER_TACKLE', 2], ['💥 All Out +2', 'ALL_OUT', 2]].map(([label, action, pts]) => (
                              <button key={action} onClick={() => lsSendEvent('SCORE_ACTION', { teamId: id, actionType: action, points: pts })} style={{ padding: '0.65rem', borderRadius: 10, border: `1px solid ${color}33`, background: `${color}09`, color, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {['1st Half', 'Half Time', '2nd Half', 'Ended'].map(h => (
                          <button key={h} onClick={() => lsSendEvent('SET_HALF', { half: h })} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{h}</button>
                        ))}
                      </div>
                      <button onClick={lsUndo} disabled={lsUndoing} style={{ padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.07)', color: '#f43f5e', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', opacity: lsUndoing ? 0.5 : 1 }}>↩ Undo</button>
                    </div>
                  )}

                  {/* ── GENERIC / OTHER ── */}
                  {!lsIsCricket && !lsIsFootball && !lsIsBasketball && !lsIsRacket && !lsIsKabaddi && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {lsLiveState && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', alignItems: 'center' }}>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_a_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamA?.score ?? 0}</div></div>
                          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>VS</div>
                          <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{lsMatch?.team_b_name}</div><div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{lsLiveState.teamB?.score ?? 0}</div></div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[[lsMatch?.team_a_id, lsMatch?.team_a_name, '#38bdf8'], [lsMatch?.team_b_id, lsMatch?.team_b_name, '#a855f7']].map(([id, name, color]) => (
                          <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{name?.toUpperCase()}</div>
                            {[['+1', 1], ['+2', 2], ['+3', 3], ['-1', -1]].map(([label, delta]) => (
                              <button key={label} onClick={() => lsSendEvent('ADD_POINTS', { teamId: id, delta })} style={{ padding: '0.75rem', borderRadius: 10, border: `1.5px solid ${color}33`, background: `${color}11`, color, fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer' }}>{label}</button>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <button onClick={() => lsSendEvent('SET_RESULT', { outcome: 'WIN', winnerTeamId: lsMatch?.team_a_id })} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.08)', color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>{lsMatch?.team_a_name} Wins</button>
                        <button onClick={() => lsSendEvent('SET_RESULT', { outcome: 'DRAW' })} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Draw</button>
                        <button onClick={() => lsSendEvent('SET_RESULT', { outcome: 'WIN', winnerTeamId: lsMatch?.team_b_id })} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', color: '#a855f7', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>{lsMatch?.team_b_name} Wins</button>
                      </div>
                      <button onClick={lsUndo} disabled={lsUndoing} style={{ padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.07)', color: '#f43f5e', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', opacity: lsUndoing ? 0.5 : 1 }}>↩ Undo</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!lsMatchId && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.88rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              Select a match above to load sport-specific scoring controls
            </div>
          )}
        </div>
      </div>

      {/* MATCH STATUS MANAGER LIST */}
      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
          FIXTURES & STATUS CONTROLS ({matches.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {matches.length === 0 ? (
            <div className="auth-card" style={{ textAlign: 'center', padding: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>No matches scheduled yet. Create one above!</p>
            </div>
          ) : (
            matches.map(m => {
              const isLive = m.status === 'live';
              const isCompleted = m.status === 'completed';

              return (
                <div
                  key={m.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>
                        {m.team_a_name && m.team_b_name ? `${m.team_a_name} vs ${m.team_b_name}` : m.name}
                      </span>
                      <span className="role-pill player">{m.sport || 'Football'}</span>
                      <span
                        className="role-pill"
                        style={{
                          background: isLive ? 'rgba(244, 63, 94, 0.2)' : isCompleted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(79, 172, 254, 0.2)',
                          color: isLive ? '#fb7185' : isCompleted ? '#6ee7b7' : '#00f2fe',
                          border: `1px solid ${isLive ? 'rgba(244, 63, 94, 0.4)' : isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(79, 172, 254, 0.4)'}`
                        }}
                      >
                        {isLive ? '🔴 LIVE' : isCompleted ? '🟢 COMPLETED' : '⚪ UPCOMING'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Date: {new Date(m.match_date).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className={`btn btn-sm ${m.status === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleStatusChange(m.id, 'upcoming')}
                      disabled={m.status === 'upcoming'}
                    >
                      Upcoming
                    </button>
                    <button
                      className={`btn btn-sm ${isLive ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => handleStatusChange(m.id, 'live')}
                      disabled={isLive}
                    >
                      🔴 Set Live
                    </button>
                    <button
                      className={`btn btn-sm ${isCompleted ? 'btn-primary' : 'btn-secondary'}`}
                      style={isCompleted ? { background: '#10b981' } : {}}
                      onClick={() => handleStatusChange(m.id, 'completed')}
                      disabled={isCompleted}
                    >
                      Completed
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* TABLE OF ALL CURRENT SCORES */}
      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
          LIVE SCORES REVIEW TABLE ({scores.length} RECORDS)
        </h3>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}>
          <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Match Fixture</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Team</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score / Points</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Match Status</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Last Updated</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {scores.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No scores recorded yet. Select a match and team above to enter points!
                  </td>
                </tr>
              ) : (
                scores.map((s) => (
                  <tr 
                    key={s.id}
                    style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s ease' }}
                  >
                    <td style={{ padding: '1rem', fontWeight: 600, color: '#fff' }}>
                      {s.match_name}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      {s.sport || '🏅'} {s.team_name}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        background: 'rgba(0, 242, 254, 0.15)',
                        color: 'var(--accent-cyan)',
                        padding: '0.35rem 0.8rem',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 800,
                        fontSize: '1.1rem'
                      }}>
                        {s.points} PTS
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`role-pill ${s.match_status === 'live' ? 'admin' : 'player'}`}>
                        {s.match_status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(s.updated_at).toLocaleTimeString()} by {s.updated_by_name}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleQuickEdit(s)}
                      >
                        ✏️ Quick Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REGISTERED ATHLETES & SPORT ROLE DIRECTORY */}
      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', margin: 0 }}>
              🏃 REGISTERED ATHLETES & SPORT ROLE DIRECTORY ({filteredPlayers.length} / {players.length})
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
              Filter registered athletes by sport and playing role to evaluate squad eligibility.
            </p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => exportCsv('filtered-players', filteredPlayers)}
          >
            Export Filtered Athletes CSV
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="auth-card" style={{ maxWidth: '100%', marginBottom: '1rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            {/* Search input */}
            <div>
              <label className="form-label" style={{ marginBottom: '0.35rem', fontSize: '0.8rem' }}>Search Athlete</label>
              <input
                type="text"
                className="form-input no-icon"
                placeholder="Name, College ID, Dept..."
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
              />
            </div>

            {/* Sport Filter */}
            <div>
              <label className="form-label" style={{ marginBottom: '0.35rem', fontSize: '0.8rem' }}>Sport</label>
              <select
                className="form-select no-icon"
                value={playerSportFilter}
                onChange={(e) => {
                  setPlayerSportFilter(e.target.value);
                  setPlayerRoleFilter('All');
                }}
              >
                <option value="All">All Sports</option>
                {SPORT_LIST.map((sp) => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div>
              <label className="form-label" style={{ marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                Playing Role / Position
              </label>
              <select
                className="form-select no-icon"
                value={playerRoleFilter}
                onChange={(e) => setPlayerRoleFilter(e.target.value)}
                disabled={playerSportFilter === 'All' && availableRolesForFilter.length === 0}
              >
                <option value="All">All Roles / Positions</option>
                {availableRolesForFilter.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', padding: '0.55rem' }}
                onClick={() => {
                  setPlayerSportFilter('All');
                  setPlayerRoleFilter('All');
                  setPlayerSearchQuery('');
                }}
              >
                🔄 Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Players Table */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}>
          <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Athlete</th>
                <th style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dept / Year</th>
                <th style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Campus</th>
                <th style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sport Roles & Attributes</th>
                <th style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No registered athletes match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((p) => {
                  const profiles = p.sport_profiles || {};
                  const enrolledSports = Object.keys(profiles);

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#fff' }}>{p.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)' }}>{p.college_id}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                        <div>{p.department || '—'}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{p.year}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {p.campus || 'Main Campus'}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {enrolledSports.length === 0 ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No roles defined
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {enrolledSports
                              .filter((sp) => playerSportFilter === 'All' || sp === playerSportFilter)
                              .map((sp) => {
                                const prof = profiles[sp];
                                const tags = formatSportProfile(sp, prof);
                                return (
                                  <div key={sp} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: '0.8rem', color: '#fff' }}>{sp}:</strong>
                                    {tags.length > 0 ? (
                                      tags.map((t, idx) => (
                                        <span
                                          key={idx}
                                          style={{
                                            fontSize: '0.7rem',
                                            background: 'rgba(0, 242, 254, 0.12)',
                                            color: 'var(--accent-cyan)',
                                            border: '1px solid rgba(0, 242, 254, 0.25)',
                                            padding: '0.1rem 0.45rem',
                                            borderRadius: '8px',
                                            fontWeight: 600
                                          }}
                                        >
                                          {t}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Registered</span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => onNavigate && onNavigate('player-profile', p.id)}
                        >
                          👤 Profile
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '1.75rem' }}>
        <h3 style={{ marginBottom: '0.8rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>ADMIN AUDIT LOG</h3>
        <div className="auth-card" style={{ maxWidth: '100%' }}>
          {auditEntries.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No administrative actions recorded yet.</p> : auditEntries.map(entry => (
            <div key={entry.id || Math.random()} style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
              <span><strong>{entry.admin_name || 'Admin'}</strong> · {(entry.action || '').replaceAll('_', ' ')} · {entry.entity_type || 'action'}</span>
              <span style={{ color: 'var(--text-muted)' }}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
