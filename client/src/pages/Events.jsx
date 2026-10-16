import React, { useEffect, useState } from 'react';
import { Alert } from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getAuthHeaders } from '../utils/authFetch';

const categoryLabel = { tournament: '🏆 Tournament', match: '⚽ Match', notice: '📣 Notice' };
const orderAnnouncements = (items) => [...items].sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)));

export const Events = () => {
  const { token } = useAuth();
  const { socket } = useSocket();
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/announcements', { headers: getAuthHeaders(token) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load events');
        setAnnouncements(data.announcements || []);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    load();
  }, [token]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (a) => setAnnouncements((items) => orderAnnouncements([a, ...items]));
    const onUpdated = (a) => setAnnouncements((items) => orderAnnouncements(items.map((i) => (i.id === a.id ? { ...i, ...a } : i))));
    const onDeleted = ({ id }) => setAnnouncements((items) => items.filter((i) => i.id !== id));
    socket.on('announcement:new', onNew);
    socket.on('announcement:updated', onUpdated);
    socket.on('announcement:deleted', onDeleted);
    return () => {
      socket.off('announcement:new', onNew);
      socket.off('announcement:updated', onUpdated);
      socket.off('announcement:deleted', onDeleted);
    };
  }, [socket]);

  return <div className="dashboard-container" style={{ maxWidth: '900px' }}>
    <div className="auth-header" style={{ textAlign: 'left', marginBottom: 0 }}><h1>📣 Tournament Events</h1><p>Official match dates, tournament updates, and important notices from the organizers.</p></div>
    <Alert type="error" message={error} />
    {loading ? <div className="auth-card">Loading event updates…</div> : announcements.length === 0 ? <div className="auth-card" style={{ textAlign: 'center' }}>No announcements have been posted yet.</div> : <div className="event-feed">
      {announcements.map((item) => <article className="event-card" key={item.id}>
        <div className="event-card-top"><span className={`role-pill ${item.category === 'match' ? 'player' : 'admin'}`}>{categoryLabel[item.category] || '📣 Notice'}</span><span>{item.is_pinned ? '📌 Pinned' : ''} {item.event_at && <time>🗓️ {new Date(item.event_at).toLocaleString()}</time>}</span></div>
        <h2>{item.title}</h2>
        <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {item.message?.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
            /(https?:\/\/[^\s]+)/.test(part) ? (
              <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'underline' }}>
                {part}
              </a>
            ) : part
          )}
        </p>
        {item.attachments?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            {item.attachments.some(a => a.type === 'poster' || a.url?.startsWith('data:image/')) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {item.attachments.filter(a => a.type === 'poster' || a.url?.startsWith('data:image/')).map((attachment, i) => (
                  <div key={attachment.id || `${attachment.url.slice(0, 30)}-${i}`} style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)' }}>
                    <a href={attachment.url} target="_blank" rel="noreferrer">
                      <img src={attachment.url} alt={attachment.label} style={{ width: '100%', maxHeight: '360px', objectFit: 'cover', display: 'block', transition: 'transform 0.2s' }} />
                    </a>
                    <div style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🖼️ {attachment.label}</span>
                      <a href={attachment.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', fontSize: '0.72rem' }}>Full view ↗</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {item.attachments.filter(a => a.type !== 'poster' && !a.url?.startsWith('data:image/')).map((attachment) => (
                <a className="btn btn-secondary btn-sm" key={attachment.id || attachment.url} href={attachment.url} target="_blank" rel="noreferrer">
                  {({ rules: '📄 Rules', venue_map: '🗺 Venue map', schedule: '📅 Schedule' }[attachment.type] || '📎 Attachment')} · {attachment.label}
                </a>
              ))}
            </div>
          </div>
        )}
        <small>Posted {new Date(item.created_at).toLocaleString()}{item.posted_by ? ` by ${item.posted_by}` : ''}{item.campus && item.campus !== 'all' ? ` · ${item.campus}` : ''}</small>
      </article>)}</div>}
  </div>;
};
