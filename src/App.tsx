import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { getClientIp, takeLocationControl, updateOsteoLocation } from './services/osteoLocationService';
import { getEmployeeProfile } from './services/profileService';

// Générer un ID de session unique pour cette instance
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
import { ProReports } from './pages/ProReports';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminSettings } from './pages/AdminSettings';
import { WorkspaceOsteo } from './pages/WorkspaceOsteo';
import { AccueilWorkspace } from './pages/AccueilWorkspace';
import { Planning } from './pages/Planning';
import { ConsultationPage } from './pages/ConsultationPage';
import { DemoConsultation } from './pages/DemoConsultation';
import { EmployeeSchedule } from './pages/EmployeeSchedule';
import { EmployeeDocuments } from './pages/EmployeeDocuments';
import { EmployeeRme } from './pages/EmployeeRme';
import { BankAccountPage } from './pages/BankAccountPage';
import { InsuranceReportsOsteo } from './pages/InsuranceReportsOsteo';
import { InsuranceReportsReview } from './pages/InsuranceReportsReview';
import { InsuranceReportsUpload } from './pages/InsuranceReportsUpload';
import { InsuranceReportsDashboard } from './pages/InsuranceReportsDashboard';
import { InsuranceReportDetail } from './pages/InsuranceReportDetail';
import FloorPlanSettings from './pages/FloorPlanSettings';
import type { TeamMember } from './types';
import './App.css';

