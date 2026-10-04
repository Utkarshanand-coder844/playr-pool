import { ScoringEngine } from '../scoring/engine.js';
import { MatchModel } from '../models/matchModel.js';
import { derivePlayerStats } from '../scoring/playerStats.js';
import { query } from '../config/db.js';

const getUserId = (req) => req.user?.id || req.user?.userId;

export const LiveScoringController = {
  /**
   * Get all matches with their derived live scoring states
   */
  async getAllLiveMatches(req, res) {
    try {
      const matches = await MatchModel.getAllMatches();
      const enriched = await Promise.all(
        matches.map(async (m) => {
          try {
            const data = await ScoringEngine.getLiveMatchState(m.id);
            return {
              ...m,
              liveState: data?.liveState || null,
              eventCount: data?.eventCount || 0
            };
          } catch {
            return { ...m, liveState: null, eventCount: 0 };
          }
        })
      );

      res.json({
        success: true,
        matches: enriched
      });
    } catch (err) {
      console.error('Failed to get live matches:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve live matches' });
    }
  },

  /**
   * Get detailed state & full event ledger for a single match
   */
  async getMatchLiveDetail(req, res) {
    try {
      const { matchId } = req.params;
      const data = await ScoringEngine.getLiveMatchState(matchId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Match not found' });
      }

      res.json({
        success: true,
        ...data
      });
    } catch (err) {
      console.error('Failed to get match live detail:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve match live state' });
    }
  },

  /**
   * Record a live scoring action (Admin only)
   */
  async recordEvent(req, res) {
    try {
      const { matchId } = req.params;
      const { eventType, payload } = req.body;

      if (!eventType || typeof eventType !== 'string') {
        return res.status(400).json({ success: false, message: 'eventType string is required' });
      }

      const result = await ScoringEngine.recordEvent(
        matchId,
        getUserId(req),
        eventType.toUpperCase().trim(),
        payload || {}
      );

      res.status(201).json(result);
    } catch (err) {
      console.error('Failed to record live score event:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to record event' });
    }
  },

  /**
   * Undo the latest scoring action (Admin only)
   */
  async undoEvent(req, res) {
    try {
      const { matchId } = req.params;
      const result = await ScoringEngine.undoLastEvent(matchId, getUserId(req));
      res.json(result);
    } catch (err) {
      console.error('Failed to undo live score event:', err);
      res.status(400).json({ success: false, message: err.message || 'Failed to undo event' });
    }
  },

  /**
   * Reset all events for a match (Admin only)
   */
  async resetMatch(req, res) {
    try {
      const { matchId } = req.params;
      const result = await ScoringEngine.resetMatch(matchId, getUserId(req));
      res.json({ success: true, message: 'Match score reset successfully', ...result });
    } catch (err) {
      console.error('Failed to reset match events:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to reset match' });
    }
  },

  /**
   * GET /:matchId/scorecard
   * Returns the full scorecard for a match (cricket format for cricket,
   * team/player breakdown for others).
   * Derives data from liveState — NO extra DB tables needed.
   */
  async getScorecard(req, res) {
    try {
      const { matchId } = req.params;
      const data = await ScoringEngine.getLiveMatchState(matchId);
      if (!data) return res.status(404).json({ success: false, message: 'Match not found' });

      const { liveState, match } = data;
      const sport = (match?.sport || 'Generic').toLowerCase();
      const playerRows = derivePlayerStats(match?.sport || 'Generic', liveState, match);

      let scorecard = { matchId, sport: match?.sport, status: match?.status, liveState };

      if (sport.includes('cricket')) {
        // Build cricket-style scorecard from innings state
        const buildInningsCard = (innings) => {
          if (!innings) return null;
          const batting = Object.values(innings.batsmen || {}).filter(b => !b.isFieldingOnlyCredit);
          const bowling = Object.values(innings.bowlers || {});
          return {
            teamId: innings.teamId,
            teamName: innings.teamName,
            totalRuns: innings.totalRuns,
            wickets: innings.wickets,
            oversFormatted: innings.oversFormatted,
            extras: innings.extras,
            batting,
            bowling,
            yetToBat: innings.yetToBat || [],
            fallOfWickets: innings.fallOfWickets || [],
            partnerships: innings.partnerships || []
          };
        };
        scorecard.innings1 = buildInningsCard(liveState?.innings1);
        scorecard.innings2 = buildInningsCard(liveState?.innings2);
        scorecard.target = liveState?.target;
        scorecard.resultText = liveState?.resultText;
      } else {
        // Non-cricket: team totals + player breakdown
        scorecard.teamA = liveState?.teamA;
        scorecard.teamB = liveState?.teamB;
        scorecard.players = playerRows;
        scorecard.resultText = liveState?.resultText;
        scorecard.timeline = (liveState?.timeline || []).slice(0, 30);
      }

      res.json({ success: true, scorecard });
    } catch (err) {
      console.error('getScorecard error:', err);
      res.status(500).json({ success: false, message: 'Failed to build scorecard' });
    }
  },

  /**
   * GET /:matchId/player-stats
   * Returns derived per-player fantasy points for a specific match.
   * Public — spectators can view.
   */
  async getPlayerMatchStats(req, res) {
    try {
      const { matchId } = req.params;
      const data = await ScoringEngine.getLiveMatchState(matchId);
      if (!data) return res.status(404).json({ success: false, message: 'Match not found' });

      const { liveState, match } = data;
      const playerRows = derivePlayerStats(match?.sport || 'Generic', liveState, match);

      // Sort by fantasy points descending
      const sorted = playerRows.sort((a, b) => b.fantasyPoints - a.fantasyPoints);

      res.json({
        success: true,
        matchId,
        sport: match?.sport,
        players: sorted
      });
    } catch (err) {
      console.error('getPlayerMatchStats error:', err);
      res.status(500).json({ success: false, message: 'Failed to get player match stats' });
    }
  },

  /**
   * GET /player/:playerId/stats
   * Returns all match stats for a player (from player_match_points table).
   * Used by PlayerInsights and PlayerProfile pages.
   */
  async getPlayerHistory(req, res) {
    try {
      const { playerId } = req.params;
      const { sport, limit = 20 } = req.query;

      let queryText, queryParams;
      if (sport) {
        queryText = `SELECT pmp.*, m.name as match_name, m.sport, m.status, m.match_date,
                     t.name as team_name
                     FROM player_match_points pmp
                     LEFT JOIN matches m ON m.id = pmp.match_id
                     LEFT JOIN teams t ON t.id = pmp.team_id
                     WHERE pmp.player_id = $1 AND LOWER(pmp.sport) LIKE $2
                     ORDER BY m.match_date DESC NULLS LAST
                     LIMIT $3`;
        queryParams = [playerId, `%${sport.toLowerCase()}%`, Number(limit)];
      } else {
        queryText = `SELECT pmp.*, m.name as match_name, m.sport, m.status, m.match_date,
                     t.name as team_name
                     FROM player_match_points pmp
                     LEFT JOIN matches m ON m.id = pmp.match_id
                     LEFT JOIN teams t ON t.id = pmp.team_id
                     WHERE pmp.player_id = $1
                     ORDER BY m.match_date DESC NULLS LAST
                     LIMIT $2`;
        queryParams = [playerId, Number(limit)];
      }

      const { rows } = await query(queryText, queryParams);

      // Compute summary stats
      const totalFP = rows.reduce((sum, r) => sum + (r.fantasy_points || 0), 0);
      const avgFP = rows.length > 0 ? Math.round(totalFP / rows.length) : 0;
      const bestFP = rows.length > 0 ? Math.max(...rows.map(r => r.fantasy_points || 0)) : 0;

      // Compute trend: last 5 vs previous 5
      const trend = rows.slice(0, 5).map(r => r.fantasy_points || 0);

      res.json({
        success: true,
        playerId,
        matches: rows,
        summary: {
          totalMatches: rows.length,
          totalFantasyPoints: totalFP,
          avgFantasyPoints: avgFP,
          bestSingleMatchFP: bestFP,
          recentTrend: trend
        }
      });
    } catch (err) {
      console.error('getPlayerHistory error:', err);
      res.status(500).json({ success: false, message: 'Failed to get player history' });
    }
  }
};
