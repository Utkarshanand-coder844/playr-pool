import { ScoringEngine } from '../scoring/engine.js';
import { MatchModel } from '../models/matchModel.js';

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
  }
};
