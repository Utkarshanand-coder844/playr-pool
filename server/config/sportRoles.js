/**
 * Canonical sport-role definitions for CampusClash.
 * This file is the single source of truth for all valid role values.
 * The backend uses it to validate submitted player profiles;
 * the frontend mirrors it in client/src/utils/sportRoles.js.
 */

export const SPORT_ROLES = {
  Cricket: {
    primaryRoles: [
      'Batter',
      'Wicketkeeper Batter',
      'Batting All-rounder',
      'Bowling All-rounder',
      'Bowler',
    ],
    battingHands: ['Right-hand Batter', 'Left-hand Batter', 'Not applicable'],
    bowlingStyles: [
      'Right-arm Fast',
      'Right-arm Medium Fast',
      'Right-arm Medium',
      'Right-arm Off Spin',
      'Right-arm Leg Spin',
      'Left-arm Fast',
      'Left-arm Medium Fast',
      'Left-arm Orthodox Spin',
      'Left-arm Wrist Spin',
      'None / Does not bowl',
    ],
  },

  Football: {
    positions: [
      'Goalkeeper',
      'Centre Back',
      'Full Back',
      'Wing Back',
      'Defensive Midfielder',
      'Central Midfielder',
      'Attacking Midfielder',
      'Winger',
      'Forward',
      'Striker',
    ],
    preferredFoot: ['Right-footed', 'Left-footed', 'Both'],
  },

  Futsal: {
    positions: [
      'Goalkeeper',
      'Centre Back',
      'Full Back',
      'Wing Back',
      'Defensive Midfielder',
      'Central Midfielder',
      'Attacking Midfielder',
      'Winger',
      'Forward',
      'Striker',
    ],
    preferredFoot: ['Right-footed', 'Left-footed', 'Both'],
  },

  Basketball: {
    positions: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  },

  Volleyball: {
    positions: [
      'Setter',
      'Outside Hitter',
      'Opposite Hitter',
      'Middle Blocker',
      'Libero',
      'Defensive Specialist',
    ],
  },

  Badminton: {
    categories: ['Singles', 'Doubles', 'Mixed Doubles'],
    playingStyles: ['Attacking', 'Defensive', 'All-round'],
    hands: ['Right-handed', 'Left-handed'],
  },

  'Table Tennis': {
    categories: ['Singles', 'Doubles'],
    playingStyles: ['Attacker', 'Defender', 'All-round'],
    hands: ['Right-handed', 'Left-handed'],
  },

  Athletics: {
    events: [
      '100m',
      '200m',
      '400m',
      '800m',
      '1500m',
      'Long Distance',
      'Hurdles',
      'Relay',
      'Long Jump',
      'High Jump',
      'Triple Jump',
      'Shot Put',
      'Discus Throw',
      'Javelin Throw',
    ],
  },

  Chess: {
    formats: ['Classical', 'Rapid', 'Blitz', 'Bullet', 'Open / General'],
  },
};

/** All sports that have a defined role config */
export const SUPPORTED_SPORTS = Object.keys(SPORT_ROLES);

/**
 * Validate a sport profile object against the canonical config.
 * Returns null on success or an error string on failure.
 * @param {string} sport
 * @param {object} profile
 * @returns {string|null}
 */
export function validateSportProfile(sport, profile) {
  const config = SPORT_ROLES[sport];
  if (!config) return null; // unknown sports are allowed, no role validation needed

  if (sport === 'Cricket') {
    if (profile.primary_role && !config.primaryRoles.includes(profile.primary_role)) {
      return `Invalid primary role for Cricket: "${profile.primary_role}"`;
    }
    if (profile.batting_hand && !config.battingHands.includes(profile.batting_hand)) {
      return `Invalid batting hand: "${profile.batting_hand}"`;
    }
    if (profile.bowling_style && !config.bowlingStyles.includes(profile.bowling_style)) {
      return `Invalid bowling style: "${profile.bowling_style}"`;
    }
  }

  if (sport === 'Football' || sport === 'Futsal') {
    if (profile.position && !config.positions.includes(profile.position)) {
      return `Invalid position for ${sport}: "${profile.position}"`;
    }
    if (profile.preferred_foot && !config.preferredFoot.includes(profile.preferred_foot)) {
      return `Invalid preferred foot: "${profile.preferred_foot}"`;
    }
  }

  if (sport === 'Basketball' || sport === 'Volleyball') {
    if (profile.position && !config.positions.includes(profile.position)) {
      return `Invalid position for ${sport}: "${profile.position}"`;
    }
  }

  if (sport === 'Badminton' || sport === 'Table Tennis') {
    if (profile.event_category && !config.categories.includes(profile.event_category)) {
      return `Invalid category for ${sport}: "${profile.event_category}"`;
    }
    if (profile.playing_style && !config.playingStyles.includes(profile.playing_style)) {
      return `Invalid playing style: "${profile.playing_style}"`;
    }
    if (profile.handedness && !config.hands.includes(profile.handedness)) {
      return `Invalid handedness: "${profile.handedness}"`;
    }
  }

  if (sport === 'Athletics') {
    if (profile.event_category && !config.events.includes(profile.event_category)) {
      return `Invalid athletics event: "${profile.event_category}"`;
    }
  }

  if (sport === 'Chess') {
    if (profile.event_category && !config.formats.includes(profile.event_category)) {
      return `Invalid chess format: "${profile.event_category}"`;
    }
  }

  return null;
}

/**
 * Build a human-readable summary of a player's sport profile.
 * Used in admin views and team creation.
 * @param {string} sport
 * @param {object} profile
 * @returns {string[]} array of display labels
 */
export function formatSportProfile(sport, profile) {
  if (!profile) return [];
  const labels = [];

  if (profile.primary_role) labels.push(profile.primary_role);
  if (profile.position) labels.push(profile.position);
  if (profile.event_category) labels.push(profile.event_category);
  if (profile.batting_hand) labels.push(profile.batting_hand);
  if (profile.bowling_style) labels.push(profile.bowling_style);
  if (profile.playing_style) labels.push(profile.playing_style);
  if (profile.handedness) labels.push(profile.handedness);
  if (profile.preferred_foot) labels.push(profile.preferred_foot);

  return labels;
}
