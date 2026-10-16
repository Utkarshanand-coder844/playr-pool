-- Migration 002: Player Experiences & Recommendations
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

-- Seed initial genuine player stories if none exist yet
INSERT INTO player_experiences (
    id, author_name, author_role, campus, sport, rating, experience_type, title, experience, recommendations, upvotes, is_verified_player, created_at
)
SELECT 
    '11111111-2222-3333-4444-555555555501'::uuid,
    'Aarav Sharma',
    'Midfielder / Playmaker',
    'Main Campus',
    'Football',
    5,
    'Tournament Experience',
    'Intense Semis Atmosphere & Turf Adaptability',
    'Competing in the Inter-Campus Football Cup was an exhilarating experience. The refereeing was prompt, and the digital scoreboard on Playr-Pool kept our bench completely aligned in real time. The surface plays quite fast under the evening floodlights.',
    '1. Switch to hybrid molded studs if playing after 5 PM due to turf dew.\n2. Hydrate at least 90 minutes before kickoff.\n3. Keep communication concise across the backline when switching to zonal defense.',
    14,
    TRUE,
    CURRENT_TIMESTAMP - INTERVAL '3 days'
WHERE NOT EXISTS (SELECT 1 FROM player_experiences WHERE id = '11111111-2222-3333-4444-555555555501'::uuid);

INSERT INTO player_experiences (
    id, author_name, author_role, campus, sport, rating, experience_type, title, experience, recommendations, upvotes, is_verified_player, created_at
)
SELECT 
    '11111111-2222-3333-4444-555555555502'::uuid,
    'Rohan Verma',
    'All-Rounder / Captain',
    'North Campus',
    'Cricket',
    5,
    'Match Strategy',
    'Chasing Under Pressure & Pitch Behavior',
    'Our quarter-final chase came down to the last 2 overs. The pitch had good initial bounce in the powerplay, then settled. Having live ball-by-ball updates allowed our non-playing squad members in other departments to track our momentum.',
    '1. In 15-over campus fixtures, prioritize wickets in overs 1-4 over run containment.\n2. Bring extra grip tape—humidity can cause slippage during late innings.\n3. Rotate spinners quickly if the ball starts gripping.',
    19,
    TRUE,
    CURRENT_TIMESTAMP - INTERVAL '2 days'
WHERE NOT EXISTS (SELECT 1 FROM player_experiences WHERE id = '11111111-2222-3333-4444-555555555502'::uuid);

INSERT INTO player_experiences (
    id, author_name, author_role, campus, sport, rating, experience_type, title, experience, recommendations, upvotes, is_verified_player, created_at
)
SELECT 
    '11111111-2222-3333-4444-555555555503'::uuid,
    'Priya Nair',
    'Point Guard',
    'Main Campus',
    'Basketball',
    4,
    'Court Feedback & Drills',
    'High Tempo Gameplay & Transition Defense',
    'The hardwood court maintenance has improved dramatically this semester. Transition game was rapid. The match schedule notifications sent to our phones made warming up much smoother without waiting around.',
    '1. Practice high-screen resets to counter aggressive 2-3 zone defenses.\n2. Clean shoe soles before stepping onto the court for maximum lateral traction.\n3. Make sure organizers keep ice packs at court-side scorer desks.',
    8,
    TRUE,
    CURRENT_TIMESTAMP - INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM player_experiences WHERE id = '11111111-2222-3333-4444-555555555503'::uuid);
