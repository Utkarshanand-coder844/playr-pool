import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getAuthHeaders } from '../utils/authFetch';

const AuthContext = createContext(null);

const TOKEN_KEY = 'playrpool_auth_token';
const USER_KEY = 'playrpool_auth_user';

export const AuthProvider = ({ children }) => {
  // Persist token and user across page reloads and tab navigations
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(false);

  /**
   * Log in user by storing JWT and user details in memory and localStorage
   */
  const login = useCallback((newToken, userData) => {
    try {
      if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
      if (userData) localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch {}
    setToken(newToken);
    setUser(userData);
  }, []);

  /**
   * Log out user by wiping in-memory state and localStorage
   */
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    setToken(null);
    setUser(null);
  }, []);

  /**
   * Fetch latest profile from backend /api/auth/me using token
   */
  const fetchProfile = useCallback(async () => {
    if (!token) return null;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/me', {
        headers: getAuthHeaders(token)
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setUser(data.user);
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } catch {}
        return data.user;
      } else {
        // If token is explicitly rejected (401 / 403), wipe invalid session
        if (response.status === 401 || response.status === 403) {
          logout();
        }
        return null;
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [token, logout]);

  // Validate session on mount if token is present
  useEffect(() => {
    if (token) {
      fetchProfile();
    }
  }, []); // Run once on mount

  /**
   * Permanently delete user account from database and clear local session
   */
  const deleteAccount = useCallback(async () => {
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete account');
      }
      logout();
      return true;
    } catch (err) {
      console.error('Delete account failed:', err);
      throw err;
    }
  }, [token, logout]);

  /**
   * Update editable registration fields and refresh AuthContext user state
   */
  const updateProfile = useCallback(async (profileData) => {
    if (!token) throw new Error('Not authenticated');
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(profileData)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to update profile');
    }
    // Sync updated user into context + localStorage
    setUser(data.user);
    try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch {}
    return data.user;
  }, [token]);

  const value = {
    token,
    user,
    isAuthenticated: !!token,
    isLoading,
    login,
    logout,
    deleteAccount,
    updateProfile,
    fetchProfile
  };


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
