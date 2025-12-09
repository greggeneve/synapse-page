import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { verifyResetToken, resetPasswordWithToken } from '../services/authService';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Vérifier le token au chargement
  useEffect(() => {
    if (!token) {
      setError('Lien invalide');
      setIsVerifying(false);
      return;
    }

    verifyResetToken(token).then(result => {
      setIsVerifying(false);
      if (result.valid) {
        setIsValid(true);
        setEmail(result.email || '');
      } else {
        setError(result.error || 'Lien invalide ou expiré');
      }
    });
  }, [token]);

  // Validation du mot de passe
  const passwordRequirements = [
    { label: 'Au moins 8 caractères', valid: password.length >= 8 },
    { label: 'Au moins une majuscule', valid: /[A-Z]/.test(password) },
    { label: 'Au moins un chiffre', valid: /[0-9]/.test(password) },
  ];

  const isPasswordValid = passwordRequirements.every(r => r.valid);
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isPasswordValid || !doPasswordsMatch || !token) return;

    setIsSubmitting(true);
    setError('');

    const result = await resetPasswordWithToken(token, password);

    if (result.success) {
      setIsSuccess(true);
      // Rediriger vers la page de connexion après 3 secondes
      setTimeout(() => navigate('/login'), 3000);
    } else {
      setError(result.error || 'Erreur lors de la réinitialisation');
    }

    setIsSubmitting(false);
  };

  // État de chargement
  if (isVerifying) {
    return (
      <div className="login-page">
        <div className="login-background">
          <div className="bg-pattern" />
        </div>
        <div className="login-container">
          <div className="login-header">
            <img src="/logo-poge.png" alt="POGE" className="login-logo" />
            <h1>Vérification...</h1>
          </div>
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <Loader2 size={48} className="spin" style={{ color: '#2563eb' }} />
          </div>
        </div>
      </div>
    );
  }

  // Lien invalide ou expiré
  if (!isValid) {
    return (
      <div className="login-page">
        <div className="login-background">
          <div className="bg-pattern" />
        </div>
        <div className="login-container">
          <div className="login-header">
            <img src="/logo-poge.png" alt="POGE" className="login-logo" />
            <h1>Lien invalide</h1>
          </div>
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
            <p style={{ color: '#64748b', marginBottom: '24px' }}>{error}</p>
            <button 
              className="btn-login" 
              onClick={() => navigate('/login')}
              style={{ maxWidth: '200px', margin: '0 auto' }}
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Succès
  if (isSuccess) {
    return (
      <div className="login-page">
        <div className="login-background">
          <div className="bg-pattern" />
        </div>
        <div className="login-container">
          <div className="login-header">
            <img src="/logo-poge.png" alt="POGE" className="login-logo" />
            <h1>Mot de passe défini !</h1>
          </div>
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: '16px' }} />
            <p style={{ color: '#64748b', marginBottom: '8px' }}>
              Votre mot de passe a été défini avec succès.
            </p>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>
              Redirection vers la page de connexion...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Formulaire de réinitialisation
  return (
    <div className="login-page">
      <div className="login-background">
        <div className="bg-pattern" />
      </div>
      <div className="login-container">
        <div className="login-header">
          <img src="/logo-poge.png" alt="POGE" className="login-logo" />
          <h1>Définir votre mot de passe</h1>
          <p>{email}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Nouveau mot de passe</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Exigences du mot de passe */}
          <div className="password-requirements">
            {passwordRequirements.map((req, i) => (
              <div 
                key={i} 
                className={`requirement ${req.valid ? 'valid' : ''}`}
              >
                <CheckCircle size={14} />
                <span>{req.label}</span>
              </div>
            ))}
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">Confirmer le mot de passe</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
            {confirmPassword && !doPasswordsMatch && (
              <p className="field-error">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          {error && <div className="login-error">{error}</div>}

          <button 
            type="submit" 
            className="btn-login"
            disabled={isSubmitting || !isPasswordValid || !doPasswordsMatch}
          >
            {isSubmitting ? (
              <Loader2 size={18} className="spin" />
            ) : (
              'Définir le mot de passe'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>© 2025 POGE SA - Tous droits réservés</p>
        </div>
      </div>
    </div>
  );
}

