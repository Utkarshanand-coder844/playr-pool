import { query } from '../config/db.js';
import { getIO } from '../config/socket.js';
import { MatchModel } from '../models/matchModel.js';
import { AuditLogModel } from '../models/auditLogModel.js';
import { derivePlayerStats } from './playerStats.js';

// Import sport plugins
import { initialCricketState, cricketReducer } from './plugins/cricket.js';
import { initialFootballState, footballReducer } from './plugins/football.js';
import { initialBasketballState, basketballReducer } from './plugins/basketball.js';
import { initialRacketState, racketReducer } from './plugins/racket.js';
import { initialKabaddiState, kabaddiReducer } from './plugins/kabaddi.js';
import { initialGenericState, genericReducer } from './plugins/generic.js';

/**
 * Identify the appropriate scoring plugin according to sport name
 */
export const getPluginForSport = (sportName = '') => {
  const s = String(sportName).toLowerCase().trim();

  if (s.includes('cricket')) {
    return {
      sport: 'Cricket',
      getInitialState: initialCricketState,
      reducer: cricketReducer
    };
  }
  if (s.includes('football') || s.includes('futsal') || s.includes('soccer')) {
    return {
      sport: 'Football',
      getInitialState: initialFootballState,
      reducer: footballReducer
    };
  }
  if (s.includes('basketball')) {
    return {
      sport: 'Basketball',
      getInitialState: initialBasketballState,
      reducer: basketballReducer
    };
  }
  if (s.includes('badminton') || s.includes('volleyball') || s.includes('table tennis') || s.includes('tt') || s.includes('tennis')) {
    return {
      sport: 'Racket/Net',
      getInitialState: initialRacketState,
      reducer: racketReducer
    };
  }
  if (s.includes('kabaddi')) {
    return {
      sport: 'Kabaddi',
      getInitialState: initialKabaddiState,
      reducer: kabaddiReducer
    };
  }

  // Generic / Board games / Chess / Carrom
  return {
    sport: 'Generic',
    getInitialState: initialGenericState,
    reducer: genericReducer
  };
};

/**
 * Derive full live state from an array of immutable events
 */
export const deriveStateFromEvents = (match, events = [], customRules = {}) => {
  const plugin = getPluginForSport(match.sport);
  let state = plugin.getInitialState(match, customRules);

  for (const event of events) {
    state = plugin.reducer(state, {
      type: event.event_type || event.type,
      payload: event.payload || {}
    });
  }

  return state;
};

/**
 * Helper to extract simplified team scores for backwards compatibility with Leaderboard & Standings
 */
export const extractDerivedScores = (sport, state, match) => {
  const s = String(sport).toLowerCase();
  let scoreA = 0;
  let scoreB = 0;

  if (s.includes('cricket')) {
    // For cricket: Team A runs & Team B runs based on who batted when
    if (state.innings1) {
      if (state.innings1.teamId === match.team_a_id) scoreA = state.innings1.totalRuns;
      else scoreB = state.innings1.totalRuns;
    }
    if (state.innings2) {
      if (state.innings2.teamId === match.team_a_id) scoreA = state.innings2.totalRuns;
      else scoreB = state.innings2.totalRuns;
    }
  } else if (s.includes('football') || s.includes('futsal') || s.includes('soccer')) {
    scoreA = state.teamA?.score || 0;
    scoreB = state.teamB?.score || 0;
  } else if (s.includes('basketball')) {
    scoreA = state.teamA?.score || 0;
    scoreB = state.teamB?.score || 0;
  } else if (s.includes('badminton') || s.includes('volleyball') || s.includes('table tennis') || s.includes('tennis')) {
    scoreA = state.teamA?.setsWon || 0;
    scoreB = state.teamB?.setsWon || 0;
  } else if (s.includes('kabaddi')) {
    scoreA = state.teamA?.score || 0;
    scoreB = state.teamB?.score || 0;
  } else {
    scoreA = state.teamA?.score || 0;
    scoreB = state.teamB?.score || 0;
  }

  return { scoreA, scoreB };
};

