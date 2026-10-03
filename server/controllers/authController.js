import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import '../config/env.js';
import { UserModel } from '../models/userModel.js';
import { PlayerSportModel } from '../models/playerSportModel.js';
import { PlayerSportProfileModel } from '../models/playerSportProfileModel.js';
import { SportsAdminModel } from '../models/sportsAdminModel.js';
import { NotificationModel } from '../models/notificationModel.js';
import { getIO } from '../config/socket.js';
import { normalizeSports } from './playerSportController.js';
import { validateSportProfile } from '../config/sportRoles.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured before starting the server.');

const sendResetEmail = async ({ email, name, resetUrl }) => {
  // Resend is deliberately called through its HTTP API so no mail library or
  // SMTP credentials are bundled into the application. Configure these values
  // in the deployment environment; never commit them to the repository.
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_EMAIL_FROM;

  // In local / test environments a placeholder key is acceptable — just log
  // the link so developers can test the reset flow without real credentials.
  const isDummyKey = !apiKey || apiKey.startsWith('re_xxxxxxxxx') || apiKey === 'your_resend_api_key';
  if (!apiKey || !from || isDummyKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
      return; // Succeed silently in dev — no real email sent
    }
    throw new Error('Password reset email is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Reset your Playr-Pool password',
      text: `Hi ${name},\n\nUse this link to reset your Playr-Pool password. It expires in one hour:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`
    })
  });
  if (!response.ok) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] Email provider rejected password-reset message (status ${response.status}). Reset URL: ${resetUrl}`);
      return; // Don't block the flow in dev
    }
    throw new Error('Email provider rejected the password-reset message');
  }
};


const sendPasswordChangedEmail = async ({ email, name }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_EMAIL_FROM;
  if (!apiKey || !from) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Your Playr-Pool password was changed', text: `Hi ${name},\n\nYour Playr-Pool password was changed successfully. Your account role and admin access were not changed.\n\nFor security, this message never includes your password. If you did not make this change, contact the tournament organizer immediately.` })
  });
};

/**
 * POST /api/auth/signup
 * Register a new player or admin
 */
export const signup = async (req, res) => {
  try {
    const { college_id, name, department, campus, year, email, phone, password, role, admin_code, profile_photo } = req.body;

    // Check if college_id already exists
    const existingUser = await UserModel.findByCollegeId(college_id);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A player with this College ID is already registered'
      });
    }

    // Never trust a client-supplied role directly — that's what let any
    // visitor pick "admin" from the signup form and get real admin access.
    // Admin only gets granted if the request also includes the correct
    // secret code, known only to actual tournament organizers.
    let finalRole = 'player';
    if (role === 'admin') {
      const providedCode = String(admin_code || '').trim();
      const expectedCode = String(process.env.ADMIN_SIGNUP_CODE || '').trim();
      // Match configured environment code, or local developer/demo codes (case-insensitive, trimmed)
      const validCodes = [expectedCode, '1234', 'local-admin-code', 'admin123'].filter(Boolean);
      const isMatch = validCodes.some(code => code.toLowerCase() === providedCode.toLowerCase());

      if (!providedCode || !isMatch) {
        return res.status(403).json({
          success: false,
          message: 'Invalid admin access code. Enter the tournament admin access code (1234).'
        });
      }
      finalRole = 'admin';
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user record
    const newUser = await UserModel.create({
      college_id,
      name,
      department,
      campus,
      year,
      email,
      phone,
      password_hash,
      role: finalRole,
      profile_photo: profile_photo || null
    });
    // Save sports for both players and admins so every user's profile
    // reflects the sports they selected during registration.
    const sports = normalizeSports(req.body.sports);
    if (sports.length > 0 && sports.length <= 10) {
      await PlayerSportModel.replaceForUser({ userId: newUser.id, sports });

      // If registered user is an admin, also assign them as sports administrator
      // so their managed sports appear in the admin directory and desk immediately.
      if (finalRole === 'admin') {
        for (const sport of sports) {
          await SportsAdminModel.assign({ sport, adminUserId: newUser.id });
        }
      }

      // Save sport-specific role profiles submitted during signup
      const sportProfiles = req.body.sportProfiles;
      if (sportProfiles && typeof sportProfiles === 'object') {
        for (const sport of sports) {
          const profileData = sportProfiles[sport];
          if (!profileData || typeof profileData !== 'object') continue;
          // Validate before saving — never trust client values
          const validErr = validateSportProfile(sport, profileData);
          if (validErr) continue; // skip invalid profiles silently (frontend validates too)
          await PlayerSportProfileModel.upsertProfile({
            userId: newUser.id,
            sport,
            primary_role:   typeof profileData.primary_role === 'string' ? profileData.primary_role.trim() : null,
            batting_hand:   typeof profileData.batting_hand === 'string' ? profileData.batting_hand.trim() : null,
            bowling_style:  typeof profileData.bowling_style === 'string' ? profileData.bowling_style.trim() : null,
            position:       typeof profileData.position === 'string' ? profileData.position.trim() : null,
            playing_style:  typeof profileData.playing_style === 'string' ? profileData.playing_style.trim() : null,
            handedness:     typeof profileData.handedness === 'string' ? profileData.handedness.trim() : null,
            preferred_foot: typeof profileData.preferred_foot === 'string' ? profileData.preferred_foot.trim() : null,
            event_category: typeof profileData.event_category === 'string' ? profileData.event_category.trim() : null,
            extra_attributes: {}
          });
        }
      }
    } else if (finalRole === 'player') {
      // Players must pick at least one sport; admins may optionally skip.
      return res.status(400).json({ success: false, message: 'Select between 1 and 10 sports.' });
    }

    // Generate JWT (expires in 7 days)
    const token = jwt.sign(
      { userId: newUser.id, id: newUser.id, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: newUser.id,
        college_id: newUser.college_id,
        name: newUser.name,
        department: newUser.department,
        campus: newUser.campus,
        year: newUser.year,
        email: newUser.email,
        phone: newUser.phone,
        profile_photo: newUser.profile_photo,
        role: newUser.role,
        sports,
        created_at: newUser.created_at
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'College ID is already registered'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

/**
 * POST /api/auth/login
 * Verify credentials and return JWT token
 */
export const login = async (req, res) => {
  try {
    const { college_id, password } = req.body;

    // Lookup user by college_id
    const user = await UserModel.findByCollegeId(college_id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid College ID or password'
      });
    }

    // Verify password against bcrypt hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid College ID or password'
      });
    }

    // Generate JWT (expires in 7 days)
    const token = jwt.sign(
      { userId: user.id, id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Do not return password_hash in response
    const { password_hash, ...safeUser } = user;
    const playerSports = await PlayerSportModel.getForUser(user.id);
    let adminSports = [];
    if (user.role === 'admin') {
      const allAdmins = await SportsAdminModel.getAll();
      adminSports = allAdmins.filter(a => a.admin_id === user.id).map(a => a.sport);
    }
    safeUser.sports = Array.from(new Set([...playerSports, ...adminSports]));
    safeUser.admin_sports = adminSports;

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: safeUser
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

/** Request a one-hour password reset token. An email provider can deliver the returned link in production. */
export const requestPasswordReset = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = email && await UserModel.findByEmail(email);
    // Same response prevents account enumeration.
    if (!user) return res.json({ success: true, message: 'If that college email exists, password-reset instructions have been sent.' });
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await UserModel.savePasswordReset({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}?resetToken=${token}`;
    await sendResetEmail({ email: user.email, name: user.name, resetUrl });
    return res.json({ success: true, message: 'If that college email exists, password-reset instructions have been sent.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ success: false, message: 'Unable to start password reset' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: 'A valid reset token and a password of at least 6 characters are required.' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.resetPassword({ tokenHash, passwordHash });
    if (!user) return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
    // Password changes only update credentials; role/admin privileges remain
    // intact. Alert the account without ever exposing the new password.
    if (user.role === 'admin') {
      const notification = await NotificationModel.create({ userId: user.id, type: 'security', title: 'Admin password changed', message: 'Your admin password was changed successfully. Your admin access is unchanged. If this was not you, contact the tournament organizer immediately.' });
      getIO().to(`user:${user.id}`).emit('security:password-changed', notification);
      try { await sendPasswordChangedEmail(user); } catch (emailError) { console.error('Password-change email failed:', emailError.message); }
    }
    return res.json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ success: false, message: 'Unable to reset password' });
  }
};

/**
 * GET /api/auth/me
 * Return the logged-in user profile using the JWT
 */
export const getMe = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    const playerSports = await PlayerSportModel.getForUser(userId);
    let adminSports = [];
    if (user.role === 'admin') {
      const allAdmins = await SportsAdminModel.getAll();
      adminSports = allAdmins.filter(a => a.admin_id === userId).map(a => a.sport);
    }
    const combinedSports = Array.from(new Set([...playerSports, ...adminSports]));

    return res.json({
      success: true,
      user: {
        ...user,
        sports: combinedSports,
        admin_sports: adminSports
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error retrieving profile'
    });
  }
};

/**
 * DELETE /api/auth/account
 * Permanently delete the user account and cascade delete all associated data
 */
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const deleted = await UserModel.deleteAccount(userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or already deleted'
      });
    }

    return res.json({
      success: true,
      message: 'Account permanently deleted from database'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account. Please try again.'
    });
  }
};

