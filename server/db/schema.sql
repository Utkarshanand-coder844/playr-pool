-- Enable UUID extension if available
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Role enum type
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('player', 'admin');
    END IF;
END $$;

-- Match Status enum type
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN
        CREATE TYPE match_status AS ENUM ('upcoming', 'live', 'completed');
    END IF;
END $$;

-- Users Table
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
    token_version INTEGER NOT NULL DEFAULT 0,
    role user_role DEFAULT 'player' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Teams Table (one team per owner_user_id)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sport VARCHAR(60) NOT NULL DEFAULT 'Football',
    locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS campus VARCHAR(100);
UPDATE teams t SET campus = u.campus FROM users u WHERE t.owner_user_id = u.id AND t.campus IS NULL;
ALTER TABLE teams ALTER COLUMN campus SET DEFAULT 'Main Campus';

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS campus VARCHAR(100) NOT NULL DEFAULT 'Main Campus';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS sport VARCHAR(60) NOT NULL DEFAULT 'Football';
-- Allow a player to own multiple teams (even for the same sport)
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_owner_user_id_key;
DROP INDEX IF EXISTS teams_owner_sport_unique;

-- Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    member_name VARCHAR(100) NOT NULL,
    position VARCHAR(50) DEFAULT 'Player',
    member_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS member_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS team_members_registered_user_unique ON team_members (team_id, member_user_id) WHERE member_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    responded_at TIMESTAMPTZ,
    CONSTRAINT unique_team_invite UNIQUE (team_id, invited_user_id)
);

-- Tournament Global Settings Table (e.g. tournament_started flag)
CREATE TABLE IF NOT EXISTS tournament_settings (
    key VARCHAR(50) PRIMARY KEY,
    value BOOLEAN DEFAULT FALSE NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Default tournament lock flag to false
INSERT INTO tournament_settings (key, value)
VALUES ('tournament_started', FALSE)
ON CONFLICT (key) DO NOTHING;

-- Matches Table
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    match_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status match_status DEFAULT 'upcoming' NOT NULL,
    sport VARCHAR(60) NOT NULL DEFAULT 'Football',
    team_a_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    team_b_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS sport VARCHAR(60) NOT NULL DEFAULT 'Football';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_a_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_b_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_state JSONB DEFAULT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_count INTEGER DEFAULT 0;

-- Scores Table
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

-- Link-based attachment metadata keeps events usable without requiring a
-- filesystem/object-storage provider. Supported types are poster, rules,
-- venue_map, and schedule.
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

CREATE TABLE IF NOT EXISTS sport_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sport VARCHAR(60) NOT NULL,
    admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_sport_admin UNIQUE (sport, admin_user_id)
);

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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_college_id ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_user_id ON teams(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_invited_user ON team_invites(invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_scores_match_id ON scores(match_id);
CREATE INDEX IF NOT EXISTS idx_scores_team_id ON scores(team_id);
CREATE INDEX IF NOT EXISTS idx_announcements_event_at ON announcements(event_at);
CREATE INDEX IF NOT EXISTS idx_announcements_campus ON announcements(campus);
CREATE INDEX IF NOT EXISTS idx_teams_campus_sport ON teams(campus, sport);
CREATE INDEX IF NOT EXISTS idx_availability_user_sport ON player_availability(user_id, sport);
CREATE INDEX IF NOT EXISTS idx_team_requests_team_status ON team_requests(team_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sport_admins_sport ON sport_admins(sport);

-- Player Sport Profiles Table: stores per-sport role/position information.
-- One row per (user_id, sport) — allows a player to have different roles
-- for each sport they participate in without any cross-sport interference.
CREATE TABLE IF NOT EXISTS player_sport_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sport VARCHAR(60) NOT NULL,
    -- Cricket fields
    primary_role VARCHAR(100),
    batting_hand VARCHAR(60),
    bowling_style VARCHAR(100),
    -- Football / Futsal / Basketball / Volleyball fields
    position VARCHAR(100),
    -- Badminton / Table Tennis fields
    playing_style VARCHAR(60),
    handedness VARCHAR(30),
    -- Athletics / Chess / Badminton / Table Tennis category
    event_category VARCHAR(80),
    -- Football / Futsal
    preferred_foot VARCHAR(30),
    -- Extensible JSONB bucket for future sport-specific attributes
    extra_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_player_sport_profile UNIQUE (user_id, sport)
);

CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_user ON player_sport_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_sport ON player_sport_profiles(sport);
CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_primary_role ON player_sport_profiles(sport, primary_role);
CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_position ON player_sport_profiles(sport, position);
CREATE INDEX IF NOT EXISTS idx_player_sport_profiles_bowling ON player_sport_profiles(sport, bowling_style);

-- Player Stats Table (manually recorded by admin via POST /api/admin/player-stats)
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

-- Player Match Points Table (auto-derived from match_events by the scoring engine)
-- This is the fantasy points leaderboard table — fully rebuilt on each event replay.
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
CREATE INDEX IF NOT EXISTS idx_player_match_points_match ON player_match_points(match_id);
CREATE INDEX IF NOT EXISTS idx_player_match_points_sport ON player_match_points(sport);
CREATE INDEX IF NOT EXISTS idx_player_match_points_campus ON player_match_points(player_id, sport);

-- Match events table for real-time play-by-play scoring ledger
CREATE TABLE IF NOT EXISTS match_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    event_type VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    seq INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_match_seq UNIQUE (match_id, seq)
);

-- Match events index for fast replay
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id, created_at ASC);

