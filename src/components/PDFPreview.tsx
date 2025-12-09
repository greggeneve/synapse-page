import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReportTeamMember } from '../services/teamReportService';
import { getReportTeam } from '../services/teamReportService';
import { getReportSettings, type ReportSettings } from '../services/reportSettingsService';
import type { Report } from '../types';
import './PDFPreview.css';

interface PDFPreviewProps {
  report: Partial<Report>;
  logoUrl?: string;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

// Dimensions A4 en pixels (72dpi)
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export function PDFPreview({ report, logoUrl, zoom = 1, onZoomChange }: PDFPreviewProps) {
  const [team, setTeam] = useState<ReportTeamMember[]>([]);
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [baseScale, setBaseScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculer le scale de base pour adapter le PDF à l'espace disponible
  const calculateScale = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const availableWidth = container.clientWidth - 40; // padding
    const availableHeight = container.clientHeight - 40; // padding
    
    const scaleX = availableWidth / A4_WIDTH;
    const scaleY = availableHeight / A4_HEIGHT;
    
    // Utiliser le plus petit scale pour que tout tienne (pas de max, le PDF remplit l'espace)
    const newScale = Math.min(scaleX, scaleY);
    setBaseScale(Math.max(0.3, newScale)); // min 0.3 pour rester lisible
  }, []);
  
