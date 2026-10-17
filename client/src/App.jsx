import React, { useEffect, useState, Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute, AdminRoute, SuperAdminRoute } from './components/ProtectedRoute';
import { ScoreToast } from './components/ScoreToast';
import { CampusClashLoader } from './components/CampusClashLoader';
import BackgroundArt from './components/BackgroundArt';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';

// Code-split pages via React.lazy for high-performance chunking
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const ForgotPassword = lazy(() =>
  import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword }))
);
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const MyTeam = lazy(() => import('./pages/MyTeam').then((m) => ({ default: m.MyTeam })));
const AdminDashboard = lazy(() =>
  import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const Leaderboard = lazy(() =>
  import('./pages/Leaderboard').then((m) => ({ default: m.Leaderboard }))
);
const Schedule = lazy(() => import('./pages/Schedule').then((m) => ({ default: m.Schedule })));
const ScoreHub = lazy(() => import('./pages/Bracket').then((m) => ({ default: m.ScoreHub })));
const TeamProfile = lazy(() =>
  import('./pages/TeamProfile').then((m) => ({ default: m.TeamProfile }))
);
const PlayerProfile = lazy(() =>
  import('./pages/PlayerProfile').then((m) => ({ default: m.PlayerProfile }))
);
const PlayerInsights = lazy(() =>
  import('./pages/PlayerInsights').then((m) => ({ default: m.PlayerInsights }))
);
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })));
const Notifications = lazy(() =>
  import('./pages/Notifications').then((m) => ({ default: m.Notifications }))
);
const SportsAdmins = lazy(() =>
  import('./pages/SportsAdmins').then((m) => ({ default: m.SportsAdmins }))
);
const MySports = lazy(() => import('./pages/MySports').then((m) => ({ default: m.MySports })));
const Chat = lazy(() => import('./pages/Chat').then((m) => ({ default: m.Chat })));
const Discover = lazy(() => import('./pages/Discover').then((m) => ({ default: m.Discover })));
const LiveScoring = lazy(() =>
  import('./pages/LiveScoring').then((m) => ({ default: m.LiveScoring }))
);
const Scorecard = lazy(() => import('./pages/Scorecard').then((m) => ({ default: m.Scorecard })));
const Tournaments = lazy(() =>
  import('./pages/Tournaments').then((m) => ({ default: m.Tournaments }))
);
const EditProfile = lazy(() =>
  import('./pages/EditProfile').then((m) => ({ default: m.EditProfile }))
);
const CommunityFeedback = lazy(() =>
  import('./pages/CommunityFeedback').then((m) => ({ default: m.CommunityFeedback }))
);

// Fallback spinner while route chunk loads
function PageFallback() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '40vh',
        color: 'var(--text-muted)'
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: 'var(--accent-cyan)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }}
      />
    </div>
  );
}

