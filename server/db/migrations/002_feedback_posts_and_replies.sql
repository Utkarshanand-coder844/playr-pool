-- Migration 002: Simple Feedback Posts and Replies
CREATE TABLE IF NOT EXISTS feedback_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    upvotes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_posts_created_at ON feedback_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES feedback_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_post_id ON feedback_replies(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS feedback_upvotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES feedback_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    client_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_upvote_user ON feedback_upvotes(post_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_upvote_ip ON feedback_upvotes(post_id, client_ip) WHERE user_id IS NULL AND client_ip IS NOT NULL;

-- Initial feedback post from platform system
DO $$
DECLARE
    system_user_id UUID := '00000000-0000-0000-0000-000000000000'::uuid;
    post_1_id UUID := '22222222-3333-4444-5555-666666666601'::uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE id = system_user_id) THEN
        INSERT INTO feedback_posts (id, user_id, content, upvotes, created_at)
        VALUES (
            post_1_id,
            system_user_id,
            'Welcome to the Playr-Pool Community Wall! Share your experience using the website, recommend new features, or let us know what sport we should highlight next.',
            12,
            CURRENT_TIMESTAMP - INTERVAL '1 day'
        )
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO feedback_replies (post_id, user_id, author_name, content, created_at)
        VALUES (
            post_1_id,
            system_user_id,
            'Platform Team',
            'We review all community feedback and suggestions regularly. Excited to hear from everyone!',
            CURRENT_TIMESTAMP - INTERVAL '12 hours'
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
