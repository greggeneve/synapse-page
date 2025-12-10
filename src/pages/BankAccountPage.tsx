/**
 * Page de gestion des coordonnées bancaires
 * Permet à l'employé de modifier ses coordonnées avec validation SMS
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Wallet,
  Shield,
  Phone,
  Send,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Clock,
  History,
  Lock,
  Building2,
  CreditCard,
  User,
  X,
  Info
} from 'lucide-react';
import {
  getCurrentBankAccount,
  getEmployeePhone,
  isPhoneLocked,
  createBankChangeRequest,
  validateBankChangeRequest,
  resendOtp,
  cancelBankChangeRequest,
  getPendingRequests,
  getBankChangeHistory,
  type CurrentBankAccount,
  type BankChangeRequest
} from '../services/bankChangeService';
import './BankAccountPage.css';

interface BankAccountPageProps {
  user: {
    id: number;
    employee_id?: number;
  } | null;
}

type Step = 'view' | 'edit' | 'verify' | 'success';

export function BankAccountPage({ user }: BankAccountPageProps) {
  const navigate = useNavigate();
  const employeeId = user?.employee_id || user?.id;

  // États
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('view');
  const [currentAccount, setCurrentAccount] = useState<CurrentBankAccount | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<BankChangeRequest | null>(null);
  const [history, setHistory] = useState<BankChangeRequest[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Formulaire
  const [newIban, setNewIban] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newAccountHolder, setNewAccountHolder] = useState('');
  const [newBicSwift, setNewBicSwift] = useState('');

  // Vérification OTP
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Charger les données
  useEffect(() => {
    if (employeeId) {
      loadData();
    }
  }, [employeeId]);

  // Cooldown pour renvoi SMS
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const loadData = async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const [account, phone, locked, pending, hist] = await Promise.all([
        getCurrentBankAccount(employeeId),
        getEmployeePhone(employeeId),
        isPhoneLocked(employeeId),
        getPendingRequests(employeeId),
        getBankChangeHistory(employeeId)
      ]);

      setCurrentAccount(account);
      setPhoneNumber(phone);
      setPhoneLocked(locked);
      setHistory(hist);

      if (pending.length > 0) {
        setPendingRequest(pending[0]);
        setStep('verify');
      }

      // Pré-remplir le titulaire
      if (account?.account_holder) {
        setNewAccountHolder(account.account_holder);
      }
    } catch (error) {
      console.error('Erreur chargement données bancaires:', error);
    } finally {
      setLoading(false);
    }
  };

  // Formater l'IBAN pour l'affichage (avec masquage partiel pour sécurité)
  // Affiche: CH93 •••• •••• •••• ••95 7
  const formatIban = (iban: string, masked: boolean = true): string => {
    if (!iban) return '';
    const clean = iban.replace(/\s/g, '');
    
    if (!masked || clean.length <= 8) {
      return clean.replace(/(.{4})/g, '$1 ').trim();
    }
    
    // Garder les 4 premiers (pays + contrôle) et les 4 derniers caractères
    const start = clean.slice(0, 4);
    const end = clean.slice(-4);
    const middleLength = clean.length - 8;
    
    // Créer le milieu masqué avec des groupes de 4
    let masked_middle = '';
    for (let i = 0; i < middleLength; i++) {
      masked_middle += '•';
      if ((i + 1) % 4 === 0 && i < middleLength - 1) {
        masked_middle += ' ';
      }
    }
    
    return `${start} ${masked_middle} ${end}`.replace(/\s+/g, ' ').trim();
  };

  // Masquer complètement l'IBAN (pour historique, etc.)
  const maskIbanFull = (iban: string): string => {
    if (!iban || iban.length <= 4) return iban;
    return '•••• •••• ••' + iban.slice(-4);
  };

  // Soumettre la demande de modification
  const handleSubmitChange = async () => {
    if (!employeeId || !newIban || !newBankName || !newAccountHolder) {
      setOtpError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setSubmitting(true);
    setOtpError('');

    const result = await createBankChangeRequest(
      employeeId,
      newIban,
      newBankName,
      newAccountHolder,
      undefined,
      newBicSwift || undefined
    );

    setSubmitting(false);

    if (result.success) {
      setStep('verify');
      setResendCooldown(60);
      loadData(); // Recharger pour avoir la demande en cours
    } else {
      setOtpError(result.error || 'Erreur lors de la demande');
    }
  };

  // Valider le code OTP
  const handleValidateOtp = async () => {
    if (!employeeId || !otpCode || otpCode.length !== 6) {
      setOtpError('Veuillez entrer le code à 6 chiffres');
      return;
    }

    setSubmitting(true);
    setOtpError('');

    const result = await validateBankChangeRequest(employeeId, otpCode);

    setSubmitting(false);

    if (result.success) {
      setStep('success');
      // Recharger les données après 2 secondes
      setTimeout(() => {
        loadData();
        setStep('view');
        setOtpCode('');
        setNewIban('');
        setNewBankName('');
        setNewBicSwift('');
      }, 3000);
    } else {
      setOtpError(result.error || 'Code invalide');
    }
  };

  // Renvoyer le code
  const handleResendOtp = async () => {
    if (!employeeId || resendCooldown > 0) return;

    setSubmitting(true);
    const result = await resendOtp(employeeId);
    setSubmitting(false);

    if (result.success) {
      setResendCooldown(60);
      setOtpError('');
    } else {
      setOtpError(result.error || 'Impossible de renvoyer le code');
    }
  };

  // Annuler la demande
  const handleCancel = async () => {
    if (!employeeId) return;
    await cancelBankChangeRequest(employeeId);
    setPendingRequest(null);
    setStep('view');
    setOtpCode('');
    setOtpError('');
  };

  if (loading) {
    return (
      <div className="bank-page">
        <div className="loading-state">
          <Loader2 className="spin" size={32} />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bank-page">
      {/* Header */}
      <header className="bank-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Coordonnées Bancaires</h1>
            <p className="subtitle">Gérez vos informations de paiement</p>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="btn-history"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={18} />
            Historique
          </button>
        </div>
      </header>

      <div className="bank-content">
        {/* Alerte téléphone verrouillé */}
        {phoneLocked && (
          <div className="alert alert-warning">
            <Lock size={20} />
            <div>
              <strong>Numéro de téléphone verrouillé</strong>
              <p>Votre numéro est protégé. Contactez votre administrateur pour modifier vos coordonnées bancaires.</p>
            </div>
          </div>
        )}

        {/* Étape : Visualisation */}
        {step === 'view' && (
          <div className="bank-view">
            {/* Compte actuel */}
            <div className="current-account-card">
              <div className="card-header">
                <div className="card-icon">
                  <Wallet size={24} />
                </div>
                <div>
                  <h2>Compte actif</h2>
                  <p>Utilisé pour le versement de votre salaire</p>
                </div>
              </div>

              {currentAccount ? (
                <div className="account-details">
                  <div className="detail-row iban">
                    <CreditCard size={18} />
                    <div>
                      <span className="label">IBAN</span>
                      <span className="value">{formatIban(currentAccount.iban)}</span>
                    </div>
                  </div>
                  <div className="detail-row">
                    <Building2 size={18} />
                    <div>
                      <span className="label">Banque</span>
                      <span className="value">{currentAccount.bank_name}</span>
                    </div>
                  </div>
                  <div className="detail-row">
                    <User size={18} />
                    <div>
                      <span className="label">Titulaire</span>
                      <span className="value">{currentAccount.account_holder}</span>
                    </div>
                  </div>
                  {currentAccount.bic_swift && (
                    <div className="detail-row">
                      <Info size={18} />
                      <div>
                        <span className="label">BIC/SWIFT</span>
                        <span className="value">{currentAccount.bic_swift}</span>
                      </div>
                    </div>
                  )}
                  <div className="detail-row validation">
                    <Shield size={18} />
                    <div>
                      <span className="label">Validation</span>
                      <span className={`badge ${currentAccount.validation_method}`}>
                        {currentAccount.validation_method === 'sms' && '✓ Validé par SMS'}
                        {currentAccount.validation_method === 'admin_validated' && '✓ Validé par admin'}
                        {currentAccount.validation_method === 'google_auth' && '✓ Google Auth'}
                        {currentAccount.validation_method === 'none' && 'Non validé'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-account">
                  <AlertTriangle size={32} />
                  <p>Aucun compte bancaire enregistré</p>
                </div>
              )}

              {!phoneLocked && (
                <button 
                  className="btn-modify"
                  onClick={() => setStep('edit')}
                >
                  Modifier mes coordonnées
                </button>
              )}
            </div>

            {/* Info sécurité */}
            <div className="security-info">
              <Shield size={20} />
              <div>
                <strong>Processus sécurisé</strong>
                <p>
                  Pour modifier vos coordonnées bancaires, vous devrez confirmer votre identité 
                  via un code SMS envoyé au {phoneNumber ? `•••••${phoneNumber.slice(-4)}` : 'numéro enregistré'}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Étape : Édition */}
        {step === 'edit' && (
          <div className="bank-edit">
            <div className="edit-card">
              <div className="card-header">
                <h2>Nouvelles coordonnées</h2>
                <p>Renseignez les informations de votre nouveau compte</p>
              </div>

              <div className="form-content">
                <div className="form-group">
                  <label>
                    <CreditCard size={16} />
                    IBAN *
                  </label>
                  <input
                    type="text"
                    value={newIban}
                    onChange={(e) => setNewIban(e.target.value.toUpperCase().replace(/\s/g, ''))}
                    placeholder="CH93 0076 2011 6238 5295 7"
                    maxLength={34}
                  />
                  <span className="hint">Format suisse : CHxx xxxx xxxx xxxx xxxx x</span>
                </div>

                <div className="form-group">
                  <label>
                    <Building2 size={16} />
                    Nom de la banque *
                  </label>
                  <input
                    type="text"
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder="UBS, Credit Suisse, PostFinance..."
                  />
                </div>

                <div className="form-group">
                  <label>
                    <User size={16} />
                    Titulaire du compte *
                  </label>
                  <input
                    type="text"
                    value={newAccountHolder}
                    onChange={(e) => setNewAccountHolder(e.target.value)}
                    placeholder="Prénom Nom"
                  />
                </div>

                <div className="form-group">
                  <label>
                    <Info size={16} />
                    BIC/SWIFT (optionnel)
                  </label>
                  <input
                    type="text"
                    value={newBicSwift}
                    onChange={(e) => setNewBicSwift(e.target.value.toUpperCase())}
                    placeholder="UBSWCHZH80A"
                    maxLength={11}
                  />
                </div>

                {otpError && (
                  <div className="error-message">
                    <AlertTriangle size={16} />
                    {otpError}
                  </div>
                )}

                <div className="sms-info">
                  <Phone size={18} />
                  <div>
                    <strong>Vérification SMS</strong>
                    <p>Un code sera envoyé au {phoneNumber || 'numéro enregistré'}</p>
                  </div>
                </div>

                <div className="form-actions">
                  <button 
                    className="btn-cancel"
                    onClick={() => {
                      setStep('view');
                      setOtpError('');
                    }}
                  >
                    Annuler
                  </button>
                  <button 
                    className="btn-submit"
                    onClick={handleSubmitChange}
                    disabled={submitting || !newIban || !newBankName || !newAccountHolder}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Envoyer le code SMS
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Étape : Vérification OTP */}
        {step === 'verify' && (
          <div className="bank-verify">
            <div className="verify-card">
              <div className="verify-icon">
                <Phone size={32} />
              </div>
              <h2>Vérification SMS</h2>
              <p>
                Entrez le code à 6 chiffres envoyé au<br />
                <strong>{phoneNumber || 'votre téléphone'}</strong>
              </p>

              <div className="otp-input-container">
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  maxLength={6}
                  className="otp-input"
                  autoFocus
                />
              </div>

              {otpError && (
                <div className="error-message">
                  <AlertTriangle size={16} />
                  {otpError}
                </div>
              )}

              <div className="verify-actions">
                <button 
                  className="btn-validate"
                  onClick={handleValidateOtp}
                  disabled={submitting || otpCode.length !== 6}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={18} className="spin" />
                      Vérification...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Valider
                    </>
                  )}
                </button>

                <button 
                  className="btn-resend"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || submitting}
                >
                  <RefreshCw size={16} />
                  {resendCooldown > 0 
                    ? `Renvoyer dans ${resendCooldown}s` 
                    : 'Renvoyer le code'
                  }
                </button>

                <button 
                  className="btn-cancel-verify"
                  onClick={handleCancel}
                >
                  <X size={16} />
                  Annuler la demande
                </button>
              </div>

              <div className="verify-hint">
                <Clock size={14} />
                Le code expire dans 10 minutes
              </div>
            </div>
          </div>
        )}

        {/* Étape : Succès */}
        {step === 'success' && (
          <div className="bank-success">
            <div className="success-card">
              <div className="success-icon">
                <CheckCircle size={48} />
              </div>
              <h2>Coordonnées mises à jour !</h2>
              <p>
                Vos nouvelles coordonnées bancaires ont été enregistrées avec succès.
                Elles seront utilisées pour votre prochain versement de salaire.
              </p>
            </div>
          </div>
        )}

        {/* Historique */}
        {showHistory && (
          <div className="history-modal" onClick={() => setShowHistory(false)}>
            <div className="history-content" onClick={e => e.stopPropagation()}>
              <div className="history-header">
                <h3><History size={20} /> Historique des modifications</h3>
                <button onClick={() => setShowHistory(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="history-list">
                {history.length === 0 ? (
                  <p className="no-history">Aucune modification enregistrée</p>
                ) : (
                  history.map(item => (
                    <div key={item.id} className={`history-item ${item.status}`}>
                      <div className="history-date">
                        {new Date(item.created_at).toLocaleDateString('fr-CH', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="history-details">
                        <span className="history-iban">{maskIbanFull(item.new_iban)}</span>
                        <span className="history-bank">{item.new_bank_name}</span>
                      </div>
                      <div className={`history-status ${item.status}`}>
                        {item.status === 'validated' && <><CheckCircle size={14} /> Validé</>}
                        {item.status === 'pending' && <><Clock size={14} /> En attente</>}
                        {item.status === 'rejected' && <><X size={14} /> Rejeté</>}
                        {item.status === 'expired' && <><Clock size={14} /> Expiré</>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