// Redirect handler for root route, preserving ?match= deep links
function RootRedirect() {
  const [params] = useSearchParams();
  const matchId = params.get('match');
  const { isAuthenticated } = useAuth();
  if (matchId) {
    return <Navigate to={`/matches/${matchId}`} replace />;
  }
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

// Route param wrappers
function MatchRouteWrapper({ onNavigate }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <Scorecard matchId={id || params.get('match')} onNavigate={onNavigate} />;
}

function ScheduleRouteWrapper({ onNavigate }) {
  const [params] = useSearchParams();
  return <Schedule focusMatchId={params.get('match')} onNavigate={onNavigate} />;
}

function TeamRouteWrapper({ onNavigate }) {
  const { id } = useParams();
  return <TeamProfile teamId={id} onNavigate={onNavigate} />;
}

function PlayerRouteWrapper({ onNavigate }) {
  const { id } = useParams();
  return <PlayerProfile playerId={id} onNavigate={onNavigate} />;
}

function InsightsRouteWrapper({ onNavigate }) {
  const { id } = useParams();
  return <PlayerInsights playerId={id} onNavigate={onNavigate} />;
}

function ChatRouteWrapper({ onNavigate }) {
  const { id } = useParams();
  return <Chat playerId={id} onNavigate={onNavigate} />;
}

function TournamentAdminRouteWrapper({ onNavigate }) {
  const { id } = useParams();
  return <AdminDashboard tournamentId={id} onNavigate={onNavigate} />;
}

function MainLayout() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Backward-compatible navigate handler for existing component callbacks
  const handleNavigate = (view, params = null) => {
    switch (view) {
      case 'login':
        navigate('/login');
        break;
      case 'signup':
        navigate('/signup');
        break;
      case 'forgot-password':
        navigate('/forgot-password');
        break;
      case 'dashboard':
        navigate('/dashboard');
        break;
      case 'my-team':
        navigate('/my-team');
        break;
      case 'tournaments':
        navigate('/tournaments');
        break;
      case 'admin-dashboard':
        navigate(params ? `/tournaments/${params}/admin` : '/admin');
        break;
      case 'schedule':
        navigate(params ? `/schedule?match=${params}` : '/schedule');
        break;
      case 'scorecard':
        navigate(params ? `/matches/${params}` : '/scorecard');
        break;
      case 'leaderboard':
        navigate('/leaderboard');
        break;
      case 'scorehub':
        navigate('/scorehub');
        break;
      case 'events':
        navigate('/events');
        break;
      case 'live-scoring':
        navigate(params ? `/live-scoring?match=${params}` : '/live-scoring');
        break;
      case 'notifications':
        navigate('/notifications');
        break;
      case 'sports-admins':
        navigate('/sports-admins');
        break;
      case 'my-sports':
        navigate('/my-sports');
        break;
      case 'chat':
        navigate(params ? `/chat/${params}` : '/chat');
        break;
      case 'discover':
        navigate('/discover');
        break;
      case 'edit-profile':
        navigate('/edit-profile');
        break;
      case 'team-profile':
        navigate(`/teams/${params}`);
        break;
      case 'player-profile':
        navigate(`/players/${params}`);
        break;
      case 'player-insights':
        navigate(params ? `/player-insights/${params}` : '/player-insights');
        break;
      case 'experiences':
      case 'reviews':
      case 'feedback':
      case 'community':
        navigate('/feedback');
        break;
      default:
        navigate(`/${view}`);
    }
  };

  // Auto-switch away from login/signup when logged in
  useEffect(() => {
    if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/signup')) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  // Derive currentView name from pathname for Navbar highlighting
  const currentView = location.pathname.slice(1).split('/')[0] || 'dashboard';

  return (
    <div className="app-container">
      <BackgroundArt photo="/bg-sports-art.jpg" />
      <Navbar currentView={currentView} onViewChange={handleNavigate} />
      <ScoreToast />
      <NetworkStatusIndicator />
      <main className="main-content">
        <ErrorBoundary onReset={() => handleNavigate('dashboard')}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Root with ?match= deep link handling */}
              <Route path="/" element={<RootRedirect />} />

              {/* Public & Auth Routes */}
              <Route path="/login" element={<Login onNavigate={handleNavigate} />} />
              <Route
                path="/forgot-password"
                element={<ForgotPassword onNavigate={handleNavigate} />}
              />
              <Route path="/signup" element={<Signup onNavigate={handleNavigate} />} />
              <Route
                path="/leaderboard"
                element={<Leaderboard onNavigate={handleNavigate} />}
              />
              <Route
                path="/schedule"
                element={<ScheduleRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route path="/scorehub" element={<ScoreHub />} />
              <Route path="/events" element={<Events />} />
              <Route
                path="/feedback"
                element={<CommunityFeedback onNavigate={handleNavigate} />}
              />
              <Route
                path="/community"
                element={<CommunityFeedback onNavigate={handleNavigate} />}
              />
              <Route
                path="/experiences"
                element={<CommunityFeedback onNavigate={handleNavigate} />}
              />
              <Route
                path="/reviews"
                element={<CommunityFeedback onNavigate={handleNavigate} />}
              />
              <Route
                path="/live-scoring"
                element={<LiveScoring onNavigate={handleNavigate} />}
              />
              <Route
                path="/matches/:id"
                element={<MatchRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route
                path="/scorecard/:id"
                element={<MatchRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route
                path="/scorecard"
                element={<MatchRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route
                path="/teams/:id"
                element={<TeamRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route
                path="/players/:id"
                element={<PlayerRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route
                path="/player-insights"
                element={<InsightsRouteWrapper onNavigate={handleNavigate} />}
              />
              <Route
                path="/player-insights/:id"
                element={<InsightsRouteWrapper onNavigate={handleNavigate} />}
              />

              {/* Protected Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <Dashboard onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-team"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <MyTeam onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tournaments"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <Tournaments onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <Notifications onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sports-admins"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <SportsAdmins onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-sports"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <MySports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <ChatRouteWrapper onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:id"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <ChatRouteWrapper onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/discover"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <Discover onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/edit-profile"
                element={
                  <ProtectedRoute onNavigate={handleNavigate}>
                    <EditProfile onNavigate={handleNavigate} />
                  </ProtectedRoute>
                }
              />

              {/* Admin Routes: Super-admin only platform-wide desk */}
              <Route
                path="/admin"
                element={
                  <SuperAdminRoute onNavigate={handleNavigate}>
                    <AdminDashboard onNavigate={handleNavigate} />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/tournaments/:id/admin"
                element={
                  <AdminRoute onNavigate={handleNavigate}>
                    <TournamentAdminRouteWrapper onNavigate={handleNavigate} />
                  </AdminRoute>
                }
              />

              {/* Catch-all redirect */}
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  const [loaderPhase, setLoaderPhase] = useState('loading');

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setLoaderPhase('exiting'), 2300);
    const hideTimer = window.setTimeout(() => setLoaderPhase('complete'), 2950);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  const handleDismissIntro = () => {
    setLoaderPhase('exiting');
    window.setTimeout(() => setLoaderPhase('complete'), 600);
  };

  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <MainLayout />
          {loaderPhase !== 'complete' && (
            <CampusClashLoader
              isExiting={loaderPhase === 'exiting'}
              onDismiss={handleDismissIntro}
            />
          )}
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
