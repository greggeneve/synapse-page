import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { authenticateUser, requestPasswordReset } from '../services/authService';
import type { TeamMember } from '../types';

interface LoginPageProps {
  onLogin: (user: TeamMember) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await authenticateUser(email, password);

      if (!result.success) {
        // Si le compte n'est pas activé, montrer un message spécifique
        if (result.passwordNeverSet) {
          setInfoMessage('');
          setError('');
          setShowForgotPassword(true);
          setInfoMessage('Première connexion ? Cliquez sur "Envoyer le lien" pour activer votre compte.');
        } else {
          setError(result.error || 'Erreur de connexion');
        }
        setIsLoading(false);
        return;
      }

      if (!result.user) {
        setError('Erreur: utilisateur non trouvé');
        setIsLoading(false);
        return;
      }

      // TODO: Gérer mustChangePassword - rediriger vers une page de changement
      if (result.mustChangePassword) {
        console.log('L\'utilisateur doit changer son mot de passe');
        // Pour l'instant, on continue quand même
      }

      onLogin(result.user);
      navigate('/dashboard');
    } catch (err) {
      setError('Erreur de connexion');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await requestPasswordReset(email);
      if (result.success) {
        alert('Si cet email existe, un lien de réinitialisation vous sera envoyé.');
        setShowForgotPassword(false);
      } else {
        setError(result.error || 'Erreur lors de la demande');
      }
    } catch (err) {
      setError('Erreur lors de la demande');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Fond avec motif subtil */}
      <div className="login-background">
        <div className="bg-pattern" />
      </div>

      <div className="login-container">
        {/* Logo Synapse */}
        <div className="login-header">
          <img src="/logo-synapse.png" alt="Synapse" className="login-logo synapse-logo" />
          <h1>Synapse</h1>
          <p>Espace Collaborateurs</p>
        </div>

        {/* Formulaire */}
        {!showForgotPassword ? (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email professionnel</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@poge.ch"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <div className="input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
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

            {error && <div className="login-error">{error}</div>}
            {infoMessage && <div className="login-info">{infoMessage}</div>}

            <button 
              type="submit" 
              className="btn-login"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="loading-spinner" />
              ) : (
                <>
                  <LogIn size={18} />
                  Se connecter
                </>
              )}
            </button>

            <button
              type="button"
              className="btn-forgot"
              onClick={() => setShowForgotPassword(true)}
            >
              Mot de passe oublié ?
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleForgotPassword}>
            <div className="form-group">
              <label htmlFor="reset-email">Email professionnel</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@poge.ch"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-login">
              <Mail size={18} />
              Envoyer le lien de réinitialisation
            </button>

            <button
              type="button"
              className="btn-forgot"
              onClick={() => setShowForgotPassword(false)}
            >
              ← Retour à la connexion
            </button>
          </form>
        )}

        {/* Footer avec logo POGE */}
        <div className="login-footer">
          <img src="/logo-poge.png" alt="POGE" className="footer-logo" />
          <p>© 2025 POGE SA - Tous droits réservés</p>
        </div>
      </div>
    </div>
  );
}

