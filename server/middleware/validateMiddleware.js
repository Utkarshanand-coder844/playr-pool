/**
 * Middleware to validate registration (signup) payload
 */
export const validateSignup = (req, res, next) => {
  const { college_id, name, department, campus, year, email, phone, password, role } = req.body;

  const errors = [];

  // Required checks
  if (!college_id || !college_id.trim()) errors.push('College ID is required');
  if (!name || !name.trim()) errors.push('Name is required');
  if (!department || !department.trim()) errors.push('Department is required');
  if (!campus || !campus.trim()) errors.push('Campus is required');
  if (!year || !year.toString().trim()) errors.push('Year is required');
  if (!email || !email.trim()) errors.push('Email is required');
  if (!phone || !phone.trim()) errors.push('Phone is required');
  if (!password) errors.push('Password is required');

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email.trim())) {
    errors.push('Please enter a valid email address');
  }

  // Password minimum length validation (>= 6)
  if (password && password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  // Optional role validation if provided
  if (role && !['player', 'admin'].includes(role.toLowerCase())) {
    errors.push("Role must be either 'player' or 'admin'");
  }
  if ((!role || role === 'player') && (!Array.isArray(req.body.sports) || req.body.sports.length === 0)) {
    errors.push('Select at least one sport');
  }
  if ((!role || role === 'player') && Array.isArray(req.body.sports) && req.body.sports.some(sport => typeof sport !== 'string' || !sport.trim() || sport.trim().length > 60)) {
    errors.push('Each selected sport must be between 1 and 60 characters');
  }

  if (req.body.profile_photo) {
    const photo = req.body.profile_photo;
    if (typeof photo !== 'string' || photo.length > 180000 || !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
      errors.push('Profile photo must be a small JPEG, PNG, or WebP image');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors
    });
  }

  next();
};

/**
 * Middleware to validate login payload
 */
export const validateLogin = (req, res, next) => {
  const { college_id, password } = req.body;

  if (!college_id || !college_id.trim()) {
    return res.status(400).json({
      success: false,
      message: 'College ID is required'
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required'
    });
  }

  next();
};

/**
 * Validate tournament creation payload
 */
export const validateCreateTournament = (req, res, next) => {
  const { name, description, campus, sports, status, registration_opens_at, registration_closes_at } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('Tournament name is required');
  } else if (name.trim().length < 2 || name.trim().length > 150) {
    errors.push('Tournament name must be between 2 and 150 characters');
  }

  if (description && (typeof description !== 'string' || description.trim().length > 2000)) {
    errors.push('Description cannot exceed 2000 characters');
  }

  if (campus && (typeof campus !== 'string' || campus.trim().length > 100)) {
    errors.push('Campus name cannot exceed 100 characters');
  }

  if (sports !== undefined) {
    if (!Array.isArray(sports)) {
      errors.push('Sports must be an array of sport names');
    } else if (sports.some(s => typeof s !== 'string' || !s.trim() || s.trim().length > 60)) {
      errors.push('Each sport must be a non-empty string under 60 characters');
    }
  }

  const allowedStatuses = ['draft', 'registration', 'live', 'completed'];
  if (status && !allowedStatuses.includes(status.toLowerCase())) {
    errors.push("Status must be one of 'draft', 'registration', 'live', or 'completed'");
  }

  if (registration_opens_at && Number.isNaN(new Date(registration_opens_at).getTime())) {
    errors.push('Invalid registration opening date');
  }
  if (registration_closes_at && Number.isNaN(new Date(registration_closes_at).getTime())) {
    errors.push('Invalid registration closing date');
  }
  if (registration_opens_at && registration_closes_at) {
    if (new Date(registration_opens_at) >= new Date(registration_closes_at)) {
      errors.push('Registration closing date must be after opening date');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors
    });
  }

  next();
};

/**
 * Validate tournament update payload
 */
export const validateUpdateTournament = (req, res, next) => {
  const { name, description, campus, sports, status, registration_opens_at, registration_closes_at } = req.body;
  const errors = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length < 2 || name.trim().length > 150) {
      errors.push('Tournament name must be between 2 and 150 characters');
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.trim().length > 2000) {
      errors.push('Description cannot exceed 2000 characters');
    }
  }

  if (campus !== undefined) {
    if (typeof campus !== 'string' || !campus.trim() || campus.trim().length > 100) {
      errors.push('Campus name must be between 1 and 100 characters');
    }
  }

  if (sports !== undefined) {
    if (!Array.isArray(sports)) {
      errors.push('Sports must be an array of sport names');
    } else if (sports.some(s => typeof s !== 'string' || !s.trim() || s.trim().length > 60)) {
      errors.push('Each sport must be a non-empty string under 60 characters');
    }
  }

  const allowedStatuses = ['draft', 'registration', 'live', 'completed'];
  if (status !== undefined && !allowedStatuses.includes(status.toLowerCase())) {
    errors.push("Status must be one of 'draft', 'registration', 'live', or 'completed'");
  }

  if (registration_opens_at && Number.isNaN(new Date(registration_opens_at).getTime())) {
    errors.push('Invalid registration opening date');
  }
  if (registration_closes_at && Number.isNaN(new Date(registration_closes_at).getTime())) {
    errors.push('Invalid registration closing date');
  }
  if (registration_opens_at && registration_closes_at) {
    if (new Date(registration_opens_at) >= new Date(registration_closes_at)) {
      errors.push('Registration closing date must be after opening date');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors
    });
  }

  next();
};

/**
 * Validate promote to admin request
 */
export const validateTournamentAdminPromotion = (req, res, next) => {
  const userId = req.body?.userId || req.body?.user_id;
  if (!userId || typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Valid user ID is required to promote to admin'
    });
  }
  req.targetUserId = userId.trim();
  next();
};

/**
 * Validate tournament team entry
 */
export const validateTournamentTeamEntry = (req, res, next) => {
  const teamId = req.body?.teamId || req.body?.team_id;
  if (!teamId || typeof teamId !== 'string' || !/^[0-9a-f-]{36}$/i.test(teamId.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Valid team ID is required to enter tournament'
    });
  }
  req.teamId = teamId.trim();
  next();
};
