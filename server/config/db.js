import pg from 'pg';
import crypto from 'crypto';
import './env.js';

const { Pool } = pg;

let pool = null;
let isPgConnected = false;

// Fallback in-memory database store if PostgreSQL server is not currently reachable
const memoryStore = {
  users: [],
  teams: [],
  team_members: [],
  team_invites: [],
  team_requests: [],
  team_admin_removal_votes: [],
  player_stats: [],
  player_match_points: [],
  matches: [],
  scores: [],
  match_events: [],
  registration_deadlines: [],
  admin_audit_log: [],
  knockout_brackets: [],
  announcements: [],
  notifications: [],
  sport_admins: [],
  player_sports: [],
  player_sport_profiles: [],
  direct_messages: [],
  payments: [],
  processed_webhooks: [],
  settings: {
    tournament_started: false
  }
};

if (process.env.DATABASE_URL) {
  try {
    // Neon (and most managed Postgres hosts) always require an encrypted
    // connection, even outside production — detect it from the connection
    // string instead of relying on NODE_ENV alone.
    const requiresSSL =
      process.env.NODE_ENV === 'production' ||
      process.env.DATABASE_URL.includes('neon.tech') ||
      process.env.DATABASE_URL.includes('sslmode=require');

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000 // Neon's free tier sleeps when idle and needs a few seconds to wake up
    });

    pool.on('error', (err) => {
      console.warn('⚠️  PostgreSQL Pool warning:', err.message);
      isPgConnected = false;
    });
  } catch (err) {
    console.warn('⚠️  Failed to initialize PostgreSQL pool:', err.message);
  }
}

/**
 * Initialize Database tables in PostgreSQL or verify connection
 */
