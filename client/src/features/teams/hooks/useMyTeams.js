import { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../../../utils/authFetch';

export function useMyTeams(token) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTeams = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teams/mine', {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTeams(data.teams || []);
      } else {
        setError(data.message || 'Failed to load teams');
      }
    } catch (err) {
      setError(err.message || 'Connection error loading teams');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return { teams, setTeams, loading, error, setError, refetch: fetchTeams };
}
