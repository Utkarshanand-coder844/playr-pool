import { FeedbackModel } from '../models/feedbackModel.js';

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
};

export const getFeedbackPosts = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const clientIp = getClientIp(req);
    const { limit, offset } = req.query;

    const posts = await FeedbackModel.getAll({
      userId,
      clientIp,
      limit,
      offset
    });

    res.json({
      success: true,
      count: posts.length,
      posts
    });
  } catch (err) {
    console.error('getFeedbackPosts error:', err);
    res.status(500).json({ success: false, message: 'Failed to load community posts' });
  }
};

export const getFeedbackReplies = async (req, res) => {
  try {
    const { id } = req.params;
    const replies = await FeedbackModel.getReplies(id);
    res.json({
      success: true,
      count: replies.length,
      replies
    });
  } catch (err) {
    console.error('getFeedbackReplies error:', err);
    res.status(500).json({ success: false, message: 'Failed to load replies' });
  }
};

export const createFeedbackPost = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Only registered members can post on the community wall. Please log in or sign up.'
      });
    }

    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Please write at least 5 characters for your post.'
      });
    }

    const newPost = await FeedbackModel.createPost({
      userId: req.user.id,
      content
    });

    res.status(201).json({
      success: true,
      message: 'Your post was published to the community wall!',
      post: newPost
    });
  } catch (err) {
    console.error('createFeedbackPost error:', err);
    res.status(500).json({ success: false, message: 'Failed to create post' });
  }
};

export const createFeedbackReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, authorName } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please write a reply of at least 2 characters.'
      });
    }

    const isAuth = Boolean(req.user);
    const finalAuthorName = isAuth
      ? req.user.name
      : (authorName && typeof authorName === 'string' ? authorName.trim() : 'Guest');

    if (!finalAuthorName || finalAuthorName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your name to post a reply.'
      });
    }

    const reply = await FeedbackModel.createReply({
      postId: id,
      userId: isAuth ? req.user.id : null,
      authorName: finalAuthorName,
      content
    });

    res.status(201).json({
      success: true,
      message: 'Reply posted successfully',
      reply
    });
  } catch (err) {
    console.error('createFeedbackReply error:', err);
    res.status(500).json({ success: false, message: 'Failed to post reply' });
  }
};

export const toggleFeedbackUpvote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const clientIp = getClientIp(req);

    const result = await FeedbackModel.toggleUpvote({
      postId: id,
      userId,
      clientIp
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('toggleFeedbackUpvote error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle upvote' });
  }
};

export const deleteFeedbackPost = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const isAdmin = req.user.role === 'admin';
    const deleted = await FeedbackModel.deletePost({
      postId: id,
      userId: req.user.id,
      isAdmin
    });

    if (!deleted) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this post or it does not exist'
      });
    }

    res.json({
      success: true,
      message: 'Post removed successfully'
    });
  } catch (err) {
    console.error('deleteFeedbackPost error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete post' });
  }
};

export const deleteFeedbackReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const isAdmin = req.user.role === 'admin';
    const deleted = await FeedbackModel.deleteReply({
      replyId,
      userId: req.user.id,
      isAdmin
    });

    if (!deleted) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this reply'
      });
    }

    res.json({
      success: true,
      message: 'Reply removed successfully'
    });
  } catch (err) {
    console.error('deleteFeedbackReply error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete reply' });
  }
};