export const initDb = async () => {
  if (!pool) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production. Refusing to start with in-memory data.');
    console.log('ℹ️  Running with in-memory database store (PostgreSQL DATABASE_URL not set).');
    return;
  }

  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully.');
    isPgConnected = true;

    // Create tables if not exist
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
              CREATE TYPE user_role AS ENUM ('player', 'admin');
          END IF;
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN
              CREATE TYPE match_status AS ENUM ('upcoming', 'live', 'completed');
          END IF;
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          college_id VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          department VARCHAR(100) NOT NULL,
          campus VARCHAR(100) NOT NULL DEFAULT 'Main Campus',
          year VARCHAR(20) NOT NULL,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(25) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          profile_photo TEXT,
          password_reset_token_hash VARCHAR(64),
          password_reset_expires TIMESTAMPTZ,
          role VARCHAR(20) DEFAULT 'player' NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS campus VARCHAR(100) NOT NULL DEFAULT 'Main Campus';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

      CREATE TABLE IF NOT EXISTS teams (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sport VARCHAR(60) NOT NULL DEFAULT 'Football',
          locked BOOLEAN DEFAULT FALSE NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS sport VARCHAR(60) NOT NULL DEFAULT 'Football';
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT 'Main Campus';
      ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_owner_user_id_key;
      CREATE UNIQUE INDEX IF NOT EXISTS teams_owner_sport_unique ON teams (owner_user_id, sport);
      CREATE INDEX IF NOT EXISTS idx_teams_campus_sport ON teams(campus, sport);

      CREATE TABLE IF NOT EXISTS team_members (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          member_name VARCHAR(100) NOT NULL,
          member_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          position VARCHAR(50) DEFAULT 'Player',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      ALTER TABLE team_members ADD COLUMN IF NOT EXISTS member_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS team_members_registered_user_unique ON team_members (team_id, member_user_id) WHERE member_user_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS team_invites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          responded_at TIMESTAMPTZ,
          CONSTRAINT unique_team_invite UNIQUE (team_id, invited_user_id)
      );

      CREATE TABLE IF NOT EXISTS player_stats (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          stat_type VARCHAR(60) NOT NULL,
          value INTEGER NOT NULL DEFAULT 0,
          recorded_by UUID NOT NULL REFERENCES users(id),
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_player_match_stat UNIQUE (match_id, player_id, stat_type)
      );

      CREATE TABLE IF NOT EXISTS tournament_settings (
          key VARCHAR(50) PRIMARY KEY,
          value BOOLEAN DEFAULT FALSE NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      INSERT INTO tournament_settings (key, value)
      VALUES ('tournament_started', FALSE)
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS matches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(150) NOT NULL,
          match_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          status VARCHAR(20) DEFAULT 'upcoming' NOT NULL,
          sport VARCHAR(60) NOT NULL DEFAULT 'Football',
          team_a_id UUID REFERENCES teams(id) ON DELETE SET NULL,
          team_b_id UUID REFERENCES teams(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      ALTER TABLE matches ADD COLUMN IF NOT EXISTS sport VARCHAR(60) NOT NULL DEFAULT 'Football';
      ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_a_id UUID REFERENCES teams(id) ON DELETE SET NULL;
      ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_b_id UUID REFERENCES teams(id) ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS scores (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          points INTEGER NOT NULL DEFAULT 0,
          updated_by UUID NOT NULL REFERENCES users(id),
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_team_match UNIQUE (team_id, match_id)
      );

      CREATE TABLE IF NOT EXISTS registration_deadlines (
          sport VARCHAR(60) PRIMARY KEY,
          opens_at TIMESTAMPTZ,
          closes_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_audit_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_user_id UUID NOT NULL REFERENCES users(id),
          action VARCHAR(80) NOT NULL,
          entity_type VARCHAR(60) NOT NULL,
          entity_id UUID,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knockout_brackets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sport VARCHAR(60) NOT NULL,
          round_number INTEGER NOT NULL,
          slot_number INTEGER NOT NULL,
          match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          team_a_id UUID REFERENCES teams(id) ON DELETE SET NULL,
          team_b_id UUID REFERENCES teams(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_bracket_slot UNIQUE (sport, round_number, slot_number)
      );

      CREATE TABLE IF NOT EXISTS announcements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(120) NOT NULL,
          message VARCHAR(2000) NOT NULL,
          category VARCHAR(20) NOT NULL DEFAULT 'notice' CHECK (category IN ('tournament', 'match', 'notice')),
          event_at TIMESTAMPTZ,
          is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
          created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE announcements ADD COLUMN IF NOT EXISTS campus VARCHAR(100) NOT NULL DEFAULT 'all';
      CREATE INDEX IF NOT EXISTS idx_announcements_event_at ON announcements(event_at);
      CREATE INDEX IF NOT EXISTS idx_announcements_campus ON announcements(campus);

      CREATE TABLE IF NOT EXISTS event_attachments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
          label VARCHAR(120) NOT NULL,
          url TEXT NOT NULL,
          attachment_type VARCHAR(20) NOT NULL CHECK (attachment_type IN ('poster', 'rules', 'venue_map', 'schedule', 'other')),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_availability (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sport VARCHAR(60) NOT NULL,
          match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
          status VARCHAR(15) NOT NULL CHECK (status IN ('available', 'maybe', 'unavailable')),
          note VARCHAR(300),
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_player_match_availability UNIQUE (user_id, sport, match_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS unique_player_sport_general_availability ON player_availability (user_id, sport) WHERE match_id IS NULL;
      CREATE INDEX IF NOT EXISTS idx_availability_user_sport ON player_availability(user_id, sport);

      CREATE TABLE IF NOT EXISTS team_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          player_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          request_type VARCHAR(10) NOT NULL CHECK (request_type IN ('join', 'leave')),
          status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
          message VARCHAR(500),
          reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          reviewed_at TIMESTAMPTZ,
          CONSTRAINT unique_pending_team_request UNIQUE (team_id, player_user_id, request_type, status)
      );
      CREATE INDEX IF NOT EXISTS idx_team_requests_team_status ON team_requests(team_id, status);

      CREATE TABLE IF NOT EXISTS team_admin_removal_votes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          target_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_team_admin_removal_vote UNIQUE (team_id, target_admin_id, voter_user_id)
      );

      CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(30) NOT NULL,
          title VARCHAR(120) NOT NULL,
          message VARCHAR(2000) NOT NULL,
          announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS sport_admins (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sport VARCHAR(60) NOT NULL,
          admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_sport_admin UNIQUE (sport, admin_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sport_admins_sport ON sport_admins(sport);

      CREATE TABLE IF NOT EXISTS player_sports (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sport VARCHAR(60) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (user_id, sport)
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body VARCHAR(1000) NOT NULL,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CHECK (sender_id <> recipient_id)
      );
      CREATE INDEX IF NOT EXISTS idx_direct_messages_participants ON direct_messages(sender_id, recipient_id, created_at);

      CREATE TABLE IF NOT EXISTS player_sport_profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sport VARCHAR(60) NOT NULL,
          primary_role VARCHAR(100),
          batting_hand VARCHAR(60),
          bowling_style VARCHAR(100),
          position VARCHAR(100),
          playing_style VARCHAR(60),
          handedness VARCHAR(30),
          event_category VARCHAR(80),
          preferred_foot VARCHAR(30),
          extra_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_player_sport_profile UNIQUE (user_id, sport)
      );
      CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_user ON player_sport_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_sport ON player_sport_profiles(sport);
      CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_primary_role ON player_sport_profiles(sport, primary_role);
      CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_position ON player_sport_profiles(sport, position);

      CREATE TABLE IF NOT EXISTS match_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          event_type VARCHAR(60) NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          order_id VARCHAR(100) UNIQUE NOT NULL,
          payment_id VARCHAR(100),
          amount INTEGER NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          status VARCHAR(25) NOT NULL DEFAULT 'created',
          purpose VARCHAR(100) NOT NULL DEFAULT 'tournament_fee',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

      CREATE TABLE IF NOT EXISTS processed_webhooks (
          event_id VARCHAR(120) PRIMARY KEY,
          event_type VARCHAR(80) NOT NULL,
          processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_match_points (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
          sport VARCHAR(60) NOT NULL DEFAULT 'Generic',
          fantasy_points INTEGER NOT NULL DEFAULT 0,
          stats JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT unique_player_match_points UNIQUE (match_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_player_match_points_player ON player_match_points(player_id);
      CREATE INDEX IF NOT EXISTS idx_player_match_points_sport ON player_match_points(sport);
    `);
    client.release();
    console.log('✅ PostgreSQL all tournament tables verified/ready.');
  } catch (err) {
    isPgConnected = false;
    if (process.env.NODE_ENV === 'production') throw new Error(`PostgreSQL connection unavailable: ${err.message}`);
    console.warn(`⚠️  PostgreSQL connection unavailable (${err.message}).`);
    console.log('ℹ️  Seamlessly running with fast in-memory store so authentication & frontend work immediately.');
  }
};

/**
 * Universal query runner: executes against PostgreSQL if available,
 * or simulates against memoryStore for standard queries.
 */
export const query = async (text, params = []) => {
  if (isPgConnected && pool) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (err.code === '23505') {
        const detail = err.detail || '';
        if (detail.includes('owner_user_id')) {
          const error = new Error('You already own a team. Each player can only create one team.');
          error.code = '23505';
          throw error;
        }
        const error = new Error('Unique constraint violation');
        error.code = '23505';
        throw error;
      }
      throw err;
    }
  }

  // Fallback memory store query emulation
  const normalizedText = text.trim().toLowerCase();

  // --- TOURNAMENT SETTINGS ---
  if (normalizedText.includes('from tournament_settings')) {
    const key = params[0] || 'tournament_started';
    const val = memoryStore.settings[key] ?? false;
    return { rows: [{ key, value: val }] };
  }

  // --- REGISTRATION DEADLINES ---
  if (normalizedText.includes('from registration_deadlines')) {
    const sport = params[0];
    const rows = sport ? memoryStore.registration_deadlines.filter(item => item.sport === sport) : memoryStore.registration_deadlines;
    return { rows: rows.map(item => ({ ...item })) };
  }
  if (normalizedText.includes('insert into registration_deadlines')) {
    const [sport, opens_at, closes_at] = params;
    const existing = memoryStore.registration_deadlines.find(item => item.sport === sport);
    const deadline = { sport, opens_at: opens_at || null, closes_at: closes_at || null, updated_at: new Date().toISOString() };
    if (existing) Object.assign(existing, deadline); else memoryStore.registration_deadlines.push(deadline);
    return { rows: [{ ...(existing || deadline) }] };
  }

  // --- ADMIN AUDIT LOG ---
  if (normalizedText.includes('insert into admin_audit_log')) {
    const [admin_user_id, action, entity_type, entity_id, details] = params;
    const entry = { id: crypto.randomUUID(), admin_user_id, action, entity_type, entity_id, details: typeof details === 'string' ? JSON.parse(details) : details, created_at: new Date().toISOString() };
    memoryStore.admin_audit_log.push(entry);
    return { rows: [{ ...entry }] };
  }
  if (normalizedText.includes('from admin_audit_log')) {
    const limit = params[0] || 100;
    const rows = [...memoryStore.admin_audit_log].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map(entry => ({ ...entry, admin_name: memoryStore.users.find(user => user.id === entry.admin_user_id)?.name || 'Unknown admin' }));
    return { rows };
  }

  // --- KNOCKOUT BRACKETS ---
  if (normalizedText.includes('insert into knockout_brackets')) {
    const [sport, round_number, slot_number, match_id, team_a_id, team_b_id] = params;
    const entry = { id: crypto.randomUUID(), sport, round_number, slot_number, match_id, team_a_id, team_b_id, created_at: new Date().toISOString() };
    memoryStore.knockout_brackets.push(entry);
    return { rows: [{ ...entry }] };
  }
  if (normalizedText.includes('from knockout_brackets')) {
    const sport = params[0];
    const rows = memoryStore.knockout_brackets.filter(entry => entry.sport === sport).sort((a, b) => a.round_number - b.round_number || a.slot_number - b.slot_number).map(entry => {
      const teamA = memoryStore.teams.find(team => team.id === entry.team_a_id);
      const teamB = memoryStore.teams.find(team => team.id === entry.team_b_id);
      const match = memoryStore.matches.find(item => item.id === entry.match_id);
      return { ...entry, team_a_name: teamA?.name || null, team_b_name: teamB?.name || null, status: match?.status, match_date: match?.match_date };
    });
    return { rows };
  }

  if (normalizedText.includes('update tournament_settings') || (normalizedText.includes('insert into tournament_settings') && normalizedText.includes('on conflict'))) {
    const val = params[0];
    const key = params[1] || 'tournament_started';
    memoryStore.settings[key] = Boolean(val);
    return { rows: [{ key, value: memoryStore.settings[key] }] };
  }

  // --- MATCH EVENTS ---
  if (normalizedText.includes('insert into match_events')) {
    const [match_id, event_type, payload, admin_id] = params;
    const entry = {
      id: crypto.randomUUID(),
      match_id,
      event_type,
      payload: typeof payload === 'string' ? JSON.parse(payload) : (payload || {}),
      admin_id,
      created_at: new Date().toISOString()
    };
    memoryStore.match_events.push(entry);
    return { rows: [{ ...entry }] };
  }
  if (normalizedText.includes('from match_events') && normalizedText.includes('where match_id = $1')) {
    const matchId = params[0];
    const rows = (memoryStore.match_events || [])
      .filter(e => e.match_id === matchId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { rows: rows.map(r => ({ ...r })) };
  }
  if (normalizedText.includes('delete from match_events where id = $1')) {
    const id = params[0];
    const idx = (memoryStore.match_events || []).findIndex(e => e.id === id);
    if (idx !== -1) {
      const removed = memoryStore.match_events.splice(idx, 1);
      return { rows: removed };
    }
    return { rows: [] };
  }
  if (normalizedText.includes('delete from match_events where match_id = $1')) {
    const matchId = params[0];
    memoryStore.match_events = (memoryStore.match_events || []).filter(e => e.match_id !== matchId);
    return { rows: [] };
  }

  // --- SPORTS ADMINS ---
  // This precedes the users handler because the read query joins users.
  if (normalizedText.includes('from sport_admins')) {
    const rows = memoryStore.sport_admins.map(item => {
      const admin = memoryStore.users.find(user => user.id === item.admin_user_id);
      return { id: item.id, sport: item.sport, created_at: item.created_at, admin_id: item.admin_user_id, name: admin?.name || 'Unknown admin', email: admin?.email || '', phone: admin?.phone || '', department: admin?.department || '', campus: admin?.campus || 'Main Campus', profile_photo: admin?.profile_photo || null };
    }).sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name));
    return { rows };
  }

  // --- DIRECT MESSAGES ---
  if (normalizedText.includes('from direct_messages')) {
    if (normalizedText.includes('count(*)::int as count')) {
      const recipientId = params[0];
      const count = memoryStore.direct_messages.filter(item => item.recipient_id === recipientId && !item.read_at).length;
      return { rows: [{ count }] };
    }
    const [userId, peerId] = params;
    const rows = memoryStore.direct_messages.filter(item => (item.sender_id === userId && item.recipient_id === peerId) || (item.sender_id === peerId && item.recipient_id === userId)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(item => ({ ...item }));
    return { rows };
  }
  if (normalizedText.includes('insert into direct_messages')) {
    const [sender_id, recipient_id, body] = params;
    const message = { id: crypto.randomUUID(), sender_id, recipient_id, body, read_at: null, created_at: new Date().toISOString() };
    memoryStore.direct_messages.push(message);
    return { rows: [{ ...message }] };
  }
  if (normalizedText.includes('update direct_messages set read_at')) {
    const [peerId, userId] = params;
    const updated = memoryStore.direct_messages.filter(item => item.sender_id === peerId && item.recipient_id === userId && !item.read_at);
    updated.forEach(item => { item.read_at = new Date().toISOString(); });
    return { rows: updated.map(item => ({ id: item.id })) };
  }

  // --- PLAYER SPORTS ---
  if (normalizedText.includes('from player_sports')) {
    return { rows: memoryStore.player_sports.filter(item => item.user_id === params[0]).sort((a, b) => a.sport.localeCompare(b.sport)).map(item => ({ sport: item.sport })) };
  }
  if (normalizedText.includes('delete from player_sports')) {
    memoryStore.player_sports = memoryStore.player_sports.filter(item => item.user_id !== params[0]);
    return { rows: [] };
  }
  if (normalizedText.includes('insert into player_sports')) {
    const [user_id, sport] = params;
    if (!memoryStore.player_sports.some(item => item.user_id === user_id && item.sport === sport)) memoryStore.player_sports.push({ user_id, sport, created_at: new Date().toISOString() });
    return { rows: [{ sport }] };
  }

  // --- PLAYER SPORT PROFILES ---
  if (normalizedText.includes('insert into player_sport_profiles')) {
    const [userId, sport, primary_role, batting_hand, bowling_style, position, playing_style, handedness, preferred_foot, event_category, extra_attributes_raw] = params;
    let extra_attributes = {};
    if (typeof extra_attributes_raw === 'string') {
      try { extra_attributes = JSON.parse(extra_attributes_raw); } catch (e) { extra_attributes = {}; }
    } else if (extra_attributes_raw && typeof extra_attributes_raw === 'object') {
      extra_attributes = extra_attributes_raw;
    }

    let existing = memoryStore.player_sport_profiles.find(item => item.user_id === userId && item.sport === sport);
    if (existing) {
      existing.primary_role = primary_role || null;
      existing.batting_hand = batting_hand || null;
      existing.bowling_style = bowling_style || null;
      existing.position = position || null;
      existing.playing_style = playing_style || null;
      existing.handedness = handedness || null;
      existing.preferred_foot = preferred_foot || null;
      existing.event_category = event_category || null;
      existing.extra_attributes = extra_attributes;
      existing.updated_at = new Date().toISOString();
    } else {
      existing = {
        id: crypto.randomUUID(),
        user_id: userId,
        sport,
        primary_role: primary_role || null,
        batting_hand: batting_hand || null,
        bowling_style: bowling_style || null,
        position: position || null,
        playing_style: playing_style || null,
        handedness: handedness || null,
        preferred_foot: preferred_foot || null,
        event_category: event_category || null,
        extra_attributes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryStore.player_sport_profiles.push(existing);
    }
    return { rows: [{ ...existing }] };
  }

  if (normalizedText.includes('delete from player_sport_profiles')) {
    memoryStore.player_sport_profiles = memoryStore.player_sport_profiles.filter(p => p.user_id !== params[0]);
    return { rows: [] };
  }

  // getPlayersWithProfileForSport: SELECT ... FROM users u LEFT JOIN player_sport_profiles psp ON ...
  if (normalizedText.includes('from users u') && normalizedText.includes('player_sport_profiles psp')) {
    const sport = params[0];
    const players = memoryStore.users.filter(u => u.role === 'player').sort((a, b) => a.name.localeCompare(b.name));
    const rows = players.map(u => {
      const psp = memoryStore.player_sport_profiles.find(p => p.user_id === u.id && p.sport === sport) || {};
      return {
        id: u.id,
        name: u.name,
        college_id: u.college_id,
        department: u.department,
        year: u.year,
        campus: u.campus,
        primary_role: psp.primary_role || null,
        batting_hand: psp.batting_hand || null,
        bowling_style: psp.bowling_style || null,
        position: psp.position || null,
        playing_style: psp.playing_style || null,
        handedness: psp.handedness || null,
        preferred_foot: psp.preferred_foot || null,
        event_category: psp.event_category || null
      };
    });
    return { rows };
  }

  // searchByRole or searchByText: FROM player_sport_profiles psp JOIN users u
  if (normalizedText.includes('from player_sport_profiles psp') && normalizedText.includes('join users u')) {
    if (normalizedText.includes('psp.primary_role ilike $1 or')) {
      const rawTerm = (params[0] || '').replace(/%/g, '').toLowerCase();
      const rows = [];
      for (const psp of memoryStore.player_sport_profiles) {
        const u = memoryStore.users.find(user => user.id === psp.user_id);
        if (!u) continue;
        const matches = [
          psp.primary_role,
          psp.position,
          psp.bowling_style,
          psp.batting_hand,
          psp.playing_style,
          psp.handedness,
          psp.event_category,
          psp.preferred_foot
        ].some(val => val && val.toLowerCase().includes(rawTerm));
        if (matches) {
          rows.push({
            id: u.id,
            name: u.name,
            college_id: u.college_id,
            department: u.department,
            campus: u.campus,
            sport: psp.sport,
            primary_role: psp.primary_role,
            position: psp.position,
            bowling_style: psp.bowling_style,
            batting_hand: psp.batting_hand,
            playing_style: psp.playing_style,
            handedness: psp.handedness,
            event_category: psp.event_category
          });
        }
      }
      return { rows: rows.slice(0, 50) };
    }

    // searchByRole: sport = $1 and optional primary_role, position, bowling_style, batting_hand
    const sport = params[0];
    let filtered = memoryStore.player_sport_profiles.filter(p => p.sport.toLowerCase() === (sport || '').toLowerCase());
    let paramIdx = 1;
    if (normalizedText.includes('psp.primary_role ilike')) {
      const term = (params[paramIdx++] || '').replace(/%/g, '').toLowerCase();
      filtered = filtered.filter(p => p.primary_role && p.primary_role.toLowerCase().includes(term));
    }
    if (normalizedText.includes('psp.position ilike')) {
      const term = (params[paramIdx++] || '').replace(/%/g, '').toLowerCase();
      filtered = filtered.filter(p => p.position && p.position.toLowerCase().includes(term));
    }
    if (normalizedText.includes('psp.bowling_style ilike')) {
      const term = (params[paramIdx++] || '').replace(/%/g, '').toLowerCase();
      filtered = filtered.filter(p => p.bowling_style && p.bowling_style.toLowerCase().includes(term));
    }
    if (normalizedText.includes('psp.batting_hand ilike')) {
      const term = (params[paramIdx++] || '').replace(/%/g, '').toLowerCase();
      filtered = filtered.filter(p => p.batting_hand && p.batting_hand.toLowerCase().includes(term));
    }

    const rows = filtered.map(psp => {
      const u = memoryStore.users.find(user => user.id === psp.user_id) || {};
      return {
        id: u.id,
        name: u.name,
        college_id: u.college_id,
        department: u.department,
        year: u.year,
        campus: u.campus,
        email: u.email,
        phone: u.phone,
        sport: psp.sport,
        primary_role: psp.primary_role,
        batting_hand: psp.batting_hand,
        bowling_style: psp.bowling_style,
        position: psp.position,
        playing_style: psp.playing_style,
        handedness: psp.handedness,
        preferred_foot: psp.preferred_foot,
        event_category: psp.event_category
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { rows };
  }

  // SELECT * FROM player_sport_profiles
  if (normalizedText.includes('from player_sport_profiles')) {
    if (normalizedText.includes('where user_id = $1 and sport = $2')) {
      const [userId, sport] = params;
      const found = memoryStore.player_sport_profiles.find(p => p.user_id === userId && p.sport.toLowerCase() === (sport || '').toLowerCase());
      return { rows: found ? [{ ...found }] : [] };
    }
    if (normalizedText.includes('where user_id =') || normalizedText.includes('where user_id=')) {
      const userId = params[0];
      const rows = memoryStore.player_sport_profiles.filter(p => p.user_id === userId).sort((a, b) => a.sport.localeCompare(b.sport)).map(p => ({ ...p }));
      return { rows };
    }
    return { rows: memoryStore.player_sport_profiles.map(p => ({ ...p })) };
  }

  // --- USERS ---
  if (normalizedText.includes('from users')) {
    if (normalizedText.includes('where id =') || normalizedText.includes('where id=') || normalizedText.includes('where m.id =') || normalizedText.includes('where m.id=')) {
      const id = params[0];
      const user = memoryStore.users.find(u => u.id === id);
      if (normalizedText.includes('select id, name, department, year, profile_photo, role, created_at')) {
        return { rows: user ? [{ id: user.id, name: user.name, department: user.department, year: user.year, profile_photo: user.profile_photo || null, role: user.role, created_at: user.created_at }] : [] };
      }
      if (normalizedText.includes('select id, college_id, name, department, campus, year, email, phone, profile_photo, role, created_at')) {
        return { rows: user ? [{ id: user.id, college_id: user.college_id, name: user.name, department: user.department, campus: user.campus || 'Main Campus', year: user.year, email: user.email, phone: user.phone, profile_photo: user.profile_photo || null, role: user.role, created_at: user.created_at }] : [] };
      }
      return { rows: user ? [{ ...user }] : [] };
    }

    if ((normalizedText.includes('lower(college_id) =') || normalizedText.includes('college_id =') || normalizedText.includes('college_id=')) && normalizedText.includes('where')) {
      const collegeId = params[0];
      const user = memoryStore.users.find(u => u.college_id.toLowerCase() === (collegeId || '').toLowerCase());
      return { rows: user ? [{ ...user }] : [] };
    }
    if (normalizedText.includes('lower(email)') && normalizedText.includes('where')) {
      const email = params[0];
      const user = memoryStore.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
      return { rows: user ? [{ ...user }] : [] };
    }
    let users = normalizedText.includes("role = 'player'")
      ? memoryStore.users.filter(user => (user.role === 'player' || (normalizedText.includes('or id = $1') && user.id === params[0])) && (!normalizedText.includes('id <> $1') || user.id !== params[0]))
      : memoryStore.users;

    if (normalizedText.includes('name ilike') && params[0] && params[0] !== '%%') {
      const term = params[0].replace(/%/g, '').toLowerCase();
      users = users.filter(u =>
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.college_id && u.college_id.toLowerCase().includes(term)) ||
        (u.department && u.department.toLowerCase().includes(term))
      );
    }

    return { rows: users.filter(user => !normalizedText.includes('id <> $1') || user.id !== params[0]).map(user => ({ ...user })) };
  }

  if (normalizedText.includes('delete from users')) {
    const userId = params[0];
    const beforeCount = memoryStore.users.length;
    memoryStore.users = memoryStore.users.filter(u => u.id !== userId);
    memoryStore.player_sports = memoryStore.player_sports.filter(u => u.user_id !== userId);
    memoryStore.player_sport_profiles = memoryStore.player_sport_profiles.filter(u => u.user_id !== userId);
    memoryStore.team_members = memoryStore.team_members.filter(u => u.user_id !== userId && u.member_user_id !== userId);
    memoryStore.team_invites = memoryStore.team_invites.filter(u => u.invited_user_id !== userId && u.invited_by !== userId);
    memoryStore.player_stats = memoryStore.player_stats.filter(u => u.user_id !== userId);
    memoryStore.notifications = memoryStore.notifications.filter(u => u.user_id !== userId);
    memoryStore.direct_messages = memoryStore.direct_messages.filter(u => u.sender_id !== userId && u.recipient_id !== userId);
    const ownedTeams = memoryStore.teams.filter(t => t.owner_user_id === userId);
    for (const ot of ownedTeams) {
      memoryStore.teams = memoryStore.teams.filter(t => t.id !== ot.id);
      memoryStore.matches.forEach(m => {
        if (m.team_a_id === ot.id) m.team_a_id = null;
        if (m.team_b_id === ot.id) m.team_b_id = null;
      });
    }
    return { rows: beforeCount > memoryStore.users.length ? [{ id: userId }] : [] };
  }

  // --- NOTIFICATIONS ---
  if (normalizedText.includes('insert into notifications')) {
    let user_id, type, title, message, announcement_id;
    if (normalizedText.includes('(user_id, type, title, message)')) {
      [user_id, type, title, message] = params;
    } else {
      [user_id, title, message, announcement_id] = params;
      type = 'announcement';
    }
    const notification = { id: crypto.randomUUID(), user_id, type: type || 'announcement', title, message, announcement_id: announcement_id || null, read_at: null, created_at: new Date().toISOString() };
    memoryStore.notifications.push(notification);
    return { rows: [{ ...notification }] };
  }
  if (normalizedText.includes('from notifications')) {
    const userId = params[0];
    return { rows: memoryStore.notifications.filter(item => item.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map(item => ({ ...item })) };
  }
  if (normalizedText.includes('update notifications set read_at = coalesce')) {
    const item = memoryStore.notifications.find(notification => notification.id === params[0] && notification.user_id === params[1]);
    if (!item) return { rows: [] };
    item.read_at ||= new Date().toISOString();
    return { rows: [{ ...item }] };
  }
  if (normalizedText.includes('update notifications set read_at = current_timestamp')) {
    const updated = memoryStore.notifications.filter(item => item.user_id === params[0] && !item.read_at);
    updated.forEach(item => { item.read_at = new Date().toISOString(); });
    return { rows: updated.map(item => ({ id: item.id })) };
  }

  // --- SPORTS ADMINS ---
  if (normalizedText.includes('insert into sport_admins')) {
    const [sport, admin_user_id] = params;
    const existing = memoryStore.sport_admins.find(item => item.sport.toLowerCase() === sport.toLowerCase() && item.admin_user_id === admin_user_id);
    if (existing) return { rows: [] };
    const assignment = { id: crypto.randomUUID(), sport, admin_user_id, created_at: new Date().toISOString() };
    memoryStore.sport_admins.push(assignment);
    return { rows: [{ ...assignment }] };
  }
  if (normalizedText.includes('delete from sport_admins')) {
    const targetSport = (params[0] || '').toLowerCase();
    const index = memoryStore.sport_admins.findIndex(item => item.sport.toLowerCase() === targetSport && item.admin_user_id === params[1]);
    if (index < 0) return { rows: [] };
    const [assignment] = memoryStore.sport_admins.splice(index, 1);
    return { rows: [{ id: assignment.id }] };
  }

  // --- ANNOUNCEMENTS ---
  if (normalizedText.includes('insert into announcements')) {
    const [title, message, category, event_at, is_pinned, created_by] = params;
    const announcement = { id: crypto.randomUUID(), title, message, category, event_at, is_pinned: Boolean(is_pinned), created_by, created_at: new Date().toISOString() };
    memoryStore.announcements.push(announcement);
    return { rows: [{ ...announcement }] };
  }
  if (normalizedText.includes('from announcements')) {
    const rows = memoryStore.announcements.slice().sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return Number(b.is_pinned) - Number(a.is_pinned);
      if (a.event_at && b.event_at) return new Date(a.event_at) - new Date(b.event_at);
      if (a.event_at) return -1;
      if (b.event_at) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    }).map((announcement) => ({ ...announcement, posted_by: memoryStore.users.find(user => user.id === announcement.created_by)?.name || 'Tournament admin' }));
    return { rows };
  }
  if (normalizedText.includes('update announcements set')) {
    const [title, message, category, event_at, is_pinned, id] = params;
    const announcement = memoryStore.announcements.find(item => item.id === id);
    if (!announcement) return { rows: [] };
    Object.assign(announcement, { title, message, category, event_at, is_pinned: Boolean(is_pinned) });
    return { rows: [{ ...announcement }] };
  }
  if (normalizedText.includes('delete from announcements')) {
    const index = memoryStore.announcements.findIndex(item => item.id === params[0]);
    if (index < 0) return { rows: [] };
    const [announcement] = memoryStore.announcements.splice(index, 1);
    return { rows: [{ id: announcement.id }] };
  }

  if (normalizedText.includes('insert into users')) {
    const [college_id, name, department, campus, year, email, phone, password_hash, role, profile_photo] = params;
    const existing = memoryStore.users.find(u => u.college_id.toLowerCase() === college_id.toLowerCase());
    if (existing) {
      const error = new Error('College ID already registered');
      error.code = '23505';
      throw error;
    }

    const newUser = {
      id: crypto.randomUUID(),
      college_id,
      name,
      department,
      campus: campus || 'Main Campus',
      year,
      email,
      phone,
      password_hash,
      profile_photo: profile_photo || null,
      role: role || 'player',
      created_at: new Date().toISOString()
    };

    memoryStore.users.push(newUser);
    return { rows: [{ ...newUser }] };
  }

  // --- LEADERBOARD QUERY ---
  if (normalizedText.includes('from teams') && normalizedText.includes('scores') && normalizedText.includes('sum(s.points)')) {
    const leaderboard = memoryStore.teams.map(t => {
      const requestedSport = params[0];
      if (requestedSport && t.sport !== requestedSport) return null;
      const sportMatches = memoryStore.matches.filter(match => match.status === 'completed' && (match.team_a_id === t.id || match.team_b_id === t.id));
      const results = sportMatches.map(match => {
        const opponentId = match.team_a_id === t.id ? match.team_b_id : match.team_a_id;
        const ownScore = memoryStore.scores.find(score => score.match_id === match.id && score.team_id === t.id)?.points || 0;
        const opponentScore = memoryStore.scores.find(score => score.match_id === match.id && score.team_id === opponentId)?.points || 0;
        return { ownScore, opponentScore };
      });
      const wins = results.filter(result => result.ownScore > result.opponentScore).length;
      const draws = results.filter(result => result.ownScore === result.opponentScore).length;
      const losses = results.length - wins - draws;
      const score_for = results.reduce((sum, result) => sum + result.ownScore, 0);
      const score_against = results.reduce((sum, result) => sum + result.opponentScore, 0);
      const total_points = wins * 3 + draws;
      return {
        team_id: t.id,
        team_name: t.name,
        total_points,
        matches_recorded: results.length,
        played: results.length, wins, draws, losses, score_for, score_against,
        score_difference: score_for - score_against
      };
    }).filter(Boolean);

    leaderboard.sort((a, b) => b.total_points - a.total_points || b.score_difference - a.score_difference || b.score_for - a.score_for || a.team_name.localeCompare(b.team_name));
    return { rows: leaderboard };
  }

  // --- DELETE TEAMS ---
  if (normalizedText.includes('delete from teams')) {
    const id = params[0];
    const index = memoryStore.teams.findIndex(t => t.id === id);
    if (index >= 0) {
      const [deleted] = memoryStore.teams.splice(index, 1);
      // CASCADE cleanup in memory store
      memoryStore.team_members = (memoryStore.team_members || []).filter(m => m.team_id !== id);
      memoryStore.team_invites = (memoryStore.team_invites || []).filter(i => i.team_id !== id);
      memoryStore.team_requests = (memoryStore.team_requests || []).filter(r => r.team_id !== id);
      memoryStore.team_admin_removal_votes = (memoryStore.team_admin_removal_votes || []).filter(v => v.team_id !== id);
      return { rows: [{ ...deleted }] };
    }
    return { rows: [] };
  }

  // --- TEAMS ---
  if (normalizedText.includes('from teams') && !normalizedText.includes('from matches')) {
    const enrichTeam = (team) => {
      if (!team) return team;
      const owner = memoryStore.users.find(u => u.id === team.owner_user_id);
      return {
        ...team,
        owner_name: owner?.name || null,
        owner_college_id: owner?.college_id || null,
        owner_campus: owner?.campus || 'Main Campus'
      };
    };

    if (normalizedText.includes('member_user_id = $1') || normalizedText.includes('member_user_id =$1')) {
      const userId = params[0];
      const teams = memoryStore.teams
        .filter(team => team.owner_user_id === userId || memoryStore.team_members.some(member => member.team_id === team.id && member.member_user_id === userId))
        .sort((a, b) => {
          const aIsOwner = a.owner_user_id === userId;
          const bIsOwner = b.owner_user_id === userId;
          if (aIsOwner !== bIsOwner) return aIsOwner ? -1 : 1;
          return (a.sport || '').localeCompare(b.sport || '') || (a.created_at || '').localeCompare(b.created_at || '');
        });
      return { rows: teams.map(enrichTeam) };
    }
    if (normalizedText.includes('owner_user_id =')) {
      const ownerId = params[0];
      const sport = params[1];
      const teams = memoryStore.teams.filter(t => t.owner_user_id === ownerId && (!sport || t.sport === sport));
      return { rows: teams.map(enrichTeam) };
    }
    if (normalizedText.includes('where id =') || normalizedText.includes('where id=')) {
      const id = params[0];
      const team = memoryStore.teams.find(t => t.id === id);
      return { rows: team ? [enrichTeam(team)] : [] };
    }
    return { rows: memoryStore.teams.map(enrichTeam) };
  }

  if (normalizedText.includes('insert into teams')) {
    // params from teamModel.createTeam: [name, owner_user_id, sport, campus]
    // locked is always FALSE (literal) in the SQL, not a param
    const [name, owner_user_id, sport, campus] = params;
    // Allow users to create multiple teams, even for the same sport

    const newTeam = {
      id: crypto.randomUUID(),
      name,
      owner_user_id,
      sport: sport || 'Football',
      campus: campus || 'Main Campus',
      locked: false, // always starts unlocked
      created_at: new Date().toISOString()
    };
    memoryStore.teams.push(newTeam);
    return { rows: [{ ...newTeam }] };
  }

  if (normalizedText.includes('update teams')) {
    // Handle: UPDATE teams SET locked = $1 WHERE id = $2  (lock toggle)
    // Handle: UPDATE teams SET name = $1, sport = $2, locked = $3 WHERE id = $4 (update)
    // Handle: UPDATE teams SET owner_user_id = $1 WHERE id = $2 AND owner_user_id = $3 (transfer)
    if (normalizedText.includes('owner_user_id =') && params.length === 3) {
      const [newOwnerId, teamId, currentOwnerId] = params;
      const team = memoryStore.teams.find(t => t.id === teamId && t.owner_user_id === currentOwnerId);
      if (team) {
        team.owner_user_id = newOwnerId;
        return { rows: [{ ...team }] };
      }
      return { rows: [] };
    }
    if (params.length === 2) {
      // SET locked=$1 WHERE id=$2
      const [locked, id] = params;
      const team = memoryStore.teams.find(t => t.id === id);
      if (team) {
        team.locked = Boolean(locked);
        return { rows: [{ ...team }] };
      }
      return { rows: [] };
    }
    if (params.length === 4) {
      const [name, sport, locked, id] = params;
      const team = memoryStore.teams.find(t => t.id === id);
      if (team) {
        if (name !== undefined && name !== null) team.name = name;
        if (sport !== undefined && sport !== null) team.sport = sport;
        if (locked !== undefined && locked !== null) team.locked = Boolean(locked);
        return { rows: [{ ...team }] };
      }
      return { rows: [] };
    }
    const [name, locked, id] = params;
    const team = memoryStore.teams.find(t => t.id === id);
    if (team) {
      if (name !== undefined && name !== null) team.name = name;
      if (locked !== undefined && locked !== null) team.locked = Boolean(locked);
      return { rows: [{ ...team }] };
    }
    return { rows: [] };
  }

  // --- TOURNAMENT SETTINGS ---
  if (normalizedText.includes('tournament_settings')) {
    if (normalizedText.includes('select') || normalizedText.includes('from tournament_settings')) {
      // SELECT value FROM tournament_settings WHERE key = $1
      const key = params[0];
      if (key === 'tournament_started') {
        return { rows: [{ key, value: memoryStore.settings.tournament_started }] };
      }
      return { rows: [] };
    }
    if (normalizedText.includes('insert into tournament_settings')) {
      // UPSERT tournament_settings
      const key = params[0] || 'tournament_started';
      const value = Boolean(params[1]);
      if (key === 'tournament_started') {
        memoryStore.settings.tournament_started = value;
      }
      return { rows: [{ key, value }] };
    }
    return { rows: [] };
  }

  // --- TEAM MEMBERS ---
  if (normalizedText.includes('from team_members')) {
    const enrichMember = (m) => {
      const u = memoryStore.users.find(user => user.id === m.member_user_id);
      return {
        ...m,
        college_id: u?.college_id || null,
        department: u?.department || null,
        year: u?.year || null,
        campus: u?.campus || null
      };
    };
    if (normalizedText.includes('where team_id =') || normalizedText.includes('where team_id=')) {
      const teamId = params[0];
      const members = memoryStore.team_members.filter(m => m.team_id === teamId);
      return { rows: members.map(enrichMember) };
    }
    return { rows: memoryStore.team_members.map(enrichMember) };
  }

  // --- TEAM INVITES ---
  if (normalizedText.includes('insert into team_invites')) {
    const [team_id, invited_user_id, invited_by] = params;
    const existing = memoryStore.team_invites.find(invite => invite.team_id === team_id && invite.invited_user_id === invited_user_id);
    if (existing) { const error = new Error('This player has already been invited to the team'); error.code = '23505'; throw error; }
    const invite = { id: crypto.randomUUID(), team_id, invited_user_id, invited_by, status: 'pending', created_at: new Date().toISOString(), responded_at: null };
    memoryStore.team_invites.push(invite);
    return { rows: [{ ...invite }] };
  }

  if (normalizedText.includes('from team_invites')) {
    const userId = params[0];
    const invites = memoryStore.team_invites.filter(invite => invite.invited_user_id === userId);
    return { rows: invites.map(invite => {
      const team = memoryStore.teams.find(item => item.id === invite.team_id);
      const inviter = memoryStore.users.find(item => item.id === invite.invited_by);
      return { ...invite, team_name: team?.name, sport: team?.sport, invited_by_name: inviter?.name };
    }) };
  }

  if (normalizedText.includes('update team_invites')) {
    const [status, inviteId, userId] = params;
    const invite = memoryStore.team_invites.find(item => item.id === inviteId && item.invited_user_id === userId);
    if (!invite) return { rows: [] };
    invite.status = status; invite.responded_at = new Date().toISOString();
    return { rows: [{ ...invite }] };
  }

  // --- PLAYER STATS ---
  if (normalizedText.includes('insert into player_stats')) {
    const [match_id, team_id, player_id, stat_type, value, recorded_by] = params;
    let stat = memoryStore.player_stats.find(item => item.match_id === match_id && item.player_id === player_id && item.stat_type === stat_type);
    if (stat) Object.assign(stat, { team_id, value: Number(value), recorded_by, updated_at: new Date().toISOString() });
    else { stat = { id: crypto.randomUUID(), match_id, team_id, player_id, stat_type, value: Number(value), recorded_by, updated_at: new Date().toISOString() }; memoryStore.player_stats.push(stat); }
    return { rows: [{ ...stat }] };
  }

  if (normalizedText.includes('from player_stats')) {
    const playerId = params[0];
    const stats = memoryStore.player_stats.filter(stat => !playerId || stat.player_id === playerId).map(stat => {
      const match = memoryStore.matches.find(item => item.id === stat.match_id);
      const team = memoryStore.teams.find(item => item.id === stat.team_id);
      return { ...stat, sport: match?.sport, match_name: match?.name, team_name: team?.name };
    });
    return { rows: stats };
  }

  if (normalizedText.includes('insert into team_members')) {
    const [team_id, member_name, position, member_user_id] = params;
    const newMember = {
      id: crypto.randomUUID(),
      team_id,
      member_name,
      position: position || 'Player',
      member_user_id: member_user_id || null,
      created_at: new Date().toISOString()
    };
    memoryStore.team_members.push(newMember);
    return { rows: [{ ...newMember }] };
  }

  if (normalizedText.includes('delete from team_members')) {
    const teamId = params[0];
    memoryStore.team_members = memoryStore.team_members.filter(m => m.team_id !== teamId);
    return { rows: [] };
  }

  // --- MATCHES ---
  if (normalizedText.includes('insert into matches')) {
    // params: [name, match_date, status, sport, team_a_id, team_b_id]
    const [name, match_date, status, sport, team_a_id, team_b_id] = params;
    const newMatch = {
      id: crypto.randomUUID(),
      name,
      match_date: match_date || new Date().toISOString(),
      status: status || 'upcoming',
      sport: sport || 'Football',
      team_a_id: team_a_id || null,
      team_b_id: team_b_id || null,
      created_at: new Date().toISOString()
    };
    memoryStore.matches.push(newMatch);
    return { rows: [{ ...newMatch }] };
  }

  if (normalizedText.includes('update matches')) {
    // UPDATE matches SET status = $1 WHERE id = $2
    const [status, id] = params;
    const match = memoryStore.matches.find(m => m.id === id);
    if (match) {
      if (status) match.status = status;
      return { rows: [{ ...match }] };
    }
    return { rows: [] };
  }

  if (normalizedText.includes('from matches')) {
    const enrichMatch = (match) => ({
      ...match,
      team_a_name: memoryStore.teams.find(team => team.id === match.team_a_id)?.name || null,
      team_b_name: memoryStore.teams.find(team => team.id === match.team_b_id)?.name || null
    });
    if (normalizedText.includes('where id =') || normalizedText.includes('where id=') || normalizedText.includes('where m.id =') || normalizedText.includes('where m.id=')) {
      const id = params[0];
      const match = memoryStore.matches.find(m => m.id === id);
      return { rows: match ? [enrichMatch(match)] : [] };
    }
    return { rows: memoryStore.matches.map(enrichMatch) };
  }

  // --- SCORES ---
  if (normalizedText.includes('insert into scores') || normalizedText.includes('update scores')) {
    // params: [team_id, match_id, points, updated_by]
    const [team_id, match_id, points, updated_by] = params;
    
    // Check if score already exists for (team_id, match_id)
    let score = memoryStore.scores.find(s => s.team_id === team_id && s.match_id === match_id);
    if (score) {
      score.points = Number(points);
      score.updated_by = updated_by;
      score.updated_at = new Date().toISOString();
    } else {
      score = {
        id: crypto.randomUUID(),
        team_id,
        match_id,
        points: Number(points),
        updated_by,
        updated_at: new Date().toISOString()
      };
      memoryStore.scores.push(score);
    }

    const team = memoryStore.teams.find(t => t.id === team_id);
    const match = memoryStore.matches.find(m => m.id === match_id);
    const user = memoryStore.users.find(u => u.id === updated_by);

    return {
      rows: [{
        ...score,
        team_name: team ? team.name : 'Unknown Team',
        match_name: match ? match.name : 'Unknown Match',
        sport: match ? match.sport : 'Football',
        updated_by_name: user ? user.name : 'Admin'
      }]
    };
  }

  if (normalizedText.includes('from scores')) {
    // Return scores joined with team, match, and updated_by names
    const enrichedScores = memoryStore.scores.map(s => {
      const team = memoryStore.teams.find(t => t.id === s.team_id);
      const match = memoryStore.matches.find(m => m.id === s.match_id);
      const user = memoryStore.users.find(u => u.id === s.updated_by);
      return {
        ...s,
        team_name: team ? team.name : 'Unknown Team',
        match_name: match ? match.name : 'Unknown Match',
        match_status: match ? match.status : 'upcoming',
        sport: match ? match.sport : 'Football',
        updated_by_name: user ? user.name : 'Admin'
      };
    });

    if (normalizedText.includes('where match_id =') || normalizedText.includes('where match_id=')) {
      const matchId = params[0];
      return { rows: enrichedScores.filter(s => s.match_id === matchId) };
    }

    return { rows: enrichedScores };
  }

  // --- PLAYER MATCH POINTS (auto-derived fantasy points) ---
  if (normalizedText.includes('delete from player_match_points where match_id = $1')) {
    const matchId = params[0];
    memoryStore.player_match_points = (memoryStore.player_match_points || []).filter(r => r.match_id !== matchId);
    return { rows: [] };
  }
  if (normalizedText.includes('insert into player_match_points')) {
    const [match_id, player_id, team_id, sport, fantasy_points, stats] = params;
    let existing = (memoryStore.player_match_points || []).find(r => r.match_id === match_id && r.player_id === player_id);
    const statsObj = typeof stats === 'string' ? JSON.parse(stats) : (stats || {});
    if (existing) {
      Object.assign(existing, { team_id, sport, fantasy_points: Number(fantasy_points), stats: statsObj, updated_at: new Date().toISOString() });
    } else {
      existing = { id: crypto.randomUUID(), match_id, player_id, team_id, sport, fantasy_points: Number(fantasy_points), stats: statsObj, updated_at: new Date().toISOString() };
      (memoryStore.player_match_points = memoryStore.player_match_points || []).push(existing);
    }
    return { rows: [{ ...existing }] };
  }
  if (normalizedText.includes('from player_match_points')) {
    const rows = (memoryStore.player_match_points || []).map(r => {
      const user = memoryStore.users.find(u => u.id === r.player_id);
      const match = memoryStore.matches.find(m => m.id === r.match_id);
      const team = memoryStore.teams.find(t => t.id === r.team_id);
      return { ...r, player_name: user?.name || 'Unknown', match_name: match?.name || '', team_name: team?.name || '', campus: user?.campus || 'Main Campus' };
    });
    // Filter by player_id if param given
    if (normalizedText.includes('where player_id = $1') || normalizedText.includes('where pmp.player_id = $1')) {
      let filtered = rows.filter(r => r.player_id === params[0]);
      if (normalizedText.includes('like $2') && params[1]) {
        const sportLike = String(params[1]).replace(/%/g, '').toLowerCase();
        filtered = filtered.filter(r => r.sport && r.sport.toLowerCase().includes(sportLike));
      }
      return { rows: filtered };
    }
    if (normalizedText.includes('where match_id = $1') || normalizedText.includes('where pmp.match_id = $1')) {
      return { rows: rows.filter(r => r.match_id === params[0]) };
    }
    // Group by player for leaderboard: sport filter optional
    if (normalizedText.includes('group by')) {
      const sportFilter = params[0];
      const filtered = sportFilter ? rows.filter(r => r.sport && r.sport.toLowerCase().includes(sportFilter.toLowerCase())) : rows;
      const byPlayer = {};
      for (const r of filtered) {
        if (!byPlayer[r.player_id]) byPlayer[r.player_id] = { player_id: r.player_id, player_name: r.player_name, campus: r.campus, total_points: 0, matches_played: 0 };
        byPlayer[r.player_id].total_points += r.fantasy_points;
        byPlayer[r.player_id].matches_played += 1;
      }
      const sorted = Object.values(byPlayer).sort((a, b) => b.total_points - a.total_points).map((p, i) => ({ rank: i + 1, ...p }));
      return { rows: sorted };
    }
    return { rows };
  }

  // --- PAYMENTS & WEBHOOKS ---
  if (normalizedText.includes('insert into payments')) {
    const [user_id, order_id, amount, currency, purpose, metadata] = params;
    const payment = {
      id: crypto.randomUUID(),
      user_id,
      order_id,
      amount,
      currency: currency || 'INR',
      status: 'created',
      purpose: purpose || 'tournament_fee',
      metadata: typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.payments.push(payment);
    return { rows: [{ ...payment }] };
  }

  if (normalizedText.includes('from payments')) {
    if (normalizedText.includes('order_id = $1') || normalizedText.includes('order_id=$1')) {
      const orderId = params[0];
      const found = memoryStore.payments.find(p => p.order_id === orderId);
      return { rows: found ? [{ ...found }] : [] };
    }
    if (normalizedText.includes('user_id = $1') || normalizedText.includes('user_id=$1')) {
      const userId = params[0];
      const list = memoryStore.payments.filter(p => p.user_id === userId);
      return { rows: list.map(p => ({ ...p })) };
    }
  }

  if (normalizedText.includes('update payments')) {
    if (normalizedText.includes("status = 'paid'") || normalizedText.includes('status = $1')) {
      const [payment_id, order_id] = params;
      const found = memoryStore.payments.find(p => p.order_id === order_id);
      if (found) {
        found.status = 'paid';
        found.payment_id = payment_id;
        found.updated_at = new Date().toISOString();
        return { rows: [{ ...found }] };
      }
      return { rows: [] };
    }
    if (normalizedText.includes("status = 'failed'")) {
      const [reason, order_id] = params;
      const found = memoryStore.payments.find(p => p.order_id === order_id);
      if (found) {
        found.status = 'failed';
        found.metadata = { ...(found.metadata || {}), failure_reason: reason };
        found.updated_at = new Date().toISOString();
        return { rows: [{ ...found }] };
      }
      return { rows: [] };
    }
  }

  if (normalizedText.includes('from processed_webhooks')) {
    const eventId = params[0];
    const exists = memoryStore.processed_webhooks.some(w => w.event_id === eventId);
    return { rows: exists ? [{ event_id: eventId }] : [] };
  }

  if (normalizedText.includes('insert into processed_webhooks')) {
    const [event_id, event_type] = params;
    const exists = memoryStore.processed_webhooks.some(w => w.event_id === event_id);
    if (!exists) {
      memoryStore.processed_webhooks.push({ event_id, event_type, processed_at: new Date().toISOString() });
    }
    return { rows: [{ event_id }] };
  }

  return { rows: [] };
};

export default {
  query,
  initDb,
  get isPgConnected() {
    return isPgConnected;
  }
};
