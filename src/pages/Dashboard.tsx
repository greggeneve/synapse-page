import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Briefcase, 
  FileText, 
  Calendar, 
  CreditCard,
  Settings,
  Bell,
  ChevronRight,
  Clock,
  Shield,
  UserCog,
  LogOut,
  X,
  Stethoscope,
  Mic,
  CalendarDays,
  MessageSquare,
  Sparkles,
  Palmtree,
  ArrowLeftRight,
  FileCheck,
  GraduationCap
} from 'lucide-react';
import { isOsteopath } from '../services/rmeEmployeeService';
import { getAvailableUsers, loginAsUser } from '../services/authService';
import type { TeamMember } from '../types';

interface DashboardProps {
  user: TeamMember;
  onUserChange?: (user: TeamMember) => void;
  onLogout?: () => void;
}

export function Dashboard({ user, onUserChange, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<{ id: string; email: string; nom: string; prenom: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasRme, setHasRme] = useState(false);

  // Charger la liste des utilisateurs pour le super admin
  useEffect(() => {
    if (user.isSuperAdmin && showUserSelector) {
      getAvailableUsers().then(setAvailableUsers);
    }
  }, [user.isSuperAdmin, showUserSelector]);

  // Vérifier si l'employé est ostéopathe (a un RME)
  useEffect(() => {
    if (user.id) {
      isOsteopath(user.id.toString()).then(setHasRme);
    }
  }, [user.id]);

  // Se connecter en tant qu'un autre utilisateur
  const handleLoginAs = async (email: string) => {
    const result = await loginAsUser(user as any, email);
    if (result.success && result.user && onUserChange) {
      localStorage.setItem('poge_original_user', JSON.stringify(user));
      onUserChange(result.user);
      setShowUserSelector(false);
    }
  };

  // Revenir au compte original
  const handleReturnToOriginal = () => {
    const originalUserStr = localStorage.getItem('poge_original_user');
    if (originalUserStr && onUserChange) {
      const originalUser = JSON.parse(originalUserStr);
      localStorage.removeItem('poge_original_user');
      localStorage.setItem('poge_user', JSON.stringify(originalUser));
      onUserChange(originalUser);
    }
  };

  const filteredUsers = availableUsers.filter(u => 
    `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const today = new Date().toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="welcome-section">
          <div className="user-photo-large">
            {user.photo_url ? (
              <img src={user.photo_url} alt={`${user.prenom} ${user.nom}`} />
            ) : (
              <div className="photo-placeholder">
                {user.prenom[0]}{user.nom[0]}
              </div>
            )}
          </div>
          <div className="welcome-text">
            <h1>{greeting}, {user.prenom} !</h1>
            <p className="user-role">{user.fonction}</p>
            <p className="current-date">{today}</p>
          </div>
        </div>
        
        <div className="header-actions">
          {user.isSuperAdmin && (
            <button 
              className="btn-icon-header super-admin" 
              title="Connexion en tant que..."
              onClick={() => setShowUserSelector(true)}
            >
              <UserCog size={20} />
            </button>
          )}
          {user.isAdmin && (
            <button 
              className="btn-icon-header admin" 
              title="Administration"
              onClick={() => navigate('/admin/settings')}
            >
              <Settings size={20} />
            </button>
          )}
          <button className="btn-icon-header" title="Notifications">
            <Bell size={20} />
            <span className="notification-badge">2</span>
          </button>
          <button 
            className="btn-icon-header logout" 
            title="Déconnexion"
            onClick={onLogout}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Bandeau impersonation */}
      {user.impersonating && (
        <div className="impersonation-banner">
          <Shield size={16} />
          <span>Connecté en tant que <strong>{user.prenom} {user.nom}</strong> par {user.impersonating}</span>
          <button onClick={handleReturnToOriginal}>
            <X size={16} /> Revenir à mon compte
          </button>
        </div>
      )}

      {/* Modal sélection utilisateur */}
      {showUserSelector && (
        <div className="modal-overlay" onClick={() => setShowUserSelector(false)}>
          <div className="modal-content user-selector" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><UserCog size={20} /> Se connecter en tant que...</h2>
              <button className="btn-close" onClick={() => setShowUserSelector(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Rechercher un collaborateur..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
                autoFocus
              />
              <div className="user-list">
                {filteredUsers.map(u => (
                  <button 
                    key={u.id} 
                    className="user-item"
                    onClick={() => handleLoginAs(u.email)}
                  >
                    <div className="user-avatar-small">
                      {u.prenom[0]}{u.nom[0]}
                    </div>
                    <div className="user-info">
                      <span className="user-name">{u.prenom} {u.nom}</span>
                      <span className="user-email">{u.email}</span>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grille principale */}
      <div className="dashboard-grid">
        
        {/* ═══════════════════════════════════════════════════════════════
            ESPACE EMPLOYÉ - Administratif personnel
        ═══════════════════════════════════════════════════════════════ */}
        <section className="dashboard-section employee-section">
          <div className="section-header">
            <div className="section-icon employee">
              <User size={24} />
            </div>
            <div>
              <h2>Mon Espace Employé</h2>
              <p>Informations personnelles & gestion administrative</p>
            </div>
          </div>
          
          <div className="section-cards">
            {/* 1. Mon profil */}
            <button 
              className="dashboard-card"
              onClick={() => navigate('/employee/profile')}
            >
              <User size={20} />
              <div className="card-content">
                <h3>Mon profil</h3>
                <p>Informations personnelles</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* 2. Mes documents */}
            <button 
              className="dashboard-card"
              onClick={() => navigate('/employee/documents')}
            >
              <FileText size={20} />
              <div className="card-content">
                <h3>Mes documents</h3>
                <p>Fiches de paie, contrats</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* 3. Formations RME/ASCA (uniquement pour ostéopathes) */}
            {hasRme && (
              <button 
                className="dashboard-card highlight rme-card"
                onClick={() => navigate('/employee/rme')}
              >
                <GraduationCap size={20} />
                <div className="card-content">
                  <h3>Formations RME</h3>
                  <p>Heures, attestations, certificats</p>
                </div>
                <ChevronRight size={18} className="card-arrow" />
              </button>
            )}

            {/* 4. Mes horaires (inclut taux d'activité) */}
            <button 
              className="dashboard-card highlight"
              onClick={() => navigate('/employee/schedule')}
            >
              <CalendarDays size={20} />
              <div className="card-content">
                <h3>Mes horaires</h3>
                <p>Planning & taux d'activité</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* 4. Congés & Absences */}
            <button 
              className="dashboard-card highlight"
              onClick={() => navigate('/employee/leave')}
            >
              <Palmtree size={20} />
              <div className="card-content">
                <h3>Congés & Absences</h3>
                <p>Demandes, solde, historique</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Demandes en cours */}
            <button 
              className="dashboard-card"
              onClick={() => navigate('/employee/requests')}
            >
              <ArrowLeftRight size={20} />
              <div className="card-content">
                <h3>Mes demandes</h3>
                <p>Échanges, modifications</p>
              </div>
              <span className="card-badge">2</span>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Messages */}
            <button 
              className="dashboard-card"
              onClick={() => navigate('/employee/messages')}
            >
              <MessageSquare size={20} />
              <div className="card-content">
                <h3>Messages</h3>
                <p>Échanges & notifications</p>
              </div>
              <span className="card-badge">3</span>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Coordonnées bancaires */}
            <button 
              className="dashboard-card"
              onClick={() => navigate('/employee/bank')}
            >
              <CreditCard size={20} />
              <div className="card-content">
                <h3>Coordonnées bancaires</h3>
                <p>IBAN, modifications</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            ESPACE PRO - Activité métier (ostéopathie)
        ═══════════════════════════════════════════════════════════════ */}
        <section className="dashboard-section pro-section">
          <div className="section-header">
            <div className="section-icon pro">
              <Briefcase size={24} />
            </div>
            <div>
              <h2>Mon Activité Professionnelle</h2>
              <p>Consultations, rapports & outils métier</p>
            </div>
          </div>
          
          <div className="section-cards">
            {/* Planning consultations */}
            <button 
              className="dashboard-card highlight primary"
              onClick={() => navigate('/pro/planning')}
            >
              <Calendar size={20} />
              <div className="card-content">
                <h3>Mon Planning</h3>
                <p>Consultations jour/sem/mois</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Espace de travail */}
            <button 
              className="dashboard-card highlight"
              onClick={() => navigate('/pro/workspace')}
            >
              <Stethoscope size={20} />
              <div className="card-content">
                <h3>Espace de travail</h3>
                <p>Patients, salle d'attente</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Rapports */}
            <button 
              className="dashboard-card highlight"
              onClick={() => navigate('/pro/reports')}
            >
              <FileCheck size={20} />
              <div className="card-content">
                <h3>Rédiger un rapport</h3>
                <p>Rapports avec correction IA</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Statistiques */}
            <button 
              className="dashboard-card"
              onClick={() => navigate('/pro/stats')}
            >
              <Clock size={20} />
              <div className="card-content">
                <h3>Mes statistiques</h3>
                <p>Activité, CA, heures</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>

            {/* Démo Transcription */}
            <button 
              className="dashboard-card demo-card"
              onClick={() => navigate('/pro/demo')}
            >
              <Mic size={20} />
              <div className="card-content">
                <h3>🧪 Démo Transcription</h3>
                <p>Audio → Texte avec IA</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            ASSISTANT IA - Suggestions & automatisation
        ═══════════════════════════════════════════════════════════════ */}
        <section className="dashboard-section ai-section">
          <div className="section-header">
            <div className="section-icon ai">
              <Sparkles size={24} />
            </div>
            <div>
              <h2>Assistant IA</h2>
              <p>Suggestions intelligentes & automatisation</p>
            </div>
          </div>
          
          <div className="section-cards">
            <button 
              className="dashboard-card ai-card"
              onClick={() => navigate('/ai/schedule-assistant')}
            >
              <Sparkles size={20} />
              <div className="card-content">
                <h3>Optimisation planning</h3>
                <p>Suggestions d'échanges d'horaires</p>
              </div>
              <ChevronRight size={18} className="card-arrow" />
            </button>
          </div>

          {/* Suggestions IA en temps réel */}
          <div className="ai-suggestions">
            <div className="ai-suggestion-card">
              <div className="ai-icon">
                <Sparkles size={16} />
              </div>
              <div className="ai-content">
                <p className="ai-title">Suggestion d'échange</p>
                <p className="ai-text">
                  Pauline a besoin d'un remplacement vendredi matin. 
                  Votre taux est en avance de 2h cette semaine.
                </p>
                <div className="ai-actions">
                  <button className="btn-ai-accept">Proposer mon aide</button>
                  <button className="btn-ai-dismiss">Ignorer</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Alertes & Notifications */}
      <section className="dashboard-alerts">
        <h3>Informations récentes</h3>
        <div className="alert-list">
          <div className="alert-item info">
            <FileText size={16} />
            <span>Votre fiche de paie de novembre est disponible</span>
            <button className="alert-action">Voir</button>
          </div>
          <div className="alert-item warning">
            <Palmtree size={16} />
            <span>Il vous reste 8 jours de vacances à prendre avant le 31/03</span>
            <button className="alert-action">Planifier</button>
          </div>
          <div className="alert-item success">
            <ArrowLeftRight size={16} />
            <span>Votre demande d'échange du 15/12 a été validée</span>
            <button className="alert-action">Détails</button>
          </div>
        </div>
      </section>
    </div>
  );
}
