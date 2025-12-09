import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { ProReports } from './pages/ProReports';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminSettings } from './pages/AdminSettings';
import { WorkspaceOsteo } from './pages/WorkspaceOsteo';
import { Planning } from './pages/Planning';
import { ConsultationPage } from './pages/ConsultationPage';
import { DemoConsultation } from './pages/DemoConsultation';
import { EmployeeSchedule } from './pages/EmployeeSchedule';
import { EmployeeDocuments } from './pages/EmployeeDocuments';
import { EmployeeRme } from './pages/EmployeeRme';
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
        <img src="/logo-poge.png" alt="POGE" className="loading-logo" />
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

        {/* Espace Employé - Mes Horaires */}
        <Route 
          path="/employee/schedule" 
          element={
            user ? <EmployeeSchedule /> : <Navigate to="/login" replace />
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
