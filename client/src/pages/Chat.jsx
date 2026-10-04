import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { getAuthHeaders } from '../utils/authFetch';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

export const Chat = ({ playerId: initialPlayerId }) => {
  const { user, token } = useAuth();
  const [players, setPlayers] = useState([]);
  const [activePlayerId, setActivePlayerId] = useState(initialPlayerId || '');
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch('/api/chat/players', { headers: getAuthHeaders(token) })
      .then(async res => ({ res, data: await res.json() }))
      .then(({ res, data }) => { if (!res.ok || !data.success) throw new Error(data.message); setPlayers(data.players || []); })
      .catch(err => setError(err.message));
  }, [token]);

  useEffect(() => { setActivePlayerId(initialPlayerId || ''); }, [initialPlayerId]);

  useEffect(() => {
    if (!activePlayerId || !token) { setMessages([]); return; }
    fetch(`/api/chat/${activePlayerId}`, { headers: getAuthHeaders(token) })
      .then(async res => ({ res, data: await res.json() }))
      .then(({ res, data }) => { if (!res.ok || !data.success) throw new Error(data.message); setMessages(data.messages || []); })
      .catch(err => setError(err.message));
  }, [activePlayerId, token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('connect', () => socket.emit('join:user'));
    socket.on('chat:message', message => { if (message.sender_id === activePlayerId) setMessages(items => [...items, message]); });
    return () => socket.disconnect();
  }, [token, activePlayerId]);

  const send = async event => {
    event.preventDefault();
    if (!body.trim() || !activePlayerId || !token) return;
    try {
      const res = await fetch(`/api/chat/${activePlayerId}`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      setMessages(items => [...items, data.message]);
      setBody('');
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activePlayer = players.find(player => player.id === activePlayerId);

  return (
    <div className="dashboard-container" style={{ maxWidth: '1100px' }}>
      <div className="auth-header" style={{ textAlign: 'left' }}>
        <h1>💬 Messages</h1>
        <p>Chat directly with registered players and administrators.</p>
      </div>
      <Alert type="error" message={error} />
      <style>{`
        .chat-layout-grid {
          display: grid;
          grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.5fr);
          gap: 1rem;
          width: 100%;
          box-sizing: border-box;
        }
        .chat-mobile-back-btn {
          display: none;
        }
        @media (max-width: 768px) {
          .chat-layout-grid {
            grid-template-columns: 1fr;
          }
          .chat-sidebar.mobile-hidden {
            display: none !important;
          }
          .chat-conversation.mobile-hidden {
            display: none !important;
          }
          .chat-mobile-back-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 0.85rem;
            padding: 0.4rem 0.85rem;
            border-radius: 100px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.06);
            color: #a1a1aa;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
          }
        }
      `}</style>
      <div className="chat-layout-grid">

        {/* Player List Sidebar */}
        <aside
          className={`auth-card chat-sidebar ${activePlayerId ? 'mobile-hidden' : ''}`}
          style={{ maxWidth: '100%', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          {/* Search Bar */}
          <div style={{ position: 'relative', marginBottom: '0.25rem' }}>
            <span style={{
              position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', fontSize: '0.95rem', pointerEvents: 'none'
            }}>🔍</span>
            <input
              type="text"
              placeholder="Search player by name…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.5rem 0.75rem 0.5rem 2.1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-primary)',
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent-cyan)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
            />
          </div>

          {/* Player List */}
          <div style={{ overflowY: 'auto', maxHeight: '460px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {filteredPlayers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>
                No players found.
              </p>
            ) : (
              filteredPlayers.map(player => (
                <button
                  key={player.id}
                  onClick={() => setActivePlayerId(player.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '8px',
                    border: `1px solid ${player.id === activePlayerId ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)'}`,
                    background: player.id === activePlayerId ? 'rgba(0,200,200,0.1)' : 'rgba(255,255,255,0.04)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    minWidth: 0,
                  }}
                  onMouseEnter={e => { if (player.id !== activePlayerId) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { if (player.id !== activePlayerId) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                >
                  <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{player.profile_photo ? '🧑' : '👤'}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontWeight: '600',
                      fontSize: '0.92rem',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {player.name}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {player.role} · {player.department} · {player.campus}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat Section */}
        <section className={`auth-card chat-conversation ${!activePlayerId ? 'mobile-hidden' : ''}`} style={{ maxWidth: '100%', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
          {activePlayer ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="chat-mobile-back-btn"
                  onClick={() => setActivePlayerId('')}
                >
                  ← All Players
                </button>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Chat with {activePlayer.name}</h3>
                <span className="role-pill player" style={{ fontSize: '0.72rem' }}>{activePlayer.campus}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '360px', paddingRight: '4px' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No messages yet. Send a message to start the conversation!
                  </div>
                ) : (
                  messages.map(message => (
                    <div
                      key={message.id}
                      style={{
                        alignSelf: message.sender_id === user.id ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '12px',
                        background: message.sender_id === user.id ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
                        color: message.sender_id === user.id ? '#07101c' : 'var(--text-primary)',
                        wordBreak: 'break-word'
                      }}
                    >
                      {message.body}
                      <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.7, fontSize: '0.68rem' }}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={send} style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
                <input
                  className="form-input no-icon"
                  value={body}
                  onChange={event => setBody(event.target.value)}
                  maxLength="1000"
                  placeholder="Write a message…"
                  style={{ fontSize: '16px' }}
                />
                <button className="btn btn-primary btn-sm" type="submit" style={{ minWidth: '70px' }}>Send</button>
              </form>
            </>
          ) : (
            <div style={{ margin: 'auto', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              💬 Select a player from the list to start chatting.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
