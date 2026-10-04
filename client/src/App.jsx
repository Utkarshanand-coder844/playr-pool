import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { MyTeam } from './pages/MyTeam';
import { AdminDashboard } from './pages/AdminDashboard';
import { Leaderboard } from './pages/Leaderboard';
import { Schedule } from './pages/Schedule';
import { ScoreHub } from './pages/Bracket';
import { TeamProfile } from './pages/TeamProfile';
import { PlayerProfile } from './pages/PlayerProfile';
import { Events } from './pages/Events';
import { Notifications } from './pages/Notifications';
import { SportsAdmins } from './pages/SportsAdmins';
import { MySports } from './pages/MySports';
import { EditProfile } from './pages/EditProfile';
import { Chat } from './pages/Chat';
import { Discover } from './pages/Discover';
import { LiveScoring } from './pages/LiveScoring';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { ScoreToast } from './components/ScoreToast';
import { CampusClashLoader } from './components/CampusClashLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';

function MainLayout() {
  const { isAuthenticated } = useAuth();
  // Check URL for ?match= deep link on first load
  const urlParams = new URLSearchParams(window.location.search);
  const initialMatchId = urlParams.get('match');
  const [currentView, setCurrentView] = useState(initialMatchId ? 'schedule' : 'login');
  const [viewParams, setViewParams] = useState(null);

  // navigate() replaces plain setCurrentView so pages can optionally pass a
  // param along with the view name (e.g. which team ID to open a profile for).
  // Existing calls like onNavigate('dashboard') still work unchanged, since
  // params defaults to null.
  const navigate = (view, params = null) => {
    setCurrentView(view);
    setViewParams(params);
  };

  // Auto-switch to dashboard if logged in and currently on login or signup
  React.useEffect(() => {
    if (isAuthenticated && (currentView === 'login' || currentView === 'signup')) {
      navigate('dashboard');
    }
  }, [isAuthenticated, currentView]);

  return (
    <div className="app-container">
      <Navbar currentView={currentView} onViewChange={navigate} />
      <ScoreToast />
      <NetworkStatusIndicator />
      <main className="main-content">
        <ErrorBoundary onReset={() => navigate('dashboard')}>
          {currentView === 'login' && <Login onNavigate={navigate} />}
          {currentView === 'forgot-password' && <ForgotPassword onNavigate={navigate} />}
          {currentView === 'signup' && <Signup onNavigate={navigate} />}
          {currentView === 'leaderboard' && <Leaderboard onNavigate={navigate} />}
          {currentView === 'schedule' && <Schedule onNavigate={navigate} focusMatchId={initialMatchId} />}
          {currentView === 'scorehub' && <ScoreHub />}
          {currentView === 'events' && <Events />}
          {currentView === 'live-scoring' && <LiveScoring onNavigate={navigate} />}
          {currentView === 'notifications' && <ProtectedRoute onNavigate={navigate}><Notifications onNavigate={navigate} /></ProtectedRoute>}
          {currentView === 'sports-admins' && <ProtectedRoute onNavigate={navigate}><SportsAdmins onNavigate={navigate} /></ProtectedRoute>}
          {currentView === 'my-sports' && <ProtectedRoute onNavigate={navigate}><MySports /></ProtectedRoute>}
          {currentView === 'chat' && <ProtectedRoute onNavigate={navigate}><Chat playerId={viewParams} /></ProtectedRoute>}
          {currentView === 'discover' && <ProtectedRoute onNavigate={navigate}><Discover onNavigate={navigate} /></ProtectedRoute>}
          {currentView === 'edit-profile' && <ProtectedRoute onNavigate={navigate}><EditProfile onNavigate={navigate} /></ProtectedRoute>}
          {currentView === 'team-profile' && <TeamProfile teamId={viewParams} onNavigate={navigate} />}
          {currentView === 'player-profile' && <PlayerProfile playerId={viewParams} onNavigate={navigate} />}
          {currentView === 'dashboard' && (
            <ProtectedRoute onNavigate={navigate}>
              <Dashboard onNavigate={navigate} />
            </ProtectedRoute>
          )}
          {currentView === 'my-team' && (
            <ProtectedRoute onNavigate={navigate}>
              <MyTeam onNavigate={navigate} />
            </ProtectedRoute>
          )}
          {currentView === 'admin-dashboard' && (
            <AdminRoute onNavigate={navigate}>
              <AdminDashboard onNavigate={navigate} />
            </AdminRoute>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  const [loaderPhase, setLoaderPhase] = useState('loading');

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setLoaderPhase('exiting'), 700);
    const hideTimer = window.setTimeout(() => setLoaderPhase('complete'), 1000);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <AuthProvider>
      <MainLayout />
      {loaderPhase !== 'complete' && <CampusClashLoader isExiting={loaderPhase === 'exiting'} />}
    </AuthProvider>
  );
}
