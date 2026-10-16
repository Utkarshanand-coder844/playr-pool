import { ExperienceModel } from '../models/experienceModel.js';

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
};

export const getExperiences = async (req, res) => {
  try {
    const { sport, campus, search, type, sort, limit, offset } = req.query;
    const userId = req.user?.id || null;
    const clientIp = getClientIp(req);

    const experiences = await ExperienceModel.getAll({
      sport,
      campus,
      search,
      type,
      sort,
      limit,
      offset,
      userId,
      clientIp
    });

    res.json({
      success: true,
      count: experiences.length,
      experiences
    });
  } catch (err) {
    console.error('getExperiences error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch player experiences' });
  }
};

export const getExperienceStats = async (req, res) => {
  try {
    const stats = await ExperienceModel.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('getExperienceStats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch experience stats' });
  }
};

export const createExperience = async (req, res) => {
  try {
    const {
      authorName,
      authorRole,
      campus,
      sport,
      rating,
      experienceType,
      title,
      experience,
      recommendations
    } = req.body;

    const isAuth = Boolean(req.user);
    const finalAuthorName = isAuth
      ? req.user.name
      : (authorName && typeof authorName === 'string' ? authorName.trim() : '');

    if (!finalAuthorName || finalAuthorName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid player or author name (minimum 2 characters).'
      });
    }

    if (!experience || typeof experience !== 'string' || experience.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please share your user experience in at least 10 characters.'
      });
    }

    const parsedRating = parseInt(rating, 10);
    const finalRating = !isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5 ? parsedRating : 5;

    const newExperience = await ExperienceModel.create({
      userId: isAuth ? req.user.id : null,
      authorName: finalAuthorName,
      authorRole: authorRole || (isAuth ? (req.user.role === 'admin' ? 'Tournament Admin' : 'Registered Player') : 'Player'),
      campus: campus || req.user?.campus || 'Main Campus',
      sport: sport || 'General',
      rating: finalRating,
      experienceType: experienceType || 'Tournament Experience',
      title: title || '',
      experience,
      recommendations: recommendations || '',
      isVerifiedPlayer: isAuth
    });

    res.status(201).json({
      success: true,
      message: 'Your experience and recommendations have been published!',
      experience: newExperience
    });
  } catch (err) {
    console.error('createExperience error:', err);
    res.status(500).json({ success: false, message: 'Failed to publish experience' });
  }
};

export const toggleUpvoteExperience = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Experience ID is required' });
    }

    const userId = req.user?.id || null;
    const clientIp = getClientIp(req);

    const result = await ExperienceModel.toggleUpvote({
      experienceId: id,
      userId,
      clientIp
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('toggleUpvoteExperience error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle upvote' });
  }
};

export const deleteExperience = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Experience ID is required' });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required to delete posts' });
    }

    const isAdmin = req.user.role === 'admin';
    const deleted = await ExperienceModel.delete({
      id,
      userId: req.user.id,
      isAdmin
    });

    if (!deleted) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this experience post or it does not exist'
      });
    }

    res.json({
      success: true,
      message: 'Experience post removed successfully'
    });
  } catch (err) {
    console.error('deleteExperience error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete experience' });
  }
};
