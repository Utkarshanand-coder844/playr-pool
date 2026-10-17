import React from 'react';
import { SPORT_LIST, formatSportProfile } from '../../../utils/sportRoles';

export const AdminAthleteDirectory = ({
  filteredPlayers = [],
  playerSearchQuery,
  setPlayerSearchQuery,
  playerSportFilter,
  setPlayerSportFilter,
  playerRoleFilter,
  setPlayerRoleFilter,
  availableRolesForFilter = [],
  exportCsv,
  onNavigate
}) => {
  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.4rem', color: '#fff', margin: 0 }}>
            🏅 Registered Athletes Directory & Roles
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              margin: '0.25rem 0 0'
            }}
          >
            Review all verified athletes and filter by enrolled sport and playing position.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => exportCsv('filtered-players', filteredPlayers)}
        >
          Export Filtered Athletes CSV
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div
        className="auth-card"
        style={{
          maxWidth: '100%',
          marginBottom: '1rem',
          padding: '1rem 1.25rem',
          background: 'rgba(18, 17, 21, 0.96)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'flex-end'
          }}
        >
          {/* Search input */}
          <div>
            <label
              className="form-label"
              style={{ marginBottom: '0.35rem', fontSize: '0.8rem' }}
            >
              Search Athlete
            </label>
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
            <label
              className="form-label"
              style={{ marginBottom: '0.35rem', fontSize: '0.8rem' }}
            >
              Sport
            </label>
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
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div>
            <label
              className="form-label"
              style={{ marginBottom: '0.35rem', fontSize: '0.8rem' }}
            >
              Playing Role / Position
            </label>
            <select
              className="form-select no-icon"
              value={playerRoleFilter}
              onChange={(e) => setPlayerRoleFilter(e.target.value)}
              disabled={
                playerSportFilter === 'All' &&
                availableRolesForFilter.length === 0
              }
            >
              <option value="All">All Roles / Positions</option>
              {availableRolesForFilter.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
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
      <div
        style={{
          background: 'rgba(18, 17, 21, 0.96)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)'
        }}
      >
        <table
          style={{
            width: '100%',
            minWidth: '650px',
            borderCollapse: 'collapse',
            textAlign: 'left'
          }}
        >
          <thead>
            <tr
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderBottom: '1px solid var(--border-subtle)'
              }}
            >
              <th
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}
              >
                Athlete
              </th>
              <th
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}
              >
                Dept / Year
              </th>
              <th
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}
              >
                Campus
              </th>
              <th
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}
              >
                Sport Roles & Attributes
              </th>
              <th
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    padding: '2.5rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)'
                  }}
                >
                  No registered athletes match the selected filters.
                </td>
              </tr>
            ) : (
              filteredPlayers.map((p) => {
                const profiles = p.sport_profiles || {};
                const enrolledSports = Object.keys(profiles);

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: 'rgba(255, 255, 255, 0.015)'
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#fff' }}>
                        {p.name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--accent-cyan)'
                        }}
                      >
                        {p.college_id}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '0.85rem 1rem',
                        fontSize: '0.85rem'
                      }}
                    >
                      <div>{p.department || '—'}</div>
                      <div
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem'
                        }}
                      >
                        {p.year}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '0.85rem 1rem',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {p.campus || 'Main Campus'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      {enrolledSports.length === 0 ? (
                        <span
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                            fontStyle: 'italic'
                          }}
                        >
                          No roles defined
                        </span>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem'
                          }}
                        >
                          {enrolledSports
                            .filter(
                              (sp) =>
                                playerSportFilter === 'All' ||
                                sp === playerSportFilter
                            )
                            .map((sp) => {
                              const prof = profiles[sp];
                              const tags = formatSportProfile(sp, prof);
                              return (
                                <div
                                  key={sp}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  <strong
                                    style={{ fontSize: '0.8rem', color: '#fff' }}
                                  >
                                    {sp}:
                                  </strong>
                                  {tags.length > 0 ? (
                                    tags.map((t, idx) => (
                                      <span
                                        key={idx}
                                        style={{
                                          fontSize: '0.7rem',
                                          background:
                                            'rgba(0, 242, 254, 0.12)',
                                          color: 'var(--accent-cyan)',
                                          border:
                                            '1px solid rgba(0, 242, 254, 0.25)',
                                          borderRadius: '4px',
                                          padding: '0.1rem 0.4rem',
                                          fontFamily: 'var(--font-mono)'
                                        }}
                                      >
                                        {t}
                                      </span>
                                    ))
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '0.72rem',
                                        color: 'var(--text-muted)'
                                      }}
                                    >
                                      Enrolled
                                    </span>
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
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => onNavigate && onNavigate('player-profile', p.id)}
                      >
                        View Profile
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
  );
};