async function resolveValidAdminId(providedId) {
  if (providedId) {
    try {
      const { rows } = await query('SELECT id FROM users WHERE id = $1', [providedId]);
      if (rows && rows.length > 0) return rows[0].id;
    } catch (_) {}
  }
  try {
    const adminCheck = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows && adminCheck.rows.length > 0) return adminCheck.rows[0].id;
    const anyUser = await query('SELECT id FROM users LIMIT 1');
    if (anyUser.rows && anyUser.rows.length > 0) return anyUser.rows[0].id;
  } catch (_) {}
  return null;
}

/**
 * Persist derived player stats to player_match_points.
 * Called after every event, undo, or reset — fully idempotent.
 * Only rows with real user IDs (not 'name_...' or 'p_...' guest keys) are stored.
 */
async function persistPlayerStats(matchId, sport, liveState, match) {
  try {
    const playerRows = derivePlayerStats(sport, liveState, match);

    // Filter to real user IDs only (UUID-like, not name_ or p_ prefixes)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const realPlayers = playerRows.filter(p => p.playerId && uuidPattern.test(p.playerId));

    if (realPlayers.length === 0) return;

    // Delete existing rows for this match (idempotent)
    await query('DELETE FROM player_match_points WHERE match_id = $1', [matchId]);

    // Upsert each real player
    for (const p of realPlayers) {
      await query(
        `INSERT INTO player_match_points (match_id, player_id, team_id, sport, fantasy_points, stats, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (match_id, player_id) DO UPDATE
           SET team_id = EXCLUDED.team_id,
               sport = EXCLUDED.sport,
               fantasy_points = EXCLUDED.fantasy_points,
               stats = EXCLUDED.stats,
               updated_at = CURRENT_TIMESTAMP`,
        [matchId, p.playerId, p.teamId, p.sport, Math.round(p.fantasyPoints), JSON.stringify(p.stats)]
      );
    }

    // Emit socket event so clients can refresh player stats
    const io = getIO();
    io.emit('player:stats_update', { matchId });
  } catch (err) {
    console.warn('persistPlayerStats warning:', err.message);
  }
}

/**
 * Event-Sourced Scoring Engine API
 */
