import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { getAuthHeaders } from '../utils/authFetch';

const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const CommunityFeedback = ({ onNavigate }) => {
  const { user, token, isAuthenticated } = useAuth();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New post form state (Registered only)
  const [postContent, setPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');

  // Active replies thread state: { [postId]: { open: boolean, loading: boolean, replies: [] } }
  const [repliesState, setRepliesState] = useState({});

  // Active reply form inputs: { [postId]: { text: '', guestName: '', submitting: false } }
  const [replyInputs, setReplyInputs] = useState({});

  // Load all community posts
  const loadPosts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load posts');
      setPosts(data.posts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [token]);

  // Handle new post creation (Registered user)
  const handleCreatePost = async (e) => {
    e.preventDefault();
    setPostError('');

    if (!postContent.trim() || postContent.trim().length < 5) {
      setPostError('Please write at least 5 characters for your post.');
      return;
    }

    setPosting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: postContent.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to publish post');

      setPostContent('');
      setPosts((prev) => [data.post, ...prev]);
    } catch (err) {
      setPostError(err.message);
    } finally {
      setPosting(false);
    }
  };

  // Toggle upvote on post (Anyone can upvote)
  const handleToggleUpvote = async (postId) => {
    try {
      const res = await fetch(`/api/feedback/${postId}/upvote`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) return;

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, upvotes: data.upvotes, has_upvoted: data.upvoted }
            : p
        )
      );
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  };

  // Toggle and load replies for a post
  const handleToggleReplies = async (postId) => {
    const current = repliesState[postId];
    if (current?.open) {
      // Collapse
      setRepliesState((prev) => ({
        ...prev,
        [postId]: { ...prev[postId], open: false }
      }));
      return;
    }

    // Expand & fetch replies
    setRepliesState((prev) => ({
      ...prev,
      [postId]: { open: true, loading: true, replies: prev[postId]?.replies || [] }
    }));

    try {
      const res = await fetch(`/api/feedback/${postId}/replies`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRepliesState((prev) => ({
          ...prev,
          [postId]: { open: true, loading: false, replies: data.replies || [] }
        }));
      }
    } catch {
      setRepliesState((prev) => ({
        ...prev,
        [postId]: { ...prev[postId], open: true, loading: false }
      }));
    }
  };

  // Submit reply on a post (Anyone can reply)
  const handleSendReply = async (postId) => {
    const input = replyInputs[postId] || { text: '', guestName: '' };
    if (!input.text || input.text.trim().length < 2) return;

    if (!isAuthenticated && (!input.guestName || input.guestName.trim().length < 2)) {
      alert('Please enter your name to post a reply.');
      return;
    }

    setReplyInputs((prev) => ({
      ...prev,
      [postId]: { ...prev[postId], submitting: true }
    }));

    try {
      const res = await fetch(`/api/feedback/${postId}/replies`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content: input.text.trim(),
          authorName: isAuthenticated ? user.name : input.guestName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to reply');

      // Clear input and append reply
      setReplyInputs((prev) => ({
        ...prev,
        [postId]: { text: '', guestName: input.guestName || '', submitting: false }
      }));

      setRepliesState((prev) => ({
        ...prev,
        [postId]: {
          open: true,
          loading: false,
          replies: [...(prev[postId]?.replies || []), data.reply]
        }
      }));

      // Increment reply_count on the post
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, reply_count: (p.reply_count || 0) + 1 } : p
        )
      );
    } catch (err) {
      alert(err.message);
      setReplyInputs((prev) => ({
        ...prev,
        [postId]: { ...prev[postId], submitting: false }
      }));
    }
  };

  // Delete post
  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      const res = await fetch(`/api/feedback/${postId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete');
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete reply
  const handleDeleteReply = async (postId, replyId) => {
    if (!window.confirm('Delete this reply?')) return;
    try {
      const res = await fetch(`/api/feedback/${postId}/replies/${replyId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete');

      setRepliesState((prev) => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          replies: (prev[postId]?.replies || []).filter((r) => r.id !== replyId)
        }
      }));

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, reply_count: Math.max(0, (p.reply_count || 1) - 1) } : p
        )
      );
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="feedback-page-container">
      {/* Header */}
      <div className="feedback-header-box">
        <h1>💬 Community Feedback &amp; Wall</h1>
        <p>
          Share your experience with the website, suggest ideas, or ask questions. Registered members can post, and anyone can upvote and reply!
        </p>
      </div>

      <Alert type="error" message={error} />

      {/* Post Creation Box: Only registered person can post */}
      {isAuthenticated ? (
        <div className="feedback-create-card">
          <div className="feedback-create-header">
            <div className="feedback-avatar">
              {user.profile_photo ? (
                <img src={user.profile_photo} alt={user.name} />
              ) : (
                user.name ? user.name[0].toUpperCase() : 'U'
              )}
            </div>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</span>
              <span style={{ marginLeft: 8 }} className={`role-pill ${user.role}`}>
                {user.role}
              </span>
            </div>
          </div>

          <Alert type="error" message={postError} />

          <form onSubmit={handleCreatePost}>
            <textarea
              className="feedback-textarea"
              placeholder="What do you think of the website? Share your user experience, recommendations, or ideas..."
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              rows={3}
            />
            <div className="feedback-create-footer">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {postContent.length} characters
              </span>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={posting || !postContent.trim()}
              >
                {posting ? 'Posting…' : 'Post to Community Wall 🚀'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="feedback-guest-banner">
          <div>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 2 }}>
              Have thoughts about the website?
            </strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Sign in or create an account to post your feedback. Anyone can read, upvote, and reply below!
            </span>
          </div>
          {onNavigate && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate('login')}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onNavigate('signup')}
              >
                Register
              </button>
            </div>
          )}
        </div>
      )}

      {/* Posts Feed: Visible to everyone registered or not */}
      {loading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '3rem 1rem',
            color: 'var(--text-muted)',
            gap: '0.75rem'
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--accent-cyan)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          <p>Loading community posts…</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="auth-card" style={{ maxWidth: '100%', textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No feedback posts yet. Be the first to share your experience!</p>
        </div>
      ) : (
        <div className="feedback-feed">
          {posts.map((post) => {
            const isPostAuthor = user && (user.id === post.user_id || user.role === 'admin');
            const thread = repliesState[post.id] || { open: false, loading: false, replies: [] };
            const input = replyInputs[post.id] || { text: '', guestName: '', submitting: false };

            return (
              <article key={post.id} className="feedback-post-card">
                {/* Author Info */}
                <div className="feedback-card-top">
                  <div className="feedback-user-info">
                    <div className="feedback-avatar">
                      {post.author_photo ? (
                        <img src={post.author_photo} alt={post.author_name} />
                      ) : (
                        post.author_name ? post.author_name[0].toUpperCase() : 'U'
                      )}
                    </div>
                    <div className="feedback-user-text">
                      <span className="feedback-username">
                        {post.author_name}
                        {post.author_role === 'admin' && (
                          <span className="role-pill admin" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                            Admin
                          </span>
                        )}
                      </span>
                      <span className="feedback-subtext">
                        {post.author_campus || 'Campus'} • {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                  </div>

                  {isPostAuthor && (
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                      onClick={() => handleDeletePost(post.id)}
                      title="Delete post"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Post Content */}
                <div className="feedback-body">{post.content}</div>

                {/* Actions: Upvote & Reply toggle */}
                <div className="feedback-actions-bar">
                  <button
                    type="button"
                    className={`feedback-btn-action ${post.has_upvoted ? 'active' : ''}`}
                    onClick={() => handleToggleUpvote(post.id)}
                    title={post.has_upvoted ? 'Remove upvote' : 'Upvote this post'}
                  >
                    <span>👍</span>
                    <span>{post.has_upvoted ? 'Upvoted' : 'Upvote'}</span>
                    <strong>({post.upvotes || 0})</strong>
                  </button>

                  <button
                    type="button"
                    className="feedback-btn-action"
                    onClick={() => handleToggleReplies(post.id)}
                  >
                    <span>💬</span>
                    <span>{post.reply_count ? `${post.reply_count} Replies` : 'Reply'}</span>
                  </button>
                </div>

                {/* Expandable Replies Thread */}
                {thread.open && (
                  <div className="feedback-replies-container">
                    {thread.loading ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading replies…</p>
                    ) : thread.replies.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No replies yet. Start the conversation!
                      </p>
                    ) : (
                      thread.replies.map((reply) => {
                        const isReplyAuthor = user && (user.id === reply.user_id || user.role === 'admin');
                        return (
                          <div key={reply.id} className="feedback-reply-bubble">
                            <div className="feedback-reply-header">
                              <span className="feedback-reply-author">
                                {reply.author_name}
                                {reply.author_role === 'admin' && ' (Admin)'}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="feedback-reply-time">{formatTimeAgo(reply.created_at)}</span>
                                {isReplyAuthor && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteReply(post.id, reply.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--accent-rose)',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem'
                                    }}
                                    title="Delete reply"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="feedback-reply-text">{reply.content}</div>
                          </div>
                        );
                      })
                    )}

                    {/* Quick Reply Form: Anyone can reply */}
                    <div className="feedback-reply-form">
                      {!isAuthenticated && (
                        <input
                          type="text"
                          className="feedback-reply-input"
                          placeholder="Your Name (Guest)"
                          value={input.guestName}
                          onChange={(e) =>
                            setReplyInputs((prev) => ({
                              ...prev,
                              [post.id]: { ...input, guestName: e.target.value }
                            }))
                          }
                          style={{ maxWidth: 220 }}
                        />
                      )}
                      <div className="feedback-reply-input-row">
                        <input
                          type="text"
                          className="feedback-reply-input"
                          placeholder="Write a reply..."
                          value={input.text}
                          onChange={(e) =>
                            setReplyInputs((prev) => ({
                              ...prev,
                              [post.id]: { ...input, text: e.target.value }
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSendReply(post.id);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={input.submitting || !input.text.trim()}
                          onClick={() => handleSendReply(post.id)}
                        >
                          {input.submitting ? '…' : 'Reply'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommunityFeedback;
