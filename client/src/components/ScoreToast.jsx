import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export const ScoreToast = () => {
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !user || !socket) return;

    const onScore = (payload) => {
      setNotification({ type: 'score', ...payload });
      setTimeout(() => setNotification(null), 5000);
    };
    const onAnnouncement = (payload) => {
      setNotification(payload);
      setTimeout(() => setNotification(null), 5000);
    };
    const onSecurity = (payload) => {
      setNotification({ type: 'security', ...payload });
      setTimeout(() => setNotification(null), 7000);
    };
    const onTeam = (payload) => {
      setNotification({ type: 'team', ...payload });
      setTimeout(() => setNotification(null), 6000);
    };

    socket.on('score:update', onScore);
    socket.on('announcement:notification', onAnnouncement);
    socket.on('security:password-changed', onSecurity);
    socket.on('team:notification', onTeam);

    return () => {
      socket.off('score:update', onScore);
      socket.off('announcement:notification', onAnnouncement);
      socket.off('security:password-changed', onSecurity);
      socket.off('team:notification', onTeam);
    };
  }, [isAuthenticated, user, socket]);

  if (!notification) return null;

  const isAnnouncement = notification.type === 'announcement';
  const isSecurity = notification.type === 'security';
  const isTeam = notification.type === 'team';
  const announcement = notification.announcement;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '80px',
        right: '25px',
        zIndex: 9999,
        background: isSecurity
          ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.96), rgba(185, 28, 28, 0.96))'
          : isTeam
            ? 'linear-gradient(135deg, rgba(147, 51, 234, 0.96), rgba(79, 70, 229, 0.96))'
            : isAnnouncement
              ? 'linear-gradient(135deg, rgba(255, 193, 7, 0.96), rgba(255, 126, 95, 0.96))'
              : 'linear-gradient(135deg, rgba(0, 242, 254, 0.95), rgba(79, 172, 254, 0.95))',
        color: '#060a14',
        padding: '1rem 1.5rem',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 242, 254, 0.4)',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: '320px',
        animation: 'slideDown 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: '1.2rem' }} aria-hidden="true">
        {isSecurity ? '🔐' : isTeam ? '👥' : isAnnouncement ? '📣' : '🏆'}
      </span>
      <span>
        {isSecurity || isTeam ? (
          <>
            <strong>{notification.title}</strong>
            <br />
            {notification.message}
          </>
        ) : isAnnouncement ? (
          <>
            <strong>{announcement.title}</strong>
            <br />
            {announcement.message}
          </>
        ) : (
          <>
            Your team &ldquo;{notification.team_name}&rdquo; scored {notification.points} points!
          </>
        )}
      </span>
      <button
        onClick={() => setNotification(null)}
        aria-label="Dismiss notification"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#060a14',
          cursor: 'pointer',
          marginLeft: '0.25rem',
        }}
      >
        ✕
      </button>
    </div>
  );
};
