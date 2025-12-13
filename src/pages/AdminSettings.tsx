import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  FileText,
  Settings,
  Loader2,
  Check,
  Scale,
  Clock,
  Calendar,
  Users,
  AlertTriangle,
  MapPin
} from 'lucide-react';
import { 
  getReportSettings, 
  saveReportSettings, 
  type ReportSettings 
} from '../services/reportSettingsService';
import {
  getHRRules,
  saveHRRules,
  type HRRules
} from '../services/hrRulesService';

export function AdminSettings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'report' | 'hr-rules'>('report');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Outils de prévisualisation
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewStyle, setPreviewStyle] = useState<'light' | 'dark' | 'paper'>('paper');
  
  // Section active des règles RH
  const [activeRuleSection, setActiveRuleSection] = useState<string>('general');
  
  const [reportSettings, setReportSettings] = useState<ReportSettings>({
    company_name: '',
    slogan_line1: '',
    slogan_line2: '',
    slogan_line3: '',
    footer_address: '',
    footer_city: '',
    footer_phone: '',
    footer_phone_link: '',
    footer_fax: '',
    footer_email: '',
    footer_email_link: '',
    footer_website: '',
    footer_website_link: '',
    signature_website: '',
    signature_website_link: '',
    // Mise en forme
    footer_font_size: '7',
    footer_alignment: 'left',
    footer_line_spacing: '1.2',
    footer_format_line1: '{address} - {city}    Tél : {phone}',
    footer_format_line2: 'E-mail : {email}    Site : {website}    Page {page}',
  });

  const [hrRules, setHrRules] = useState<HRRules>({
    general_rules: '',
    max_hours_per_week: 45,
    max_hours_per_day: 10,
    min_rest_between_shifts: 11,
    min_break_duration: 60,
    max_consecutive_days: 6,
    min_annual_leave_days: 20,
    notice_period_leave_days: 14,
    overtime_rules: '',
    night_work_rules: '',
    weekend_rules: '',
    holiday_rules: '',
    sick_leave_rules: '',
    maternity_rules: '',
    special_leave_rules: '',
    min_staff_per_shift: 2,
    roles_required: '',
    last_updated: '',
    updated_by: ''
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    const [settings, rules] = await Promise.all([
      getReportSettings(),
      getHRRules()
    ]);
    setReportSettings(settings);
    setHrRules(rules);
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    let success = false;
    
    if (activeTab === 'report') {
      success = await saveReportSettings(reportSettings);
    } else if (activeTab === 'hr-rules') {
      success = await saveHRRules(hrRules, 'admin'); // TODO: récupérer le nom de l'utilisateur connecté
    }
    
    setIsSaving(false);
    
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const updateField = (field: keyof ReportSettings, value: string) => {
    setReportSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const updateHRRule = (field: keyof HRRules, value: string | number) => {
    setHrRules(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  // Formater une ligne du pied de page en remplaçant les variables
  const formatFooterLine = (template: string, settings: ReportSettings): React.ReactNode => {
    if (!template) return null;
    
    // Remplacer les variables par leurs valeurs
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\{(address|city|phone|fax|email|website|page)\}/g;
    let match;
    let key = 0;
    
    while ((match = regex.exec(template)) !== null) {
      // Ajouter le texte avant la variable
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{template.slice(lastIndex, match.index)}</span>);
      }
      
      // Ajouter la variable formatée
      const varName = match[1];
      switch (varName) {
        case 'address':
          parts.push(<span key={key++} className="var-value">{settings.footer_address}</span>);
          break;
        case 'city':
          parts.push(<span key={key++} className="var-value">{settings.footer_city}</span>);
          break;
        case 'phone':
          parts.push(
            <a key={key++} href={settings.footer_phone_link} className="var-link">
              {settings.footer_phone}
            </a>
          );
          break;
        case 'fax':
          if (settings.footer_fax) {
            parts.push(<span key={key++} className="var-value">{settings.footer_fax}</span>);
          }
          break;
        case 'email':
          parts.push(
            <a key={key++} href={settings.footer_email_link} className="var-link">
              {settings.footer_email}
            </a>
          );
          break;
        case 'website':
          parts.push(
            <a key={key++} href={settings.footer_website_link} className="var-link" target="_blank" rel="noopener noreferrer">
              {settings.footer_website}
            </a>
          );
          break;
        case 'page':
          parts.push(<span key={key++} className="var-page">1/X</span>);
          break;
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Ajouter le reste du texte
    if (lastIndex < template.length) {
      parts.push(<span key={key++}>{template.slice(lastIndex)}</span>);
    }
    
    return parts;
  };

  if (isLoading) {
    return (
      <div className="admin-settings-page">
        <div className="loading-container">
          <Loader2 className="spin" size={32} />
          <p>Chargement des paramètres...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-settings-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1><Settings size={24} /> Paramètres</h1>
            <p>Configuration de l'application</p>
          </div>
        </div>
        <div className="header-right">
          <button 
            className={`btn-primary ${saved ? 'btn-success' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <><Loader2 size={18} className="spin" /> Enregistrement...</>
            ) : saved ? (
              <><Check size={18} /> Enregistré !</>
            ) : (
              <><Save size={18} /> Enregistrer</>
            )}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="settings-tabs">
        <button 
          className={`settings-tab ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          <FileText size={18} />
          Masque de rapport
        </button>
        <button 
          className={`settings-tab ${activeTab === 'hr-rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('hr-rules')}
        >
          <Scale size={18} />
          Règles RH & Légales
        </button>
        <button 
          className={`settings-tab ${activeTab === 'floor-plan' ? 'active' : ''}`}
          onClick={() => navigate('/admin/floor-plan')}
        >
          <MapPin size={18} />
          Plan du cabinet
        </button>
      </div>

      {/* Content */}
      <div className="settings-content">
        {activeTab === 'report' && (
          <div className="settings-section">
            {/* Données entreprise (lecture seule depuis DB) */}
            <div className="settings-card readonly-card">
              <h3>📋 Données de l'entreprise</h3>
              <p className="settings-description">
                Ces données proviennent de la configuration centrale (poge-salaires). 
                <br />Pour les modifier, utilisez l'application de gestion des salaires.
              </p>
              
              <div className="settings-form">
                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Nom de l'entreprise</label>
                    <input
                      type="text"
                      value={reportSettings.company_name}
                      disabled
                      className="input-readonly"
                    />
                  </div>
                </div>
                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Adresse</label>
                    <input
                      type="text"
                      value={reportSettings.footer_address}
                      disabled
                      className="input-readonly"
                    />
                  </div>
                  <div className="form-group">
                    <label>Ville</label>
                    <input
                      type="text"
                      value={reportSettings.footer_city}
                      disabled
                      className="input-readonly"
                    />
                  </div>
                </div>
                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Téléphone</label>
                    <input
                      type="text"
                      value={reportSettings.footer_phone}
                      disabled
                      className="input-readonly"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* En-tête du rapport (modifiable) */}
            <div className="settings-card">
              <h3>✏️ Slogan du rapport</h3>
              <p className="settings-description">
                Ce texte apparaît sous le logo, dans l'en-tête du rapport.
              </p>
              
              <div className="settings-form">
                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Slogan - Ligne 1</label>
                    <input
                      type="text"
                      value={reportSettings.slogan_line1}
                      onChange={(e) => updateField('slogan_line1', e.target.value)}
                      placeholder="Pour toute urgence, un"
                    />
                  </div>
                  <div className="form-group">
                    <label>Slogan - Ligne 2</label>
                    <input
                      type="text"
                      value={reportSettings.slogan_line2}
                      onChange={(e) => updateField('slogan_line2', e.target.value)}
                      placeholder="rdv vous est proposé"
                    />
                  </div>
                  <div className="form-group">
                    <label>Slogan - Ligne 3</label>
                    <input
                      type="text"
                      value={reportSettings.slogan_line3}
                      onChange={(e) => updateField('slogan_line3', e.target.value)}
                      placeholder="dans la journée."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Liens cliquables */}
            <div className="settings-card">
              <h3>🔗 Liens cliquables (PDF numérique)</h3>
              <p className="settings-description">
                Ces liens seront actifs dans le PDF numérique (clic sur téléphone, email, site web).
              </p>
              
              <div className="settings-form">
                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Lien téléphone</label>
                    <input
                      type="text"
                      value={reportSettings.footer_phone_link}
                      onChange={(e) => updateField('footer_phone_link', e.target.value)}
                      placeholder="tel:+41227003577"
                    />
                  </div>
                  <div className="form-group">
                    <label>Fax (optionnel)</label>
                    <input
                      type="text"
                      value={reportSettings.footer_fax}
                      onChange={(e) => updateField('footer_fax', e.target.value)}
                      placeholder="+41 (0)22 734 03 33"
                    />
                  </div>
                </div>

                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Email de contact (affiché)</label>
                    <input
                      type="email"
                      value={reportSettings.footer_email}
                      onChange={(e) => updateField('footer_email', e.target.value)}
                      placeholder="contact@poge.ch"
                    />
                  </div>
                  <div className="form-group">
                    <label>Lien email</label>
                    <input
                      type="text"
                      value={reportSettings.footer_email_link}
                      onChange={(e) => updateField('footer_email_link', e.target.value)}
                      placeholder="mailto:contact@poge.ch"
                    />
                  </div>
                </div>

                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Site web (affiché)</label>
                    <input
                      type="text"
                      value={reportSettings.footer_website}
                      onChange={(e) => updateField('footer_website', e.target.value)}
                      placeholder="www.poge.ch"
                    />
                  </div>
                  <div className="form-group">
                    <label>Lien site web</label>
                    <input
                      type="url"
                      value={reportSettings.footer_website_link}
                      onChange={(e) => updateField('footer_website_link', e.target.value)}
                      placeholder="https://www.poge.ch"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Liens de signature */}
            <div className="settings-card">
              <h3>Liens dans la signature</h3>
              <p className="settings-description">
                Ces liens apparaissent dans la signature de l'auteur et sont cliquables dans le PDF numérique.
              </p>
              
              <div className="settings-form">
                <div className="form-group-inline">
                  <div className="form-group">
                    <label>Site web signature (affiché)</label>
                    <input
                      type="text"
                      value={reportSettings.signature_website}
                      onChange={(e) => updateField('signature_website', e.target.value)}
                      placeholder="www.poge.ch"
                    />
                  </div>
                  <div className="form-group">
                    <label>Lien (cliquable)</label>
                    <input
                      type="url"
                      value={reportSettings.signature_website_link}
                      onChange={(e) => updateField('signature_website_link', e.target.value)}
                      placeholder="https://www.poge.ch"
                    />
                  </div>
                </div>
                
                <p className="settings-hint">
                  💡 Le logo est également cliquable et renvoie vers le site web défini ci-dessus.
                </p>
              </div>
            </div>

            {/* Mise en forme du pied de page */}
            <div className="settings-card">
              <h3>🎨 Mise en forme du pied de page</h3>
              <p className="settings-description">
                Personnalisez l'apparence du pied de page dans vos PDF.
              </p>
              
              <div className="settings-form">
                {/* Outils de mise en forme */}
                <div className="formatting-toolbar">
                  {/* Alignement */}
                  <div className="toolbar-group">
                    <label>Alignement</label>
                    <div className="toolbar-buttons">
                      <button
                        type="button"
                        className={`toolbar-btn ${reportSettings.footer_alignment === 'left' ? 'active' : ''}`}
                        onClick={() => updateField('footer_alignment', 'left')}
                        title="Aligner à gauche"
                      >
                        ⬅️
                      </button>
                      <button
                        type="button"
                        className={`toolbar-btn ${reportSettings.footer_alignment === 'center' ? 'active' : ''}`}
                        onClick={() => updateField('footer_alignment', 'center')}
                        title="Centrer"
                      >
                        ↔️
                      </button>
                      <button
                        type="button"
                        className={`toolbar-btn ${reportSettings.footer_alignment === 'right' ? 'active' : ''}`}
                        onClick={() => updateField('footer_alignment', 'right')}
                        title="Aligner à droite"
                      >
                        ➡️
                      </button>
                    </div>
                  </div>
                  
                  {/* Taille de police */}
                  <div className="toolbar-group">
                    <label>Taille (pt)</label>
                    <select
                      value={reportSettings.footer_font_size}
                      onChange={(e) => updateField('footer_font_size', e.target.value)}
                      className="toolbar-select"
                    >
                      <option value="6">6</option>
                      <option value="7">7</option>
                      <option value="8">8</option>
                      <option value="9">9</option>
                      <option value="10">10</option>
                      <option value="11">11</option>
                      <option value="12">12</option>
                    </select>
                  </div>
                  
                  {/* Interligne */}
                  <div className="toolbar-group">
                    <label>Interligne</label>
                    <select
                      value={reportSettings.footer_line_spacing}
                      onChange={(e) => updateField('footer_line_spacing', e.target.value)}
                      className="toolbar-select"
                    >
                      <option value="1">Simple</option>
                      <option value="1.2">1.2</option>
                      <option value="1.5">1.5</option>
                      <option value="2">Double</option>
                    </select>
                  </div>
                </div>

                {/* Éditeur de format */}
                <div className="format-editor">
                  <div className="format-help">
                    <span className="help-title">Variables disponibles :</span>
                    <code>{'{address}'}</code>
                    <code>{'{city}'}</code>
                    <code>{'{phone}'}</code>
                    <code>{'{fax}'}</code>
                    <code>{'{email}'}</code>
                    <code>{'{website}'}</code>
                    <code>{'{page}'}</code>
                  </div>
                  
                  <div className="form-group">
                    <label>Ligne 1</label>
                    <input
                      type="text"
                      value={reportSettings.footer_format_line1}
                      onChange={(e) => updateField('footer_format_line1', e.target.value)}
                      placeholder="{address} - {city}    Tél : {phone}"
                      className="format-input"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Ligne 2</label>
                    <input
                      type="text"
                      value={reportSettings.footer_format_line2}
                      onChange={(e) => updateField('footer_format_line2', e.target.value)}
                      placeholder="E-mail : {email}    Site : {website}    Page {page}"
                      className="format-input"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Aperçu en temps réel */}
            <div className="settings-card preview-card">
              <div className="preview-header">
                <h3>👁️ Aperçu en temps réel</h3>
                <div className="preview-tools">
                  <button 
                    className={`preview-tool-btn ${previewZoom === 1 ? 'active' : ''}`}
                    onClick={() => setPreviewZoom(1)}
                    title="100%"
                  >
                    100%
                  </button>
                  <button 
                    className={`preview-tool-btn ${previewZoom === 1.5 ? 'active' : ''}`}
                    onClick={() => setPreviewZoom(1.5)}
                    title="150%"
                  >
                    150%
                  </button>
                  <button 
                    className={`preview-tool-btn ${previewZoom === 2 ? 'active' : ''}`}
                    onClick={() => setPreviewZoom(2)}
                    title="200%"
                  >
                    200%
                  </button>
                </div>
              </div>
              
              <div className={`footer-preview-container ${previewStyle}`}>
                <div 
                  className="footer-preview" 
                  style={{ 
                    transform: `scale(${previewZoom})`, 
                    transformOrigin: 'top left',
                    fontSize: `${reportSettings.footer_font_size}pt`,
                    textAlign: reportSettings.footer_alignment as 'left' | 'center' | 'right',
                    lineHeight: reportSettings.footer_line_spacing,
                  }}
                >
                  {/* Ligne 1 formatée */}
                  <div className="footer-preview-line formatted">
                    {formatFooterLine(reportSettings.footer_format_line1, reportSettings)}
                  </div>
                  
                  {/* Ligne 2 formatée */}
                  <div className="footer-preview-line formatted">
                    {formatFooterLine(reportSettings.footer_format_line2, reportSettings)}
                  </div>
                </div>
              </div>
              
              <p className="preview-hint">
                💡 L'aperçu reflète vos paramètres de mise en forme en temps réel.
              </p>
            </div>
          </div>
        )}

        {/* Onglet Règles RH & Légales */}
        {activeTab === 'hr-rules' && (
          <div className="settings-section hr-rules-section">
            {/* Introduction */}
            <div className="settings-card intro-card">
              <div className="intro-header">
                <Scale size={32} className="intro-icon" />
                <div>
                  <h3>Règles RH & Légales pour l'IA</h3>
                  <p>
                    Ces règles sont utilisées par l'assistant IA pour proposer des plannings, 
                    valider des demandes de congés et suggérer des échanges d'horaires.
                    <strong> L'IA respectera impérativement ces contraintes.</strong>
                  </p>
                </div>
              </div>
              {hrRules.last_updated && (
                <div className="last-update">
                  <AlertTriangle size={14} />
                  Dernière mise à jour : {new Date(hrRules.last_updated).toLocaleDateString('fr-CH')} par {hrRules.updated_by}
                </div>
              )}
            </div>

            {/* Navigation des sections */}
            <div className="hr-rules-nav">
              <button 
                className={activeRuleSection === 'general' ? 'active' : ''}
                onClick={() => setActiveRuleSection('general')}
              >
                📋 Règles générales
              </button>
              <button 
                className={activeRuleSection === 'params' ? 'active' : ''}
                onClick={() => setActiveRuleSection('params')}
              >
                ⚙️ Paramètres clés
              </button>
              <button 
                className={activeRuleSection === 'overtime' ? 'active' : ''}
                onClick={() => setActiveRuleSection('overtime')}
              >
                ⏰ Heures sup.
              </button>
              <button 
                className={activeRuleSection === 'special' ? 'active' : ''}
                onClick={() => setActiveRuleSection('special')}
              >
                🌙 Nuit / Week-end
              </button>
              <button 
                className={activeRuleSection === 'leave' ? 'active' : ''}
                onClick={() => setActiveRuleSection('leave')}
              >
                🏖️ Congés / Absences
              </button>
              <button 
                className={activeRuleSection === 'staff' ? 'active' : ''}
                onClick={() => setActiveRuleSection('staff')}
              >
                👥 Effectifs
              </button>
            </div>

            {/* Section: Règles générales */}
            {activeRuleSection === 'general' && (
              <div className="settings-card">
                <h3>📋 Règles générales du travail</h3>
                <p className="settings-description">
                  Collez ici les règles légales générales (droit du travail suisse, CCT, règlement interne).
                  Utilisez le format Markdown pour structurer le texte.
                </p>
                <div className="settings-form">
                  <div className="form-group">
                    <textarea
                      value={hrRules.general_rules}
                      onChange={(e) => updateHRRule('general_rules', e.target.value)}
                      rows={20}
                      className="rules-textarea"
                      placeholder="# Règles du travail..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: Paramètres clés */}
            {activeRuleSection === 'params' && (
              <div className="settings-card">
                <h3>⚙️ Paramètres clés</h3>
                <p className="settings-description">
                  Ces valeurs numériques sont utilisées pour les validations automatiques.
                </p>
                <div className="settings-form">
                  <div className="params-grid">
                    <div className="param-card">
                      <Clock size={24} />
                      <label>Heures max / semaine</label>
                      <input
                        type="number"
                        value={hrRules.max_hours_per_week}
                        onChange={(e) => updateHRRule('max_hours_per_week', parseInt(e.target.value))}
                      />
                      <span className="unit">heures</span>
                    </div>
                    
                    <div className="param-card">
                      <Clock size={24} />
                      <label>Heures max / jour</label>
                      <input
                        type="number"
                        value={hrRules.max_hours_per_day}
                        onChange={(e) => updateHRRule('max_hours_per_day', parseInt(e.target.value))}
                      />
                      <span className="unit">heures</span>
                    </div>
                    
                    <div className="param-card">
                      <Clock size={24} />
                      <label>Repos min. entre shifts</label>
                      <input
                        type="number"
                        value={hrRules.min_rest_between_shifts}
                        onChange={(e) => updateHRRule('min_rest_between_shifts', parseInt(e.target.value))}
                      />
                      <span className="unit">heures</span>
                    </div>
                    
                    <div className="param-card">
                      <Clock size={24} />
                      <label>Pause min. (journée {'>'}9h)</label>
                      <input
                        type="number"
                        value={hrRules.min_break_duration}
                        onChange={(e) => updateHRRule('min_break_duration', parseInt(e.target.value))}
                      />
                      <span className="unit">minutes</span>
                    </div>
                    
                    <div className="param-card">
                      <Calendar size={24} />
                      <label>Jours consécutifs max</label>
                      <input
                        type="number"
                        value={hrRules.max_consecutive_days}
                        onChange={(e) => updateHRRule('max_consecutive_days', parseInt(e.target.value))}
                      />
                      <span className="unit">jours</span>
                    </div>
                    
                    <div className="param-card">
                      <Calendar size={24} />
                      <label>Congés annuels min.</label>
                      <input
                        type="number"
                        value={hrRules.min_annual_leave_days}
                        onChange={(e) => updateHRRule('min_annual_leave_days', parseInt(e.target.value))}
                      />
                      <span className="unit">jours</span>
                    </div>
                    
                    <div className="param-card">
                      <Calendar size={24} />
                      <label>Préavis demande congé</label>
                      <input
                        type="number"
                        value={hrRules.notice_period_leave_days}
                        onChange={(e) => updateHRRule('notice_period_leave_days', parseInt(e.target.value))}
                      />
                      <span className="unit">jours</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section: Heures supplémentaires */}
            {activeRuleSection === 'overtime' && (
              <div className="settings-card">
                <h3>⏰ Règles des heures supplémentaires</h3>
                <p className="settings-description">
                  Définissez les règles de gestion et compensation des heures supplémentaires.
                </p>
                <div className="settings-form">
                  <div className="form-group">
                    <textarea
                      value={hrRules.overtime_rules}
                      onChange={(e) => updateHRRule('overtime_rules', e.target.value)}
                      rows={10}
                      className="rules-textarea"
                      placeholder="- Maximum 2h supplémentaires par jour..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: Nuit / Week-end */}
            {activeRuleSection === 'special' && (
              <div className="settings-card">
                <h3>🌙 Travail de nuit et week-end</h3>
                <p className="settings-description">
                  Règles spécifiques pour le travail de nuit, dimanche et jours fériés.
                </p>
                <div className="settings-form">
                  <div className="form-group">
                    <label>Travail de nuit</label>
                    <textarea
                      value={hrRules.night_work_rules}
                      onChange={(e) => updateHRRule('night_work_rules', e.target.value)}
                      rows={6}
                      className="rules-textarea"
                      placeholder="- Le travail de nuit est défini entre 23h et 6h..."
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Week-ends</label>
                    <textarea
                      value={hrRules.weekend_rules}
                      onChange={(e) => updateHRRule('weekend_rules', e.target.value)}
                      rows={6}
                      className="rules-textarea"
                      placeholder="- Le dimanche est jour de repos obligatoire..."
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Jours fériés</label>
                    <textarea
                      value={hrRules.holiday_rules}
                      onChange={(e) => updateHRRule('holiday_rules', e.target.value)}
                      rows={10}
                      className="rules-textarea"
                      placeholder="Jours fériés (Canton de Genève) :&#10;- 1er janvier..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: Congés / Absences */}
            {activeRuleSection === 'leave' && (
              <div className="settings-card">
                <h3>🏖️ Congés et absences</h3>
                <p className="settings-description">
                  Règles pour les différents types de congés et absences.
                </p>
                <div className="settings-form">
                  <div className="form-group">
                    <label>Maladie</label>
                    <textarea
                      value={hrRules.sick_leave_rules}
                      onChange={(e) => updateHRRule('sick_leave_rules', e.target.value)}
                      rows={6}
                      className="rules-textarea"
                      placeholder="- Certificat médical obligatoire dès le 3ème jour..."
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Maternité / Paternité</label>
                    <textarea
                      value={hrRules.maternity_rules}
                      onChange={(e) => updateHRRule('maternity_rules', e.target.value)}
                      rows={6}
                      className="rules-textarea"
                      placeholder="- Congé maternité : 14 semaines (98 jours)..."
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Congés spéciaux</label>
                    <textarea
                      value={hrRules.special_leave_rules}
                      onChange={(e) => updateHRRule('special_leave_rules', e.target.value)}
                      rows={8}
                      className="rules-textarea"
                      placeholder="Congés spéciaux (selon usage) :&#10;- Mariage : 2-3 jours..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: Effectifs */}
            {activeRuleSection === 'staff' && (
              <div className="settings-card">
                <h3>👥 Effectifs et rôles requis</h3>
                <p className="settings-description">
                  Contraintes d'effectif minimum pour chaque shift.
                </p>
                <div className="settings-form">
                  <div className="form-group-inline">
                    <div className="form-group">
                      <label>Effectif minimum par shift</label>
                      <input
                        type="number"
                        value={hrRules.min_staff_per_shift}
                        onChange={(e) => updateHRRule('min_staff_per_shift', parseInt(e.target.value))}
                        min={1}
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>Rôles requis</label>
                    <textarea
                      value={hrRules.roles_required}
                      onChange={(e) => updateHRRule('roles_required', e.target.value)}
                      rows={8}
                      className="rules-textarea"
                      placeholder="Au minimum pendant les heures d'ouverture :&#10;- 1 ostéopathe diplômé..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Note importante */}
            <div className="settings-card warning-card">
              <AlertTriangle size={20} />
              <div>
                <h4>Important</h4>
                <p>
                  Ces règles seront transmises à l'IA pour <strong>toutes les opérations de planning</strong>.
                  Assurez-vous qu'elles sont complètes et à jour avec la législation suisse actuelle.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

