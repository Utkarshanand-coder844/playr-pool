import React from 'react';

export const AdminRemovalPoll = ({
  pollData,
  pollLoading,
  pollVoting,
  pollError,
  pollSuccess,
  castVote,
  fetchPollStatus,
  team,
  user
}) => {
  if (!pollData || !team) return null;

  const currentUserId = user?.id || user?.userId;
  const isOwner = currentUserId === team.owner_user_id;

  const {
    votes_cast = 0,
    votes_needed = 0,
    eligible_voters = 0,
    percent_reached = 0
  } = pollData.vote_summary || {};
  const pct = Math.min(100, Number(percent_reached) || 0);

  return (
    <div
      className="auth-card"
      style={{
        maxWidth: '100%',
        border: '1px solid rgba(244, 63, 94, 0.3)',
        background: 'rgba(244, 63, 94, 0.04)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              color: '#fb7185',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            🗳️ Captain / Admin Removal Poll
          </h3>
          <p
            style={{
              margin: '0.35rem 0 0',
              color: 'var(--text-muted)',
              fontSize: '0.86rem'
            }}
          >
            A 2/3 majority vote of verified roster members will immediately
            remove this admin and transfer ownership to the longest-standing member.
          </p>
        </div>
        <span
          style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            color: '#fb7185',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.25rem 0.65rem',
            borderRadius: '999px',
            letterSpacing: '0.04em'
          }}
        >
          ACTIVE POLL
        </span>
      </div>

      <div
        style={{
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '8px',
          padding: '0.85rem 1rem',
          marginBottom: '1rem'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
            fontSize: '0.88rem'
          }}
        >
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
            Progress towards 2/3 majority
          </span>
          <span
            style={{
              color: '#fb7185',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)'
            }}
          >
            {votes_cast} / {votes_needed} votes needed ({eligible_voters} eligible)
          </span>
        </div>
        <div
          style={{
            height: '8px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '999px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background:
                pct >= 100
                  ? 'var(--accent-emerald)'
                  : 'linear-gradient(90deg, #fb7185, #f43f5e)',
              borderRadius: '999px',
              transition: 'width 0.5s ease'
            }}
          />
        </div>
        {eligible_voters < 3 && (
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.78rem',
              color: 'var(--text-muted)'
            }}
          >
            ⚠️ At least 3 non-admin roster members are required to activate this poll.
          </p>
        )}
      </div>

      {pollError && (
        <div
          className="alert alert-error"
          style={{
            padding: '0.6rem 1rem',
            marginBottom: '0.75rem',
            fontSize: '0.84rem'
          }}
        >
          {pollError}
        </div>
      )}
      {pollSuccess && (
        <div
          className="alert alert-success"
          style={{
            padding: '0.6rem 1rem',
            marginBottom: '0.75rem',
            fontSize: '0.84rem'
          }}
        >
          {pollSuccess}
        </div>
      )}

      {user && !isOwner && (
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          {pollData.has_voted ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                color: '#fb7185',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontSize: '0.84rem',
                fontWeight: 600
              }}
            >
              ✅ Your vote has been recorded
            </span>
          ) : (
            <button
              className="btn btn-danger btn-sm"
              onClick={castVote}
              disabled={pollVoting || eligible_voters < 3}
              style={{
                background: 'linear-gradient(135deg, #f43f5e, #be123c)',
                borderColor: 'transparent'
              }}
            >
              {pollVoting ? 'Casting vote…' : '🗳️ Vote to Remove Admin'}
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchPollStatus(team.id)}
            disabled={pollLoading}
          >
            🔄 Refresh
          </button>
        </div>
      )}

      {user && isOwner && (
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            You are the admin — you cannot vote in this poll.
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchPollStatus(team.id)}
            disabled={pollLoading}
          >
            🔄 Refresh
          </button>
        </div>
      )}
    </div>
  );
};
