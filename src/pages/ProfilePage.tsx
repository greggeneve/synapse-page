import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  CreditCard,
  Shield,
  Briefcase,
  Heart,
  Clock,
  BadgeCheck,
  AlertCircle,
  Globe,
  Users,
  FileText,
  Percent,
  Gift,
  Baby,
  Hash,
  Wallet,
  CalendarOff,
  Award
} from 'lucide-react';
import { getEmployeeProfile } from '../services/profileService';
import type { EmployeeProfile } from '../services/profileService';
import type { TeamMember } from '../types';

interface ProfilePageProps {
  user: TeamMember;
}

export function ProfilePage({ user }: ProfilePageProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'personal' | 'professional' | 'compensation' | 'administrative'>('personal');

  useEffect(() => {
    loadProfile();
  }, [user.id]);

  const loadProfile = async () => {
    setIsLoading(true);
    const data = await getEmployeeProfile(Number(user.id));
    setProfile(data);
    setIsLoading(false);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '—';
    return new Intl.NumberFormat('fr-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatAVS = (avs: string) => {
    if (!avs) return '—';
    return avs;
  };

  const formatIBAN = (iban: string) => {
    if (!iban) return '—';
    if (iban.length > 10) {
      return iban.substring(0, 4) + ' •••• •••• ' + iban.substring(iban.length - 4);
    }
    return iban;
  };

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const calculateSeniority = (entryDate: string) => {
    if (!entryDate) return null;
    const today = new Date();
    const entry = new Date(entryDate);
    const years = today.getFullYear() - entry.getFullYear();
    const months = today.getMonth() - entry.getMonth();
    
    let totalMonths = years * 12 + months;
    if (today.getDate() < entry.getDate()) totalMonths--;
    
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    
    if (y === 0) return `${m} mois`;
    if (m === 0) return `${y} an${y > 1 ? 's' : ''}`;
    return `${y} an${y > 1 ? 's' : ''} et ${m} mois`;
  };

  const getSexLabel = (sex: string) => {
    switch (sex) {
      case 'M': return 'Homme';
      case 'F': return 'Femme';
      case 'A': return 'Autre';
      default: return '—';
    }
  };

  const getCountryFlag = (country: string) => {
    const flags: Record<string, string> = {
      'CH': '🇨🇭', 'Suisse': '🇨🇭',
      'FR': '🇫🇷', 'France': '🇫🇷', 'FRANCAISE': '🇫🇷',
      'IT': '🇮🇹', 'Italie': '🇮🇹',
      'DE': '🇩🇪', 'Allemagne': '🇩🇪',
      'ES': '🇪🇸', 'Espagne': '🇪🇸',
      'PT': '🇵🇹', 'Portugal': '🇵🇹',
      'BE': '🇧🇪', 'Belgique': '🇧🇪',
      'GB': '🇬🇧', 'UK': '🇬🇧',
    };
    return flags[country] || '🌍';
  };

  const getSalaryModeLabel = (mode: string | undefined) => {
    switch (mode) {
      case 'Mensuel': return 'Salaire mensuel';
      case 'Horaire': return 'Salaire horaire';
      case 'Commission': return 'Commission';
      default: return '—';
    }
  };

  if (isLoading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">
          <div className="loading-spinner" />
          <p>Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <div className="profile-error">
          <AlertCircle size={48} />
          <h2>Profil non trouvé</h2>
          <p>Impossible de charger vos informations.</p>
          <button onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} /> Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  const age = calculateAge(profile.identification.date_naissance);
  const seniority = calculateSeniority(profile.hrStatus.date_entree);

  return (
    <div className="profile-page">
      {/* Header avec retour */}
      <header className="profile-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
        <h1>Mon Profil</h1>
      </header>

      {/* Carte de présentation */}
      <section className="profile-hero">
        <div className="hero-photo">
          {profile.identification.photo_url ? (
            <img src={profile.identification.photo_url} alt={`${profile.identification.prenom} ${profile.identification.nom}`} />
          ) : (
            <div className="photo-placeholder-large">
              {profile.identification.prenom[0]}{profile.identification.nom[0]}
            </div>
          )}
          <div className={`status-badge ${profile.hrStatus.collaborateur_actif ? 'active' : 'inactive'}`}>
            {profile.hrStatus.collaborateur_actif ? 'Actif' : 'Inactif'}
          </div>
        </div>
        <div className="hero-info">
          <h2>{profile.identification.prenom} {profile.identification.nom}</h2>
          <p className="hero-role">{profile.hrStatus.statut_dans_societe}</p>
          <div className="hero-badges">
            <span className="badge">
              <Calendar size={14} />
              {seniority ? `${seniority} d'ancienneté` : 'Nouvelle recrue'}
            </span>
            <span className="badge">
              <Clock size={14} />
              {profile.hrStatus.taux_activite_contractuel_reference}%
            </span>
            {profile.hrStatus.droit_vacances_semaines && (
              <span className="badge">
                <Calendar size={14} />
                {profile.hrStatus.droit_vacances_semaines} sem. vacances
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Navigation par onglets */}
      <nav className="profile-tabs">
        <button 
          className={activeTab === 'personal' ? 'active' : ''} 
          onClick={() => setActiveTab('personal')}
        >
          <User size={18} />
          Identité
        </button>
        <button 
          className={activeTab === 'professional' ? 'active' : ''} 
          onClick={() => setActiveTab('professional')}
        >
          <Briefcase size={18} />
          Contrat
        </button>
        <button 
          className={activeTab === 'compensation' ? 'active' : ''} 
          onClick={() => setActiveTab('compensation')}
        >
          <Wallet size={18} />
          Rémunération
        </button>
        <button 
          className={activeTab === 'administrative' ? 'active' : ''} 
          onClick={() => setActiveTab('administrative')}
        >
          <FileText size={18} />
          Administratif
        </button>
      </nav>

      {/* Contenu des onglets */}
      <div className="profile-content">
        {activeTab === 'personal' && (
          <div className="tab-content">
            {/* Identité */}
            <div className="info-card">
              <div className="card-header">
                <User size={20} />
                <h3>Identité</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Nom complet</span>
                  <span className="value">{profile.identification.prenom} {profile.identification.nom}</span>
                </div>
                <div className="info-item">
                  <span className="label">Genre</span>
                  <span className="value">{getSexLabel(profile.identification.sexe)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Date de naissance</span>
                  <span className="value">
                    {formatDate(profile.identification.date_naissance)}
                    {age !== null && <span className="subtext">({age} ans)</span>}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Nationalité</span>
                  <span className="value">
                    {getCountryFlag(profile.identification.nationalite_principale)} {profile.identification.nationalite_principale}
                    {profile.identification.autres_nationalites && (
                      <span className="subtext">+ {profile.identification.autres_nationalites}</span>
                    )}
                  </span>
                </div>
                <div className="info-item full-width">
                  <span className="label">Numéro AVS</span>
                  <span className="value mono">{formatAVS(profile.identification.avss_numero)}</span>
                </div>
              </div>
            </div>

            {/* Coordonnées */}
            <div className="info-card">
              <div className="card-header">
                <MapPin size={20} />
                <h3>Coordonnées</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label"><Mail size={14} /> Email professionnel</span>
                  <span className="value">{profile.contact.email_professionnel || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label"><Mail size={14} /> Email privé</span>
                  <span className="value">{profile.contact.email_prive || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label"><Phone size={14} /> Téléphone</span>
                  <span className="value">{profile.contact.telephone_portable || '—'}</span>
                </div>
                <div className="info-item full-width">
                  <span className="label"><MapPin size={14} /> Adresse</span>
                  <span className="value">
                    {profile.contact.adresse_rue || '—'}
                    {profile.contact.adresse_complement && <><br />{profile.contact.adresse_complement}</>}
                    <br />
                    {profile.contact.code_postal} {profile.contact.ville}
                    <br />
                    {getCountryFlag(profile.contact.pays)} {profile.contact.pays}
                  </span>
                </div>
              </div>
            </div>

            {/* Contact d'urgence */}
            <div className="info-card">
              <div className="card-header">
                <Heart size={20} />
                <h3>Contact d'urgence</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Nom</span>
                  <span className="value">{profile.contact.contact_urgence_nom || 'Non renseigné'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Téléphone</span>
                  <span className="value">{profile.contact.contact_urgence_telephone || 'Non renseigné'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'professional' && (
          <div className="tab-content">
            {/* Contrat */}
            <div className="info-card">
              <div className="card-header">
                <Briefcase size={20} />
                <h3>Contrat de travail</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Fonction</span>
                  <span className="value">{profile.hrStatus.statut_dans_societe || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Type de temps de travail</span>
                  <span className="value">{profile.hrStatus.temps_travail_type || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Date d'entrée</span>
                  <span className="value">{formatDate(profile.hrStatus.date_entree)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Ancienneté</span>
                  <span className="value">{seniority || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Taux d'activité</span>
                  <span className="value highlight">{profile.hrStatus.taux_activite_contractuel_reference}%</span>
                </div>
                <div className="info-item">
                  <span className="label">Droit aux vacances</span>
                  <span className="value">
                    {profile.hrStatus.droit_vacances_semaines 
                      ? `${profile.hrStatus.droit_vacances_semaines} semaines/an`
                      : '4 semaines/an (défaut)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Structure salariale */}
            <div className="info-card">
              <div className="card-header">
                <Wallet size={20} />
                <h3>Structure salariale</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Mode de rémunération</span>
                  <span className="value">{getSalaryModeLabel(profile.hrStatus.salaryMode)}</span>
                </div>
                {profile.hrStatus.salaryAmount && (
                  <div className="info-item">
                    <span className="label">
                      {profile.hrStatus.salaryMode === 'Horaire' ? 'Taux horaire' : 
                       profile.hrStatus.salaryMode === 'Commission' ? 'Taux commission' : 'Salaire mensuel'}
                    </span>
                    <span className="value highlight">
                      {profile.hrStatus.salaryMode === 'Commission' 
                        ? `${profile.hrStatus.salaryAmount}%`
                        : formatCurrency(profile.hrStatus.salaryAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Prévoyance LPP */}
            <div className="info-card">
              <div className="card-header">
                <Shield size={20} />
                <h3>Prévoyance professionnelle (LPP)</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Soumis à la LPP</span>
                  <span className={`value ${profile.lpp.soumis_LPP ? 'success' : ''}`}>
                    {profile.lpp.soumis_LPP ? '✓ Oui' : 'Non'}
                  </span>
                </div>
                {profile.lpp.soumis_LPP && (
                  <>
                    <div className="info-item">
                      <span className="label">Plan LPP</span>
                      <span className="value">{profile.lpp.plan_LPP || '—'}</span>
                    </div>
                    <div className="info-item">
                      <span className="label">Catégorie</span>
                      <span className="value">{profile.lpp.categorie_LPP || '—'}</span>
                    </div>
                    {profile.lpp.cle_repartition_LPP && (
                      <div className="info-item">
                        <span className="label">Clé de répartition</span>
                        <span className="value">
                          {profile.lpp.cle_repartition_LPP === 'Standard' ? 'Standard (50/50)' :
                           profile.lpp.cle_repartition_LPP === 'Direction_70_30' ? 'Direction (30/70)' :
                           profile.lpp.part_employe_pourcent && profile.lpp.part_employeur_pourcent 
                             ? `${profile.lpp.part_employe_pourcent}% / ${profile.lpp.part_employeur_pourcent}%`
                             : profile.lpp.cle_repartition_LPP}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Congés sans solde */}
            {profile.hrStatus.unpaidLeaveHistory && profile.hrStatus.unpaidLeaveHistory.length > 0 && (
              <div className="info-card">
                <div className="card-header">
                  <CalendarOff size={20} />
                  <h3>Congés sans solde</h3>
                </div>
                <div className="info-grid">
                  {profile.hrStatus.unpaidLeaveHistory.map((leave, idx) => (
                    <div key={idx} className="info-item full-width">
                      <span className="label">{leave.motif}</span>
                      <span className="value">
                        Du {formatDateShort(leave.date_debut)} au {formatDateShort(leave.date_fin)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IDs externes */}
            {profile.externalIds && Object.values(profile.externalIds).some(v => v) && (
              <div className="info-card">
                <div className="card-header">
                  <Hash size={20} />
                  <h3>Identifiants externes</h3>
                </div>
                <div className="info-grid">
                  {profile.externalIds.id_externe_RH && (
                    <div className="info-item">
                      <span className="label">ID RH</span>
                      <span className="value mono">{profile.externalIds.id_externe_RH}</span>
                    </div>
                  )}
                  {profile.externalIds.id_externe_agenda && (
                    <div className="info-item">
                      <span className="label">ID Agenda</span>
                      <span className="value mono">{profile.externalIds.id_externe_agenda}</span>
                    </div>
                  )}
                  {profile.externalIds.id_externe_facturation && (
                    <div className="info-item">
                      <span className="label">ID Facturation</span>
                      <span className="value mono">{profile.externalIds.id_externe_facturation}</span>
                    </div>
                  )}
                  {profile.externalIds.id_externe_LPP && (
                    <div className="info-item">
                      <span className="label">ID LPP</span>
                      <span className="value mono">{profile.externalIds.id_externe_LPP}</span>
                    </div>
                  )}
                  {profile.externalIds.id_externe_IJM && (
                    <div className="info-item">
                      <span className="label">ID IJM</span>
                      <span className="value mono">{profile.externalIds.id_externe_IJM}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'compensation' && (
          <div className="tab-content">
            {/* 13ème salaire - Seulement si l'employé y a droit */}
            {profile.bonuses.has_thirteenth_salary && (
              <div className="info-card">
                <div className="card-header">
                  <Gift size={20} />
                  <h3>13ème salaire</h3>
                </div>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Droit au 13ème</span>
                    <span className="value success">✓ Oui</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Mode de calcul</span>
                    <span className="value">{profile.bonuses.thirteenth_salary_mode || 'Automatique'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Primes mensuelles - Seulement si l'employé en a */}
            {(profile.bonuses.a_prime_direction || 
              profile.bonuses.a_prime_supervision ||
              profile.bonuses.a_prime_assiduite || 
              profile.bonuses.a_prime_natel ||
              profile.bonuses.a_prime_entretien_blouses ||
              profile.bonuses.beneficie_prestations_nature) && (
              <div className="info-card">
                <div className="card-header">
                  <Award size={20} />
                  <h3>Primes mensuelles</h3>
                </div>
                <div className="info-grid">
                  {profile.bonuses.a_prime_direction && (
                    <div className="info-item">
                      <span className="label">Prime de direction</span>
                      <span className="value success">
                        ✓ {formatCurrency(profile.bonuses.montant_prime_direction)}/mois
                      </span>
                    </div>
                  )}
                  {profile.bonuses.a_prime_supervision && (
                    <div className="info-item">
                      <span className="label">Prime de supervision</span>
                      <span className="value success">
                        ✓ {formatCurrency(profile.bonuses.montant_supervision)}/mois
                      </span>
                    </div>
                  )}
                  {profile.bonuses.a_prime_assiduite && (
                    <div className="info-item">
                      <span className="label">Prime d'assiduité</span>
                      <span className="value success">
                        ✓ {formatCurrency(profile.bonuses.montant_prime_assiduite)}/mois
                      </span>
                    </div>
                  )}
                  {profile.bonuses.a_prime_natel && (
                    <div className="info-item">
                      <span className="label">Prime Natel</span>
                      <span className="value success">✓ Oui</span>
                    </div>
                  )}
                  {profile.bonuses.a_prime_entretien_blouses && (
                    <div className="info-item">
                      <span className="label">Entretien des blouses</span>
                      <span className="value success">
                        ✓ {formatCurrency(profile.bonuses.montant_blouses)}/mois
                      </span>
                    </div>
                  )}
                  {profile.bonuses.beneficie_prestations_nature && (
                    <div className="info-item full-width">
                      <span className="label">Prestations en nature</span>
                      <span className="value success">
                        ✓ {profile.bonuses.description_prestations_nature || ''} - {formatCurrency(profile.bonuses.montant_prestations_nature)}/mois
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Commissions et intéressement - Seulement si l'employé en a avec des valeurs > 0 */}
            {((profile.bonuses.a_prime_interessement_CA && profile.bonuses.taux_interessement_CA) || 
              (profile.bonuses.remunere_pour_rapports && profile.bonuses.taux_rapports) ||
              profile.bonuses.soumis_clause_non_concurrence) && (
              <div className="info-card">
                <div className="card-header">
                  <Percent size={20} />
                  <h3>Commissions & Intéressement</h3>
                </div>
                <div className="info-grid">
                  {profile.bonuses.a_prime_interessement_CA && profile.bonuses.taux_interessement_CA && profile.bonuses.taux_interessement_CA > 0 && (
                    <div className="info-item">
                      <span className="label">Intéressement CA</span>
                      <span className="value success">
                        ✓ {profile.bonuses.taux_interessement_CA}%
                      </span>
                    </div>
                  )}
                  {profile.bonuses.remunere_pour_rapports && profile.bonuses.taux_rapports && profile.bonuses.taux_rapports > 0 && (
                    <div className="info-item">
                      <span className="label">Rémunération rapports assurance</span>
                      <span className="value success">
                        ✓ {profile.bonuses.taux_rapports}%
                      </span>
                    </div>
                  )}
                  {profile.bonuses.soumis_clause_non_concurrence && (
                    <div className="info-item">
                      <span className="label">Clause de non-concurrence</span>
                      <span className="value warning">
                        ⚠ Active
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Coordonnées bancaires */}
            <div className="info-card">
              <div className="card-header">
                <CreditCard size={20} />
                <h3>Coordonnées bancaires</h3>
              </div>
              <div className="info-grid">
                {profile.bankInfo?.current_iban ? (
                  <>
                    <div className="info-item">
                      <span className="label">IBAN</span>
                      <span className="value mono">{formatIBAN(profile.bankInfo.current_iban)}</span>
                    </div>
                    <div className="info-item">
                      <span className="label">Banque</span>
                      <span className="value">{profile.bankInfo.current_bank_name || '—'}</span>
                    </div>
                    {profile.bankInfo.titulaire_compte && (
                      <div className="info-item full-width">
                        <span className="label">Titulaire</span>
                        <span className="value">{profile.bankInfo.titulaire_compte}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="info-item full-width">
                    <span className="value muted">Aucun IBAN enregistré</span>
                  </div>
                )}
              </div>
              <div className="card-footer">
                <p className="security-note">
                  <Shield size={14} />
                  La modification des coordonnées bancaires nécessite une validation sécurisée
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'administrative' && (
          <div className="tab-content">
            {/* Fiscalité */}
            <div className="info-card">
              <div className="card-header">
                <Globe size={20} />
                <h3>Situation fiscale</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Résidence fiscale</span>
                  <span className="value">
                    {getCountryFlag(profile.contact.residence_fiscale)} {profile.contact.residence_fiscale || '—'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Soumis à l'impôt à la source</span>
                  <span className={`value ${profile.contact.soumis_impot_source ? 'warning' : 'success'}`}>
                    {profile.contact.soumis_impot_source ? '✓ Oui' : 'Non'}
                  </span>
                </div>
                {profile.contact.soumis_impot_source && profile.contact.code_tarif_IaS_actuel && (
                  <div className="info-item">
                    <span className="label">Code tarif IàS</span>
                    <span className="value mono">{profile.contact.code_tarif_IaS_actuel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Allocations familiales */}
            <div className="info-card">
              <div className="card-header">
                <Users size={20} />
                <h3>Allocations familiales</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Bénéficiaire</span>
                  <span className={`value ${profile.contact.beneficiaire_allocations_familiales ? 'success' : ''}`}>
                    {profile.contact.beneficiaire_allocations_familiales ? '✓ Oui' : 'Non'}
                  </span>
                </div>
                {profile.contact.beneficiaire_allocations_familiales && (
                  <div className="info-item">
                    <span className="label">Enfants à charge</span>
                    <span className="value">{profile.contact.nombre_enfants_a_charge}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Détail des enfants */}
            {profile.familyAllowances && profile.familyAllowances.children.length > 0 && (
              <div className="info-card">
                <div className="card-header">
                  <Baby size={20} />
                  <h3>Enfants</h3>
                </div>
                <div className="children-list">
                  {profile.familyAllowances.children.map((child, idx) => (
                    <div key={idx} className="child-item">
                      <div className="child-info">
                        <span className="child-name">
                          {child.childFirstName} {child.childLastName}
                        </span>
                        <span className="child-details">
                          {child.childSex === 'M' ? '👦' : '👧'} Né(e) le {formatDateShort(child.childBirthDate)}
                        </span>
                      </div>
                      <div className="child-allocation">
                        <span className="allocation-type">{child.allocationType}</span>
                        <span className="allocation-until">Jusqu'au {child.rightUntil}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
