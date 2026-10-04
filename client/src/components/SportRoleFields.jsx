import React from 'react';
import { SPORT_ROLES } from '../utils/sportRoles';

/**
 * Reusable component for rendering sport-specific role, position,
 * and playing style dropdowns for a single sport.
 */
export const SportRoleFields = ({ sport, profile = {}, onChange }) => {
  const config = SPORT_ROLES[sport];
  if (!config) return null;

  const sel = (field, options, label, required = false) => (
    <div style={{ marginTop: '0.4rem' }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
        {label}{required ? ' *' : ''}
      </label>
      <select
        className="form-select no-icon"
        style={{ padding: '0.55rem 0.75rem', minHeight: '40px' }}
        value={profile[field] || ''}
        onChange={e => onChange(field, e.target.value)}
      >
        <option value="">— Select {label} —</option>
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginTop: '0.6rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.75rem'
      }}
    >
      {/* Cricket */}
      {sport === 'Cricket' && (
        <>
          {sel('primary_role', config.primaryRoles, 'Primary Role', true)}
          {sel('batting_hand', config.battingHands, 'Batting Hand')}
          {sel('bowling_style', config.bowlingStyles, 'Bowling Style')}
        </>
      )}

      {/* Football / Futsal */}
      {(sport === 'Football' || sport === 'Futsal') && (
        <>
          {sel('position', config.positions, 'Position', true)}
          {sel('preferred_foot', config.preferredFoot, 'Preferred Foot')}
        </>
      )}

      {/* Basketball */}
      {sport === 'Basketball' && sel('position', config.positions, 'Position', true)}

      {/* Volleyball */}
      {sport === 'Volleyball' && sel('position', config.positions, 'Position', true)}

      {/* Badminton */}
      {sport === 'Badminton' && (
        <>
          {sel('event_category', config.categories, 'Category', true)}
          {sel('playing_style', config.playingStyles, 'Playing Style')}
          {sel('handedness', config.hands, 'Hand')}
        </>
      )}

      {/* Table Tennis */}
      {sport === 'Table Tennis' && (
        <>
          {sel('event_category', config.categories, 'Category', true)}
          {sel('playing_style', config.playingStyles, 'Playing Style')}
          {sel('handedness', config.hands, 'Hand')}
        </>
      )}

      {/* Athletics */}
      {sport === 'Athletics' && sel('event_category', config.events, 'Event / Category', true)}

      {/* Chess */}
      {sport === 'Chess' && sel('event_category', config.formats, 'Format', true)}
    </div>
  );
};