export const ScoringEngine = {
  /**
   * Fetch all raw events for a match
   */
  async getEvents(matchId) {
    const text = 'SELECT id, match_id, event_type, payload, admin_id, created_at FROM match_events WHERE match_id = $1 ORDER BY created_at ASC;';
    const { rows } = await query(text, [matchId]);
    return rows;
  },

  /**
   * Get full live state for a match
   */
  async getLiveMatchState(matchId) {
    const match = await MatchModel.getMatchById(matchId);
    if (!match) return null;

    const events = await this.getEvents(matchId);
    const liveState = deriveStateFromEvents(match, events);

    return {
      match,
      events,
      liveState,
      eventCount: events.length
    };
  },

  /**
   * Record a new scoring event (single action)
   */
  async recordEvent(matchId, adminId, eventType, payload = {}) {
    const match = await MatchModel.getMatchById(matchId);
    if (!match) throw new Error('Match not found');

    const validAdminId = await resolveValidAdminId(adminId);

    // 1. Insert event into ledger
    const text = `
      INSERT INTO match_events (match_id, event_type, payload, admin_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, match_id, event_type, payload, admin_id, created_at;
    `;
    const { rows } = await query(text, [matchId, eventType, JSON.stringify(payload), validAdminId]);
    const recordedEvent = rows[0];

    // 2. Derive new live state
    const allEvents = await this.getEvents(matchId);
    const liveState = deriveStateFromEvents(match, allEvents);

    // 3. Sync match status and scores for tournament standings
    const { scoreA, scoreB } = extractDerivedScores(match.sport, liveState, match);

    if (validAdminId) {
      try {
        if (match.team_a_id) {
          await MatchModel.upsertScore({
            team_id: match.team_a_id,
            match_id: match.id,
            points: scoreA,
            updated_by: validAdminId
          });
        }
        if (match.team_b_id) {
          await MatchModel.upsertScore({
            team_id: match.team_b_id,
            match_id: match.id,
            points: scoreB,
            updated_by: validAdminId
          });
        }
      } catch (scoreErr) {
        console.warn('Upsert score warning:', scoreErr.message);
      }
    }

    // Auto-transition match status to live if it was upcoming
    let newStatus = match.status;
    if (match.status === 'upcoming') {
      newStatus = 'live';
      await MatchModel.updateMatchStatus(match.id, 'live');
    }
    if (liveState.isCompleted && match.status !== 'completed') {
      newStatus = 'completed';
      await MatchModel.updateMatchStatus(match.id, 'completed');
    }

    // 4. Real-time broadcasting via Socket.io (< 500ms latency)
    const io = getIO();
    const broadcastPayload = {
      matchId,
      liveState,
      lastEvent: recordedEvent,
      scoreA,
      scoreB,
      status: newStatus,
      isUndo: false
    };

    io.to(`match:${matchId}`).emit('match:live_state', broadcastPayload);
    io.emit('match:live_update', broadcastPayload);
    io.emit('match:score', {
      match_id: matchId,
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      team_a_score: scoreA,
      team_b_score: scoreB
    });
    if (newStatus !== match.status) {
      io.emit('match:status', { match_id: matchId, status: newStatus });
    }

    // 5. Persist player fantasy points (async, non-blocking)
    persistPlayerStats(matchId, match.sport, liveState, match);

    // Audit log
    if (validAdminId) {
      try {
        AuditLogModel.record({
          adminId: validAdminId,
          action: 'RECORD_SCORE_EVENT',
          entityType: 'match',
          entityId: matchId,
          details: { eventType, payload, scoreA, scoreB }
        });
      } catch (_) {}
    }

    return {
      success: true,
      event: recordedEvent,
      liveState,
      scoreA,
      scoreB,
      status: newStatus
    };
  },

  /**
   * Undo the latest scoring event (essential for live scoring mistakes)
   */
  async undoLastEvent(matchId, adminId) {
    const match = await MatchModel.getMatchById(matchId);
    if (!match) throw new Error('Match not found');

    const events = await this.getEvents(matchId);
    if (!events.length) {
      throw new Error('No events to undo for this match');
    }

    const validAdminId = await resolveValidAdminId(adminId);

    // Remove the most recent event
    const lastEvent = events[events.length - 1];
    await query('DELETE FROM match_events WHERE id = $1;', [lastEvent.id]);

    // Re-derive state without the undone event
    const remainingEvents = await this.getEvents(matchId);
    const liveState = deriveStateFromEvents(match, remainingEvents);

    // Sync score totals
    const { scoreA, scoreB } = extractDerivedScores(match.sport, liveState, match);

    if (validAdminId) {
      try {
        if (match.team_a_id) {
          await MatchModel.upsertScore({
            team_id: match.team_a_id,
            match_id: match.id,
            points: scoreA,
            updated_by: validAdminId
          });
        }
        if (match.team_b_id) {
          await MatchModel.upsertScore({
            team_id: match.team_b_id,
            match_id: match.id,
            points: scoreB,
            updated_by: validAdminId
          });
        }
      } catch (scoreErr) {
        console.warn('Upsert score warning:', scoreErr.message);
      }
    }

    // Broadcast updated state
    const io = getIO();
    const broadcastPayload = {
      matchId,
      liveState,
      lastEvent: null,
      scoreA,
      scoreB,
      status: match.status,
      isUndo: true,
      undoneEvent: lastEvent
    };

    io.to(`match:${matchId}`).emit('match:live_state', broadcastPayload);
    io.emit('match:live_update', broadcastPayload);
    io.emit('match:score', {
      match_id: matchId,
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      team_a_score: scoreA,
      team_b_score: scoreB
    });

    // Re-persist player stats after undo (idempotent)
    persistPlayerStats(matchId, match.sport, liveState, match);

    if (validAdminId) {
      try {
        AuditLogModel.record({
          adminId: validAdminId,
          action: 'UNDO_SCORE_EVENT',
          entityType: 'match',
          entityId: matchId,
          details: { undoneEventId: lastEvent.id, eventType: lastEvent.event_type }
        });
      } catch (_) {}
    }

    return {
      success: true,
      undoneEvent: lastEvent,
      liveState,
      scoreA,
      scoreB
    };
  },

  /**
   * Reset match events for a fresh restart
   */
  async resetMatch(matchId, adminId) {
    await query('DELETE FROM match_events WHERE match_id = $1;', [matchId]);
    await query('DELETE FROM player_match_points WHERE match_id = $1;', [matchId]).catch(() => {});
    const io = getIO();
    io.emit('player:stats_update', { matchId });
    return await this.getLiveMatchState(matchId);
  }
};
