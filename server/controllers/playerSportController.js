import { PlayerSportModel } from '../models/playerSportModel.js';
import { PlayerSportProfileModel } from '../models/playerSportProfileModel.js';
import { validateSportProfile } from '../config/sportRoles.js';

const userId = (req) => req.user.id || req.user.userId;

export const normalizeSports = (sports) =>
  Array.isArray(sports)
    ? [...new Set(sports.filter(s => typeof s === 'string').map(s => s.trim()).filter(s => s && s.length <= 60))]
    : [];

/** GET /api/player-sports/mine — list own registered sports */
export const getMySports = async (req, res) => {
  try {
    return res.json({ success: true, sports: await PlayerSportModel.getForUser(userId(req)) });
  } catch (error) {
    console.error('Get player sports error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load registered sports' });
  }
};

/** PUT /api/player-sports/mine — update own sport registrations */
export const updateMySports = async (req, res) => {
  try {
    // Both players and admins can manage their registered sports
    const sports = normalizeSports(req.body.sports);
    if (!sports.length) return res.status(400).json({ success: false, message: 'Select at least one sport.' });
    if (sports.length > 10) return res.status(400).json({ success: false, message: 'Select up to 10 sports.' });
    return res.json({ success: true, sports: await PlayerSportModel.replaceForUser({ userId: userId(req), sports }) });
  } catch (error) {
    console.error('Update player sports error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update registered sports' });
  }
};

/** GET /api/player-sports/profiles — get all own sport profiles */
export const getMyProfiles = async (req, res) => {
  try {
    const profiles = await PlayerSportProfileModel.getForUser(userId(req));
    // Convert array to map keyed by sport for frontend convenience
    const profileMap = {};
    for (const p of profiles) profileMap[p.sport] = p;
    return res.json({ success: true, profiles: profileMap });
  } catch (error) {
    console.error('Get player profiles error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load sport profiles' });
  }
};

/** GET /api/player-sports/profiles/:userId — get another player's sport profiles (for profile page) */
export const getProfilesForUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const profiles = await PlayerSportProfileModel.getForUser(targetId);
    const profileMap = {};
    for (const p of profiles) profileMap[p.sport] = p;
    return res.json({ success: true, profiles: profileMap });
  } catch (error) {
    console.error('Get profiles for user error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load sport profiles' });
  }
};

/** PUT /api/player-sports/profiles — update own sport profile for one sport */
export const updateMyProfile = async (req, res) => {
  try {
    // Both players and admins can update sport profiles


    const sport = typeof req.body.sport === 'string' ? req.body.sport.trim() : '';
    if (!sport || sport.length > 60) {
      return res.status(400).json({ success: false, message: 'A valid sport name is required.' });
    }

    // Server-side validation against canonical role config
    const validationError = validateSportProfile(sport, req.body);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const profile = await PlayerSportProfileModel.upsertProfile({
      userId: userId(req),
      sport,
      primary_role:    typeof req.body.primary_role === 'string' ? req.body.primary_role.trim() : null,
      batting_hand:    typeof req.body.batting_hand === 'string' ? req.body.batting_hand.trim() : null,
      bowling_style:   typeof req.body.bowling_style === 'string' ? req.body.bowling_style.trim() : null,
      position:        typeof req.body.position === 'string' ? req.body.position.trim() : null,
      playing_style:   typeof req.body.playing_style === 'string' ? req.body.playing_style.trim() : null,
      handedness:      typeof req.body.handedness === 'string' ? req.body.handedness.trim() : null,
      preferred_foot:  typeof req.body.preferred_foot === 'string' ? req.body.preferred_foot.trim() : null,
      event_category:  typeof req.body.event_category === 'string' ? req.body.event_category.trim() : null,
      extra_attributes: typeof req.body.extra_attributes === 'object' ? req.body.extra_attributes : {}
    });

    return res.json({ success: true, message: 'Sport profile updated.', profile });
  } catch (error) {
    console.error('Update player profile error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update sport profile' });
  }
};

/** PUT /api/player-sports/profiles/batch — save multiple sport profiles at once (used during signup) */
export const updateMyProfilesBatch = async (req, res) => {
  try {
    // Both players and admins can update sport profiles


    const { profiles } = req.body; // { Cricket: {...}, Football: {...} }
    if (!profiles || typeof profiles !== 'object') {
      return res.status(400).json({ success: false, message: 'Profiles must be an object keyed by sport.' });
    }

    const results = [];
    for (const [sport, data] of Object.entries(profiles)) {
      const normalizedSport = typeof sport === 'string' ? sport.trim() : '';
      if (!normalizedSport || normalizedSport.length > 60) continue;

      const validationError = validateSportProfile(normalizedSport, data);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }

      const saved = await PlayerSportProfileModel.upsertProfile({
        userId: userId(req),
        sport: normalizedSport,
        primary_role:   typeof data.primary_role === 'string' ? data.primary_role.trim() : null,
        batting_hand:   typeof data.batting_hand === 'string' ? data.batting_hand.trim() : null,
        bowling_style:  typeof data.bowling_style === 'string' ? data.bowling_style.trim() : null,
        position:       typeof data.position === 'string' ? data.position.trim() : null,
        playing_style:  typeof data.playing_style === 'string' ? data.playing_style.trim() : null,
        handedness:     typeof data.handedness === 'string' ? data.handedness.trim() : null,
        preferred_foot: typeof data.preferred_foot === 'string' ? data.preferred_foot.trim() : null,
        event_category: typeof data.event_category === 'string' ? data.event_category.trim() : null,
        extra_attributes: typeof data.extra_attributes === 'object' ? data.extra_attributes : {}
      });
      results.push(saved);
    }

    const profileMap = {};
    for (const p of results) profileMap[p.sport] = p;
    return res.json({ success: true, message: `${results.length} sport profile(s) saved.`, profiles: profileMap });
  } catch (error) {
    console.error('Batch update profiles error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save sport profiles' });
  }
};

/** GET /api/player-sports/players?sport=Cricket — players list with role data for a sport */
export const getPlayersForSport = async (req, res) => {
  try {
    const sport = typeof req.query.sport === 'string' ? req.query.sport.trim() : '';
    if (!sport) return res.status(400).json({ success: false, message: 'Sport is required.' });
    const players = await PlayerSportProfileModel.getPlayersWithProfileForSport(sport);
    return res.json({ success: true, players });
  } catch (error) {
    console.error('Get players for sport error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load players' });
  }
};
