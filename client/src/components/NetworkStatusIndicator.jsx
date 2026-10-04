import React, { useState, useEffect } from 'react';

/**
 * NetworkStatusIndicator
 * Real-time connection quality and offline monitor.
 * Informs users when they lose internet connection or experience high latency (2G / slow network).
 */
export const NetworkStatusIndicator = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSlow, setIsSlow] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check Network Information API if supported
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const checkSpeed = () => {
      if (connection) {
        const slowTypes = ['slow-2g', '2g'];
        const isSlowConn = slowTypes.includes(connection.effectiveType) || connection.rtt > 1500;
        setIsSlow(Boolean(isSlowConn));
      }
    };

    if (connection) {
      checkSpeed();
      connection.addEventListener('change', checkSpeed);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) connection.removeEventListener('change', checkSpeed);
    };
  }, []);

  if (isOnline && !isSlow && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '999px',
        fontSize: '0.85rem',
        fontWeight: '600',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        animation: 'fadeIn 0.3s ease-out',
        color: '#ffffff',
        background: !isOnline
          ? 'rgba(239, 68, 68, 0.92)'
          : isSlow
          ? 'rgba(245, 158, 11, 0.92)'
          : 'rgba(16, 185, 129, 0.92)'
      }}
    >
      <span style={{ fontSize: '1rem' }}>
        {!isOnline ? '📡' : isSlow ? '⏳' : '⚡'}
      </span>
      <span>
        {!isOnline
          ? 'Offline — changes will sync once connection is restored'
          : isSlow
          ? 'Slow internet detected — scores may take longer to refresh'
          : 'Back online — real-time updates active'}
      </span>
    </div>
  );
};