function App() {
  const [user, setUser] = useState<TeamMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Vérifier si l'utilisateur est déjà connecté (localStorage)
  useEffect(() => {
    const savedUser = localStorage.getItem('poge_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('poge_user');
      }
    }
    setIsLoading(false);
  }, []);

  // Mettre à jour la localisation de l'ostéo basée sur l'IP (sur toutes les pages)
  const [locationInitialized, setLocationInitialized] = useState(false);
  
  const updateLocation = useCallback(async (isFirstCall: boolean = false) => {
    if (!user) return;
    
    try {
      const employeeId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const profile = await getEmployeeProfile(employeeId);
      
      if (profile?.externalIds?.id_externe_agenda) {
        const agendaId = parseInt(profile.externalIds.id_externe_agenda, 10);
        if (!isNaN(agendaId)) {
          const ip = await getClientIp();
          if (ip) {
            let roomId: string | null;
            if (isFirstCall) {
              // Premier appel : prendre le contrôle (nouvelle session)
              roomId = await takeLocationControl(employeeId, agendaId, ip, SESSION_ID);
              console.log(`[App] Nouvelle session ${SESSION_ID.slice(0, 8)}: IP=${ip}, salle=${roomId || 'inconnue'}`);
            } else {
              // Appels suivants : mettre à jour si c'est notre session
              roomId = await updateOsteoLocation(employeeId, agendaId, ip, SESSION_ID);
              if (roomId) {
                console.log(`[App] Position mise à jour: IP=${ip}, salle=${roomId}`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[App] Erreur mise à jour localisation:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    // Premier appel : prendre le contrôle
    if (!locationInitialized) {
      updateLocation(true);
      setLocationInitialized(true);
    }
    
    // Puis toutes les 2 minutes
    const interval = setInterval(() => updateLocation(false), 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user, updateLocation, locationInitialized]);

  const handleLogin = (loggedUser: TeamMember) => {
    setUser(loggedUser);
    localStorage.setItem('poge_user', JSON.stringify(loggedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('poge_user');
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <img src="/logo-synapse.png" alt="Synapse" className="loading-logo synapse" />
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Page de connexion */}
        <Route 
          path="/login" 
          element={
            user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />
          } 
        />

        {/* Page de réinitialisation de mot de passe */}
        <Route 
          path="/reset-password" 
          element={<ResetPasswordPage />} 
        />

        {/* Dashboard */}
        <Route 
          path="/dashboard" 
          element={
            user ? (
              <Dashboard 
                user={user} 
                onUserChange={(newUser) => {
                  setUser(newUser);
                  localStorage.setItem('poge_user', JSON.stringify(newUser));
                }}
                onLogout={() => {
                  localStorage.removeItem('poge_user');
                  window.location.href = '/login';
                }}
              />
            ) : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Pro - Espace de travail Ostéo */}
        <Route 
          path="/pro/workspace" 
          element={
            user ? <WorkspaceOsteo user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Accueil - Gestion des arrivées */}
        <Route 
          path="/reception/workspace" 
          element={
            user ? <AccueilWorkspace user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Pro - Consultation patient */}
        <Route 
          path="/pro/consultation/:appointmentId" 
          element={
            user ? <ConsultationPage user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Pro - Démo Transcription */}
        <Route 
          path="/pro/demo" 
          element={
            user ? <DemoConsultation /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Pro - Planning */}
        <Route 
          path="/pro/planning" 
          element={
            user ? <Planning /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Pro - Rapports */}
        <Route 
          path="/pro/reports" 
          element={
            user ? <ProReports user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Pro - Rapports d'Assurance (Ostéo) */}
        <Route 
          path="/pro/insurance-reports" 
          element={
            user ? <InsuranceReportsOsteo user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Direction - Supervision Rapports d'Assurance */}
        <Route 
          path="/direction/reports-review" 
          element={
            user ? <InsuranceReportsReview user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Accueil - Upload Rapports d'Assurance */}
        <Route 
          path="/reception/insurance-upload" 
          element={
            user ? <InsuranceReportsUpload user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Tableau de bord Rapports d'Assurance (Direction & Admin) */}
        <Route 
          path="/insurance-reports" 
          element={
            user ? <InsuranceReportsDashboard user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Détail rapport assurance */}
        <Route
          path="/insurance-report/:id"
          element={
            user ? <InsuranceReportDetail user={user} /> : <Navigate to="/login" replace />
          }
        />

        {/* Profil employé */}
        <Route 
          path="/employee/profile" 
          element={
            user ? <ProfilePage user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Admin - Paramètres (super admin uniquement) */}
        <Route 
          path="/admin/settings" 
          element={
            user?.isSuperAdmin ? <AdminSettings /> : <Navigate to="/dashboard" replace />
          } 
        />

        {/* Admin - Configuration Plan Cabinet */}
        <Route 
          path="/admin/floor-plan" 
          element={
            user?.isSuperAdmin ? <FloorPlanSettings /> : <Navigate to="/dashboard" replace />
          } 
        />

        {/* Espace Employé - Mes Horaires */}
        <Route 
          path="/employee/schedule" 
          element={
            user ? <EmployeeSchedule user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Employé - Mes Documents */}
        <Route 
          path="/employee/documents" 
          element={
            user ? <EmployeeDocuments user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Employé - Formations RME */}
        <Route 
          path="/employee/rme" 
          element={
            user ? <EmployeeRme user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Espace Employé - Coordonnées Bancaires */}
        <Route 
          path="/employee/bank" 
          element={
            user ? <BankAccountPage user={user} /> : <Navigate to="/login" replace />
          } 
        />

        {/* Pages à venir - Espace Employé */}
        <Route 
          path="/employee/*" 
          element={
            user ? (
              <div className="coming-soon">
                <h1>Espace Employé</h1>
                <p>Cette section sera bientôt disponible</p>
                <button onClick={() => window.history.back()}>← Retour</button>
              </div>
            ) : <Navigate to="/login" replace />
          } 
        />

        {/* Pages à venir - Espace Pro autres */}
        <Route 
          path="/pro/*" 
          element={
            user ? (
              <div className="coming-soon">
                <h1>Espace Pro</h1>
                <p>Cette section sera bientôt disponible</p>
                <button onClick={() => window.history.back()}>← Retour</button>
              </div>
            ) : <Navigate to="/login" replace />
          } 
        />

        {/* Pages à venir - Espace Direction */}
        <Route 
          path="/direction/*" 
          element={
            user ? (
              <div className="coming-soon direction">
                <h1>Espace Direction</h1>
                <p>Cette fonctionnalité de gestion d'équipe sera bientôt disponible</p>
                <button onClick={() => window.history.back()}>← Retour</button>
              </div>
            ) : <Navigate to="/login" replace />
          } 
        />

        {/* Redirection par défaut */}
        <Route 
          path="*" 
          element={<Navigate to={user ? "/dashboard" : "/login"} replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