-- ============================================================================
-- TOURNAMENT SCOPED ARCHITECTURE
-- ============================================================================

-- Tournaments Table
CREATE TABLE IF NOT EXISTS tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    campus VARCHAR(100) NOT NULL DEFAULT 'Main Campus',
    sports TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration', 'live', 'completed')),
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    registration_opens_at TIMESTAMPTZ,
    registration_closes_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tournaments_campus ON tournaments(campus);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments(created_by);

-- Tournament Admins Table
CREATE TABLE IF NOT EXISTS tournament_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tournament_admin UNIQUE (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_admins_user ON tournament_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_admins_tournament ON tournament_admins(tournament_id);

-- Tournament Teams Entry Table
CREATE TABLE IF NOT EXISTS tournament_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'removed', 'invited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tournament_team UNIQUE (tournament_id, team_id)
);
ALTER TABLE tournament_teams DROP CONSTRAINT IF EXISTS tournament_teams_status_check;
ALTER TABLE tournament_teams ADD CONSTRAINT tournament_teams_status_check CHECK (status IN ('pending', 'approved', 'removed', 'invited'));
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_team ON tournament_teams(team_id);

-- Add tournament_id to existing matches, knockout_brackets, announcements, registration_deadlines
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);

ALTER TABLE knockout_brackets ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_knockout_brackets_tournament_id ON knockout_brackets(tournament_id);

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_announcements_tournament_id ON announcements(tournament_id);

ALTER TABLE registration_deadlines ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_registration_deadlines_tournament_id ON registration_deadlines(tournament_id);

-- Change knockout_brackets unique constraint to include tournament_id
ALTER TABLE knockout_brackets DROP CONSTRAINT IF EXISTS unique_bracket_slot;
DROP INDEX IF EXISTS idx_unique_bracket_tourney_slot;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bracket_tourney_slot ON knockout_brackets (
    COALESCE(tournament_id, '00000000-0000-0000-0000-000000000001'::uuid),
    sport,
    round_number,
    slot_number
);

-- Idempotent Migration: Create Default Tournament, attach existing matches, brackets, announcements & teams,
-- and grant owner role on Default Tournament to all existing global admins. Safe to run repeatedly.
DO $$
DECLARE
    default_tourney_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    first_creator_id UUID;
BEGIN
    SELECT id INTO first_creator_id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
    IF first_creator_id IS NULL THEN
        SELECT id INTO first_creator_id FROM users ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF first_creator_id IS NOT NULL THEN
        INSERT INTO tournaments (id, name, description, campus, sports, status, locked, created_by, verified)
        VALUES (
            default_tourney_id,
            'Default Tournament',
            'Campus tournament covering legacy fixtures and sports',
            'Main Campus',
            ARRAY['Football', 'Cricket', 'Basketball', 'Badminton', 'Volleyball', 'Table Tennis'],
            'live',
            FALSE,
            first_creator_id,
            TRUE
        )
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

        -- Attach all existing records to Default Tournament if not already set
        UPDATE matches SET tournament_id = default_tourney_id WHERE tournament_id IS NULL;
        UPDATE knockout_brackets SET tournament_id = default_tourney_id WHERE tournament_id IS NULL;
        UPDATE announcements SET tournament_id = default_tourney_id WHERE tournament_id IS NULL;
        UPDATE registration_deadlines SET tournament_id = default_tourney_id WHERE tournament_id IS NULL;

        -- Attach all existing teams to Default Tournament
        INSERT INTO tournament_teams (tournament_id, team_id, status)
        SELECT default_tourney_id, id, 'approved' FROM teams
        ON CONFLICT (tournament_id, team_id) DO NOTHING;

        -- Make every existing global admin an owner of Default Tournament
        INSERT INTO tournament_admins (tournament_id, user_id, role)
        SELECT default_tourney_id, id, 'owner' FROM users WHERE role = 'admin'
        ON CONFLICT (tournament_id, user_id) DO NOTHING;
    END IF;
END $$;

-- Player Experiences & Recommendations
CREATE TABLE IF NOT EXISTS player_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(100) NOT NULL,
    author_role VARCHAR(100) DEFAULT 'Player',
    campus VARCHAR(100) DEFAULT 'Main Campus',
    sport VARCHAR(60) NOT NULL DEFAULT 'General',
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    experience_type VARCHAR(60) NOT NULL DEFAULT 'Tournament Experience',
    title VARCHAR(150),
    experience TEXT NOT NULL,
    recommendations TEXT,
    upvotes INTEGER NOT NULL DEFAULT 0,
    is_verified_player BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_player_experiences_created_at ON player_experiences(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_experiences_sport ON player_experiences(sport);
CREATE INDEX IF NOT EXISTS idx_player_experiences_rating ON player_experiences(rating DESC);

CREATE TABLE IF NOT EXISTS player_experience_upvotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experience_id UUID NOT NULL REFERENCES player_experiences(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    client_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_upvote_user ON player_experience_upvotes(experience_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_upvote_ip ON player_experience_upvotes(experience_id, client_ip) WHERE user_id IS NULL AND client_ip IS NOT NULL;