  // Gestion du zoom avec la molette (fallback si pas de onZoomChange)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if ((e.ctrlKey || e.metaKey) && onZoomChange) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      onZoomChange(Math.min(3, Math.max(0.25, zoom + delta)));
    }
  }, [zoom, onZoomChange]);
  
  // Scale final = base scale * zoom utilisateur
  const scale = baseScale * zoom;

  // Charger l'équipe à chaque montage du composant (rafraîchissement automatique)
  useEffect(() => {
    loadTeam();
  }, []); // Dépendances vides = exécuté uniquement au montage

  // Gérer le resize séparément
  useEffect(() => {
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [calculateScale]);

  // Recalculer quand le conteneur change de taille
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      calculateScale();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [calculateScale]);

  const loadTeam = async () => {
    setIsLoading(true);
    const [members, reportSettings] = await Promise.all([
      getReportTeam(),
      getReportSettings()
    ]);
    setTeam(members);
    setSettings(reportSettings);
    setIsLoading(false);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Fonction pour formater une ligne du pied de page avec variables
  const formatFooterLine = (template: string, s: ReportSettings | null): React.ReactNode => {
    if (!template || !s) return null;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\{(address|city|phone|fax|email|website|page)\}/g;
    let match;
    let key = 0;
    
    while ((match = regex.exec(template)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{template.slice(lastIndex, match.index)}</span>);
      }
      
      const varName = match[1];
      switch (varName) {
        case 'address':
          parts.push(<span key={key++}>{s.footer_address}</span>);
          break;
        case 'city':
          parts.push(<span key={key++}>{s.footer_city}</span>);
          break;
        case 'phone':
          parts.push(
            <a key={key++} href={s.footer_phone_link} className="footer-link">
              {s.footer_phone}
            </a>
          );
          break;
        case 'fax':
          if (s.footer_fax) {
            parts.push(<span key={key++}>{s.footer_fax}</span>);
          }
          break;
        case 'email':
          parts.push(
            <a key={key++} href={s.footer_email_link} className="footer-link">
              {s.footer_email}
            </a>
          );
          break;
        case 'website':
          parts.push(
            <a key={key++} href={s.footer_website_link} className="footer-link" target="_blank" rel="noopener noreferrer">
              {s.footer_website}
            </a>
          );
          break;
        case 'page':
          parts.push(<span key={key++} className="page-num">1</span>);
          break;
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < template.length) {
      parts.push(<span key={key++}>{template.slice(lastIndex)}</span>);
    }
    
    return parts;
  };

  const today = new Date().toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  // Nombre de praticiens sur la page 1
  // Limité à 9 pour ne pas empiéter sur le pied de page
  const MAX_PRACTITIONERS_PAGE_1 = 9;
  const page1Team = team.slice(0, MAX_PRACTITIONERS_PAGE_1);
  const page2Team = team.slice(MAX_PRACTITIONERS_PAGE_1);

  // Parser le contenu pour le rendu
  const renderContent = (content: string) => {
    if (!content) return null;
    
    const lines = content.split('\n');
    const elements: JSX.Element[] = [];
    
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      
      // Titre de consultation avec date
      if (trimmed.match(/^Consultation\s+\d{2}[\.\/]\d{2}[\.\/]\d{4}/i)) {
        elements.push(
          <div key={idx} className="pdf-consultation-title">
            <strong>{trimmed}</strong>
            <div className="pdf-title-line" />
          </div>
        );
      }
      // Sous-titre en italique
      else if (trimmed.match(/^(Motif de consultation|Anamnèse|Examen clinique|Interprétation clinique|Traitement ostéopathique|Plan et recommandations|Diagnostic|Conclusions?|Évolution)$/i)) {
        elements.push(
          <p key={idx} className="pdf-subtitle">
            <em>{trimmed}</em>
          </p>
        );
      }
      // Titre markdown
      else if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={idx} className="pdf-section-title">
            {trimmed.replace(/^#+\s*/, '')}
          </h3>
        );
      }
      // Liste à puces
      else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
        elements.push(
          <p key={idx} className="pdf-bullet">
            • {trimmed.replace(/^[-•*]\s*/, '')}
          </p>
        );
      }
      // Ligne vide
      else if (trimmed === '') {
        elements.push(<div key={idx} className="pdf-spacer" />);
      }
      // Texte en gras
      else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        elements.push(
          <p key={idx} className="pdf-bold">
            {trimmed.replace(/\*\*/g, '')}
          </p>
        );
      }
      // Texte normal
      else {
        elements.push(
          <p key={idx} className="pdf-paragraph">
            {trimmed}
          </p>
        );
      }
    });
    
    return elements;
  };

  // Trouver l'auteur dans l'équipe
  const author = team.find(m => 
    `${m.prenom} ${m.nom}`.toLowerCase() === (report.authorName || '').toLowerCase()
  );

  return (
    <div className="pdf-preview-container">
      <div className="pdf-preview-header">
        <div className="pdf-preview-title">
          <span>Aperçu du PDF</span>
          <button 
            className="refresh-btn" 
            onClick={loadTeam}
            title="Rafraîchir la liste des praticiens"
          >
            ↻
          </button>
        </div>
        <div className="pdf-zoom-controls">
          <button 
            className="zoom-btn" 
            onClick={() => onZoomChange?.(Math.max(0.25, zoom - 0.25))}
            title="Zoom arrière"
          >
            −
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button 
            className="zoom-btn" 
            onClick={() => onZoomChange?.(Math.min(3, zoom + 0.25))}
            title="Zoom avant"
          >
            +
          </button>
          <button 
            className="zoom-btn reset" 
            onClick={() => onZoomChange?.(1)}
            title="Réinitialiser le zoom"
          >
            ⟲
          </button>
        </div>
        <span className="pdf-preview-hint">Ctrl+Molette pour zoomer</span>
      </div>
      
      <div className="pdf-preview-scroll" ref={containerRef} onWheel={handleWheel}>
        <div 
          className="pdf-page"
          style={{
            transform: `scale(${scale})`,
            marginBottom: `${-A4_HEIGHT * (1 - scale)}px`
          }}
        >
          {/* EN-TÊTE GAUCHE */}
          <div className="pdf-header-left">
            {/* Logo (cliquable vers le site) */}
            <div className="pdf-logo">
              {logoUrl ? (
                <a 
                  href={settings?.footer_website_link || 'https://www.poge.ch'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  title="Cliquez pour visiter le site"
                  className="pdf-logo-link"
                >
                  <img src={logoUrl} alt="POGE" />
                </a>
              ) : (
                <div className="pdf-logo-placeholder">POGE</div>
              )}
            </div>

            {/* Slogan (depuis les paramètres) */}
            <div className="pdf-slogan">
              <em>
                {settings?.slogan_line1 || 'Pour toute urgence, un'}<br />
                {settings?.slogan_line2 || 'rdv vous est proposé'}<br />
                {settings?.slogan_line3 || 'dans la journée.'}
              </em>
            </div>

            {/* Liste des praticiens (page 1 : max 5 premiers) */}
            <div className="pdf-team-list">
              {isLoading ? (
                <div className="pdf-loading">Chargement...</div>
              ) : (
                page1Team.map(member => (
                  <div key={member.id} className="pdf-team-member">
                    <div className="pdf-member-name">{member.prenom} {member.nom}</div>
                    {/* Titres multi-lignes (séparés par \n) */}
                    {member.displayTitle.split('\n').map((titleLine, i) => (
                      <div key={`title-${i}`} className="pdf-member-title">{titleLine}</div>
                    ))}
                    {member.certifications.map((cert, i) => (
                      <div key={`cert-${i}`} className="pdf-member-cert">{cert}</div>
                    ))}
                    {member.rme_rcc && (
                      <div className="pdf-member-rme">{member.rme_rcc}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CONTENU PRINCIPAL */}
          <div className="pdf-main-content">
            {/* Date */}
            <div className="pdf-date">
              Genève, le {today}
            </div>

            {/* Destinataire */}
            <div className="pdf-destinataire">
              {report.destinataire || 'A qui de droit'}
            </div>

            {/* Objet */}
            <div className="pdf-objet">
              Concerne{' '}
              {report.patientName ? (
                <span className="pdf-patient-name">{report.patientName}</span>
              ) : (
                <span className="pdf-placeholder">[Patient]</span>
              )}
              {' '}né(e) le{' '}
              {report.patientBirthDate ? (
                <span>{formatDate(report.patientBirthDate)}</span>
              ) : (
                <span className="pdf-to-fill">À REMPLIR</span>
              )}
            </div>

            {/* Introduction */}
            <div className="pdf-introduction">
              {report.introduction || 'Madame, Monsieur,'}
            </div>

            {/* Contenu */}
            <div className="pdf-content">
              {(report.content && report.content.trim()) || (report.correctedContent && report.correctedContent.trim()) ? (
                renderContent(report.correctedContent || report.content || '')
              ) : (
                <div className="pdf-empty-content">
                  <p className="pdf-placeholder-text">
                    Le contenu de votre rapport apparaîtra ici...
                  </p>
                </div>
              )}
            </div>

            {/* Signature personnalisée */}
            <div className="pdf-signature">
              {report.signatureLines && report.signatureLines.length > 0 ? (
                // Utiliser les lignes de signature personnalisées
                report.signatureLines.map((line, index) => (
                  <div 
                    key={index} 
                    className={`pdf-signature-line ${index === 0 ? 'name' : ''} ${line.includes('@') ? 'email' : ''} ${line.includes('RME') ? 'rme' : ''}`}
                  >
                    {line.includes('@') ? (
                      <a href={`mailto:${line}`}>{line}</a>
                    ) : (
                      line
                    )}
                  </div>
                ))
              ) : (
                // Signature par défaut si aucune signature personnalisée
                <>
                  <div className="pdf-author-name">{report.authorName || '[Votre nom]'}</div>
                  {author && (
                    <div className="pdf-author-title">Ostéopathe, {author.displayTitle}</div>
                  )}
                  <div className="pdf-author-email">
                    <a href={`mailto:${report.authorEmail || (report.authorName 
                      ? `${report.authorName.toLowerCase().replace(' ', '.')}@poge.ch`
                      : 'email@poge.ch'
                    )}`}>
                      {report.authorEmail || (report.authorName 
                        ? `${report.authorName.toLowerCase().replace(' ', '.')}@poge.ch`
                        : 'email@poge.ch'
                      )}
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* PIED DE PAGE avec mise en forme personnalisée */}
          <div 
            className={`pdf-footer align-${settings?.footer_alignment || 'left'}`}
            style={{
              fontSize: `${settings?.footer_font_size || '7'}pt`,
              lineHeight: settings?.footer_line_spacing || '1.2',
            }}
          >
            <div className="pdf-footer-line">
              {formatFooterLine(
                settings?.footer_format_line1 || '{address} - {city}    Tél : {phone}',
                settings
              )}
            </div>
            <div className="pdf-footer-line">
              {formatFooterLine(
                settings?.footer_format_line2?.replace('{page}', '1/' + (page2Team.length > 0 ? '2' : '1')) || 'E-mail : {email}    Site : {website}    Page 1/' + (page2Team.length > 0 ? '2' : '1'),
                settings
              )}
            </div>
          </div>
        </div>

        {/* ======================== PAGE 2 (VERSO) ======================== */}
        <div 
          className="pdf-page pdf-page-2"
          style={{
            transform: `scale(${scale})`,
            marginTop: `${20 * scale}px`,
            marginBottom: `${-A4_HEIGHT * (1 - scale)}px`
          }}
        >
          {/* EN-TÊTE GAUCHE - PAGE 2 */}
          <div className="pdf-header-left">
            {/* Logo (cliquable vers le site) */}
            <div className="pdf-logo">
              {logoUrl ? (
                <a 
                  href={settings?.footer_website_link || 'https://www.poge.ch'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  title="Cliquez pour visiter le site"
                  className="pdf-logo-link"
                >
                  <img src={logoUrl} alt="POGE" />
                </a>
              ) : (
                <div className="pdf-logo-placeholder">POGE</div>
              )}
            </div>

            {/* Slogan (depuis les paramètres) */}
            <div className="pdf-slogan">
              <em>
                {settings?.slogan_line1 || 'Pour toute urgence, un'}<br />
                {settings?.slogan_line2 || 'rdv vous est proposé'}<br />
                {settings?.slogan_line3 || 'dans la journée.'}
              </em>
            </div>

            {/* Liste des praticiens (page 2 : suite) */}
            <div className="pdf-team-list">
              {isLoading ? (
                <div className="pdf-loading">Chargement...</div>
              ) : (
                page2Team.map(member => (
                  <div key={member.id} className="pdf-team-member">
                    <div className="pdf-member-name">{member.prenom} {member.nom}</div>
                    {/* Titres multi-lignes (séparés par \n) */}
                    {member.displayTitle.split('\n').map((titleLine, i) => (
                      <div key={`title-${i}`} className="pdf-member-title">{titleLine}</div>
                    ))}
                    {member.certifications.map((cert, i) => (
                      <div key={`cert-${i}`} className="pdf-member-cert">{cert}</div>
                    ))}
                    {member.rme_rcc && (
                      <div className="pdf-member-rme">{member.rme_rcc}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CONTENU PAGE 2 - Zone vide ou suite du rapport */}
          <div className="pdf-main-content pdf-page2-content">
            <div className="pdf-page2-info">
              <em>
                {page2Team.length > 0 ? (
                  <>Notre équipe (suite) - {team.length} praticiens au total</>
                ) : (
                  <>Page de garde - {team.length} praticiens</>
                )}
              </em>
            </div>
          </div>

          {/* PIED DE PAGE - PAGE 2 */}
          <div 
            className={`pdf-footer align-${settings?.footer_alignment || 'left'}`}
            style={{
              fontSize: `${settings?.footer_font_size || '7'}pt`,
              lineHeight: settings?.footer_line_spacing || '1.2',
            }}
          >
            <div className="pdf-footer-line">
              {formatFooterLine(
                settings?.footer_format_line1 || '{address} - {city}    Tél : {phone}',
                settings
              )}
            </div>
            <div className="pdf-footer-line">
              {formatFooterLine(
                settings?.footer_format_line2?.replace('{page}', '2/2') || 'E-mail : {email}    Site : {website}    Page 2/2',
                settings
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
