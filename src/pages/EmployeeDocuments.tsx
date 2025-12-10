/**
 * Page Mes Documents - Fiches de paie, certificats, quittances IS
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Download,
  Eye,
  Calendar,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Receipt,
  Award,
  FolderOpen,
  Lock,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  Mail,
  Send,
  Loader2,
  LayoutGrid,
  List
} from 'lucide-react';
import { query } from '../services/mariadb';
import { queueEmail } from '../services/emailService';
import './EmployeeDocuments.css';

interface Document {
  id: number;
  type: 'payslip' | 'tax_certificate' | 'salary_certificate' | 'contract' | 'other';
  title: string;
  description?: string;
  date: string;
  year: number;
  month?: number;
  file_name: string;
  file_data?: string; // Base64
  file_url?: string;
  status: 'available' | 'pending' | 'processing';
}

interface DocumentCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  documents: Document[];
  isExpanded: boolean;
}

interface EmployeeDocumentsProps {
  user: {
    id: number;
    employee_id?: number;
  } | null;
}

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

type ViewMode = 'type' | 'year';

// Configuration des types de documents pour les badges
const DOC_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  payslip: { label: 'Fiche de paie', color: '#3b82f6', bgColor: '#dbeafe' },
  tax_certificate: { label: 'Quittance IS', color: '#8b5cf6', bgColor: '#ede9fe' },
  salary_certificate: { label: 'Certificat', color: '#10b981', bgColor: '#d1fae5' },
  contract: { label: 'Contrat', color: '#f59e0b', bgColor: '#fef3c7' },
  other: { label: 'Autre', color: '#64748b', bgColor: '#f1f5f9' }
};

export function EmployeeDocuments({ user }: EmployeeDocumentsProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [isSubjectToWithholdingTax, setIsSubjectToWithholdingTax] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('type');
  
  // États pour l'envoi par email
  const [emailDoc, setEmailDoc] = useState<Document | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [employeePrivateEmail, setEmployeePrivateEmail] = useState('');
  
  const [categories, setCategories] = useState<DocumentCategory[]>([
    {
      id: 'payslips',
      title: 'Fiches de paie',
      icon: <Receipt size={24} />,
      description: 'Bulletins de salaire mensuels',
      color: '#3b82f6',
      documents: [],
      isExpanded: true
    },
    {
      id: 'tax_withholding',
      title: 'Quittances impôt à la source',
      icon: <FileText size={24} />,
      description: 'Documents fiscaux pour les personnes soumises à l\'IS',
      color: '#8b5cf6',
      documents: [],
      isExpanded: false
    },
    {
      id: 'salary_certificates',
      title: 'Certificats de salaire',
      icon: <Award size={24} />,
      description: 'Attestations annuelles de revenus',
      color: '#10b981',
      documents: [],
      isExpanded: false
    },
    {
      id: 'contracts',
      title: 'Contrats de travail',
      icon: <Lock size={24} />,
      description: 'Contrats et avenants',
      color: '#f59e0b',
      documents: [],
      isExpanded: false
    },
    {
      id: 'other',
      title: 'Autres documents',
      icon: <FolderOpen size={24} />,
      description: 'Attestations diverses, formations, etc.',
      color: '#64748b',
      documents: [],
      isExpanded: false
    }
  ]);

  const employeeId = user?.employee_id || user?.id;

  useEffect(() => {
    if (employeeId) {
      loadDocuments();
      checkWithholdingTaxStatus();
    }
  }, [employeeId, selectedYear]);

  const checkWithholdingTaxStatus = async () => {
    try {
      const result = await query<any>(
        `SELECT JSON_EXTRACT(profile_json, '$.salaire.impot_source') as is_subject,
                JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.contact.email_prive')) as email_prive
         FROM employees WHERE employee_id = ?`,
        [employeeId]
      );
      if (result.success && result.data?.[0]) {
        setIsSubjectToWithholdingTax(result.data[0].is_subject === true || result.data[0].is_subject === 'true');
        // Récupérer l'email privé de l'employé
        if (result.data[0].email_prive && result.data[0].email_prive !== 'null') {
          setEmployeePrivateEmail(result.data[0].email_prive);
        }
      }
    } catch (error) {
      console.error('Erreur vérification IS:', error);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      // Charger les fiches de paie
      const payslipsQuery = selectedYear === 'all'
        ? `SELECT id, mois, annee, pdf_data, created_at 
           FROM salary_pdfs 
           WHERE employee_id = ?
           ORDER BY annee DESC, mois DESC`
        : `SELECT id, mois, annee, pdf_data, created_at 
           FROM salary_pdfs 
           WHERE employee_id = ? AND annee = ?
           ORDER BY annee DESC, mois DESC`;
      
      const payslipsParams = selectedYear === 'all' ? [employeeId] : [employeeId, selectedYear];
      const payslipsResult = await query<any>(payslipsQuery, payslipsParams);

      const payslips: Document[] = (payslipsResult.data || []).map((p: any) => ({
        id: p.id,
        type: 'payslip' as const,
        title: `Fiche de paie - ${MONTHS[p.mois - 1]} ${p.annee}`,
        date: `${p.annee}-${String(p.mois).padStart(2, '0')}-01`,
        year: p.annee,
        month: p.mois,
        file_name: `fiche_paie_${p.annee}_${String(p.mois).padStart(2, '0')}.pdf`,
        file_data: p.pdf_data,
        status: 'available' as const
      }));

      // Charger les contrats depuis le JSON employees (structure PayFlow)
      // Les documents peuvent être dans $.contracts ou $.documents
      const contractsResult = await query<any>(
        `SELECT 
           JSON_EXTRACT(profile_json, '$.contracts') as contracts,
           JSON_EXTRACT(profile_json, '$.documents') as documents
         FROM employees WHERE employee_id = ?`,
        [employeeId]
      );

      let contracts: Document[] = [];
      if (contractsResult.success && contractsResult.data?.[0]) {
        const row = contractsResult.data[0];
        console.log('[Documents] Données brutes contrats:', row.contracts);
        console.log('[Documents] Données brutes documents:', row.documents);
        
        // Essayer les deux chemins possibles
        const rawData = row.contracts || row.documents;
        
        if (rawData) {
          try {
            const contractsData = typeof rawData === 'string' 
              ? JSON.parse(rawData) 
              : rawData;
            
            console.log('[Documents] Contrats parsés:', contractsData);
            
            // Structure PayFlow: id, type, titre, titre_original, date_document, date_upload, file_url/content, file_type, file_size
            // OU structure alternative: name, filename, data, mimeType, uploadedAt
            const dataArray = Array.isArray(contractsData) ? contractsData : [contractsData];
            
            contracts = dataArray.filter(Boolean).map((c: any, index: number) => {
              const docDate = c.date_document || c.date_upload || c.uploadedAt || c.created_at || '';
              const dateObj = docDate ? new Date(docDate) : new Date();
              
              // Supporter différentes structures de données
              const fileContent = c.file_url || c.content || c.data || c.pdf_data || c.base64 || '';
              const fileName = c.titre_original || c.titre || c.filename || c.name || `contrat_${index + 1}.pdf`;
              const title = c.titre || c.name || c.titre_original || c.filename || `Contrat de travail`;
              
              return {
                id: c.id || index + 1,
                type: 'contract' as const,
                title: title,
                description: c.type ? `Type: ${c.type}` : c.description,
                date: docDate,
                year: dateObj.getFullYear(),
                file_name: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
                file_url: fileContent,
                status: fileContent ? 'available' as const : 'pending' as const
              };
            }).filter(c => c.title); // Filtrer les entrées vides
            
            console.log('[Documents] Contrats formatés:', contracts);
          } catch (e) {
            console.error('[Documents] Erreur parsing contrats:', e, rawData);
          }
        }
      }

      // Charger les certificats de salaire (si table existe)
      let salaryCertificates: Document[] = [];
      try {
        const certQuery = selectedYear === 'all'
          ? `SELECT * FROM salary_certificates 
             WHERE employee_id = ?
             ORDER BY year DESC`
          : `SELECT * FROM salary_certificates 
             WHERE employee_id = ? AND year = ?
             ORDER BY year DESC`;
        const certParams = selectedYear === 'all' ? [employeeId] : [employeeId, selectedYear];
        const certResult = await query<any>(certQuery, certParams);
        if (certResult.success && certResult.data) {
          salaryCertificates = certResult.data.map((c: any) => ({
            id: c.id,
            type: 'salary_certificate' as const,
            title: `Certificat de salaire ${c.year}`,
            date: `${c.year}-12-31`,
            year: c.year,
            file_name: `certificat_salaire_${c.year}.pdf`,
            file_data: c.pdf_data,
            status: 'available' as const
          }));
        }
      } catch (e) {
        // Table n'existe peut-être pas encore
      }

      // Charger les quittances IS (si table existe et si soumis)
      let taxDocs: Document[] = [];
      if (isSubjectToWithholdingTax) {
        try {
          const taxQuery = selectedYear === 'all'
            ? `SELECT * FROM tax_withholding_docs 
               WHERE employee_id = ?
               ORDER BY year DESC, month DESC`
            : `SELECT * FROM tax_withholding_docs 
               WHERE employee_id = ? AND year = ?
               ORDER BY year DESC, month DESC`;
          const taxParams = selectedYear === 'all' ? [employeeId] : [employeeId, selectedYear];
          const taxResult = await query<any>(taxQuery, taxParams);
          if (taxResult.success && taxResult.data) {
            taxDocs = taxResult.data.map((t: any) => ({
              id: t.id,
              type: 'tax_certificate' as const,
              title: t.month 
                ? `Quittance IS - ${MONTHS[t.month - 1]} ${t.year}`
                : `Récapitulatif IS ${t.year}`,
              date: t.month ? `${t.year}-${String(t.month).padStart(2, '0')}-01` : `${t.year}-12-31`,
              year: t.year,
              month: t.month,
              file_name: `quittance_is_${t.year}${t.month ? '_' + String(t.month).padStart(2, '0') : ''}.pdf`,
              file_data: t.pdf_data,
              status: 'available' as const
            }));
          }
        } catch (e) {
          // Table n'existe peut-être pas encore
        }
      }

      // Mettre à jour les catégories
      setCategories(prev => prev.map(cat => {
        switch (cat.id) {
          case 'payslips':
            return { ...cat, documents: payslips };
          case 'tax_withholding':
            return { ...cat, documents: taxDocs };
          case 'salary_certificates':
            return { ...cat, documents: salaryCertificates };
          case 'contracts':
            return { ...cat, documents: contracts };
          default:
            return cat;
        }
      }));

    } catch (error) {
      console.error('Erreur chargement documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setCategories(prev => prev.map(cat => 
      cat.id === categoryId ? { ...cat, isExpanded: !cat.isExpanded } : cat
    ));
  };

  const handleDownload = (doc: Document) => {
    const base64Data = doc.file_data || doc.file_url;
    if (!base64Data) return;

    // Créer un lien de téléchargement
    const link = document.createElement('a');
    
    // Si c'est déjà une data URL ou un Base64 pur
    if (base64Data.startsWith('data:')) {
      link.href = base64Data;
    } else {
      link.href = `data:application/pdf;base64,${base64Data}`;
    }
    
    link.download = doc.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (doc: Document) => {
    setPreviewDoc(doc);
  };

  const handleEmailOpen = (doc: Document) => {
    setEmailDoc(doc);
    setEmailTo(employeePrivateEmail); // Pré-remplir avec l'email privé de l'employé
    setEmailSubject(`Document : ${doc.title}`);
    setEmailMessage(`Bonjour,\n\nVeuillez trouver ci-joint le document "${doc.title}".\n\nCordialement`);
    setEmailSent(false);
    setEmailError('');
  };

  const handleSendEmail = async () => {
    if (!emailDoc || !emailTo) return;
    
    // Validation email simple
    if (!emailTo.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setEmailError('Adresse email invalide');
      return;
    }

    setIsSendingEmail(true);
    setEmailError('');

    try {
      // Préparer le contenu HTML de l'email
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #3b82f6; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">POGE</h1>
            <p style="margin: 5px 0 0;">Permanence Ostéopathique de Genève</p>
          </div>
          <div style="padding: 30px; background: #f8fafc;">
            <p style="white-space: pre-line;">${emailMessage}</p>
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-top: 20px;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">📎 Pièce jointe :</p>
              <p style="margin: 5px 0 0; font-weight: 600;">${emailDoc.file_name}</p>
            </div>
          </div>
          <div style="background: #1e293b; color: #94a3b8; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">Ce document vous est envoyé depuis l'espace employé POGE</p>
          </div>
        </div>
      `;

      // Envoyer via la queue d'emails
      const success = await queueEmail({
        to: emailTo,
        subject: emailSubject,
        html: htmlContent,
        attachments: [{
          filename: emailDoc.file_name,
          content: (emailDoc.file_data || emailDoc.file_url || '').replace(/^data:application\/pdf;base64,/, ''),
          encoding: 'base64'
        }]
      });

      if (success) {
        setEmailSent(true);
        setTimeout(() => {
          setEmailDoc(null);
        }, 2000);
      } else {
        setEmailError('Erreur lors de l\'envoi. Veuillez réessayer.');
      }
    } catch (error) {
      console.error('Erreur envoi email:', error);
      setEmailError('Erreur lors de l\'envoi. Veuillez réessayer.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const filteredCategories = categories
    .filter(cat => {
      // Masquer la catégorie IS si l'employé n'est pas soumis
      if (cat.id === 'tax_withholding' && !isSubjectToWithholdingTax) {
        return false;
      }
      return true;
    })
    .map(cat => ({
      ...cat,
      documents: cat.documents.filter(doc => 
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.file_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }));

  const totalDocs = filteredCategories.reduce((acc, cat) => acc + cat.documents.length, 0);

  // Grouper tous les documents par année pour la vue annuelle
  const getDocumentsByYear = () => {
    const allDocs: Document[] = filteredCategories.flatMap(cat => cat.documents);
    const byYear: Record<number, Document[]> = {};
    
    allDocs.forEach(doc => {
      const year = doc.year;
      if (!byYear[year]) {
        byYear[year] = [];
      }
      byYear[year].push(doc);
    });

    // Trier les documents dans chaque année par date (du plus récent au plus ancien)
    Object.keys(byYear).forEach(year => {
      byYear[parseInt(year)].sort((a, b) => {
        // Trier par mois (si existant) puis par date
        if (a.month && b.month) {
          return b.month - a.month;
        }
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    });

    // Retourner les années triées du plus récent au plus ancien
    return Object.entries(byYear)
      .map(([year, docs]) => ({ year: parseInt(year), documents: docs }))
      .sort((a, b) => b.year - a.year);
  };

  const documentsByYear = getDocumentsByYear();

  // Générer les années disponibles (5 dernières années)
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="employee-documents-page">
      {/* Header */}
      <header className="documents-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Mes Documents</h1>
            <p className="subtitle">{totalDocs} document{totalDocs > 1 ? 's' : ''} disponible{totalDocs > 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Toggle vue */}
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'type' ? 'active' : ''}`}
              onClick={() => setViewMode('type')}
              title="Vue par type"
            >
              <LayoutGrid size={18} />
              <span>Par type</span>
            </button>
            <button
              className={`toggle-btn ${viewMode === 'year' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('year');
                setSelectedYear('all'); // Passer en mode toutes les années
              }}
              title="Vue annuelle"
            >
              <List size={18} />
              <span>Par année</span>
            </button>
          </div>

          {/* Filtre par année - visible seulement en vue par type */}
          {viewMode === 'type' && (
            <div className="year-filter">
              <Calendar size={18} />
              <select 
                value={selectedYear === 'all' ? currentYear : selectedYear} 
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}

          {/* Recherche */}
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Rechercher un document..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <div className="documents-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Chargement des documents...</p>
          </div>
        ) : viewMode === 'type' ? (
          /* VUE PAR TYPE */
          <div className="categories-list">
            {filteredCategories.map(category => (
              <div 
                key={category.id} 
                className={`category-section ${category.isExpanded ? 'expanded' : ''}`}
              >
                {/* En-tête de catégorie */}
                <button 
                  className="category-header"
                  onClick={() => toggleCategory(category.id)}
                  style={{ '--category-color': category.color } as React.CSSProperties}
                >
                  <div className="category-icon" style={{ background: category.color }}>
                    {category.icon}
                  </div>
                  <div className="category-info">
                    <h2>{category.title}</h2>
                    <p>{category.description}</p>
                  </div>
                  <div className="category-meta">
                    <span className="doc-count">
                      {category.documents.length} document{category.documents.length > 1 ? 's' : ''}
                    </span>
                    <ChevronDown 
                      size={20} 
                      className={`chevron ${category.isExpanded ? 'rotated' : ''}`}
                    />
                  </div>
                </button>

                {/* Liste des documents */}
                {category.isExpanded && (
                  <div className="documents-list">
                    {category.documents.length === 0 ? (
                      <div className="empty-category">
                        <FolderOpen size={32} />
                        <p>Aucun document disponible pour {selectedYear}</p>
                      </div>
                    ) : (
                      category.documents.map(doc => (
                        <div key={`${doc.type}-${doc.id}`} className="document-card">
                          <div className="doc-icon">
                            <FileText size={20} />
                          </div>
                          <div className="doc-info">
                            <h3>{doc.title}</h3>
                            <div className="doc-meta">
                              <span className="doc-date">
                                <Clock size={14} />
                                {doc.month 
                                  ? `${MONTHS[doc.month - 1]} ${doc.year}`
                                  : doc.year
                                }
                              </span>
                              <span className={`doc-status ${doc.status}`}>
                                {doc.status === 'available' && <><CheckCircle size={14} /> Disponible</>}
                                {doc.status === 'pending' && <><AlertTriangle size={14} /> En attente</>}
                                {doc.status === 'processing' && <><Clock size={14} /> En cours</>}
                              </span>
                            </div>
                          </div>
                          <div className="doc-actions">
                            {(doc.file_data || doc.file_url) && (
                              <>
                                <button 
                                  className="btn-action preview"
                                  onClick={() => handlePreview(doc)}
                                  title="Aperçu"
                                >
                                  <Eye size={18} />
                                </button>
                                <button 
                                  className="btn-action email"
                                  onClick={() => handleEmailOpen(doc)}
                                  title="Envoyer par email"
                                >
                                  <Mail size={18} />
                                </button>
                                <button 
                                  className="btn-action download"
                                  onClick={() => handleDownload(doc)}
                                  title="Télécharger"
                                >
                                  <Download size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* VUE PAR ANNÉE */
          <div className="yearly-view">
            {documentsByYear.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={48} />
                <h3>Aucun document disponible</h3>
                <p>Vos documents apparaîtront ici une fois disponibles.</p>
              </div>
            ) : (
              documentsByYear.map(({ year, documents }) => (
                <div key={year} className="year-section">
                  <div className="year-header">
                    <div className="year-badge">
                      <Calendar size={20} />
                      <span>{year}</span>
                    </div>
                    <span className="year-count">
                      {documents.length} document{documents.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="year-documents">
                    {documents.map(doc => (
                      <div key={`${doc.type}-${doc.id}-${doc.year}`} className="document-card yearly">
                        <div 
                          className="doc-type-badge"
                          style={{ 
                            background: DOC_TYPE_CONFIG[doc.type]?.bgColor || '#f1f5f9',
                            color: DOC_TYPE_CONFIG[doc.type]?.color || '#64748b'
                          }}
                        >
                          {DOC_TYPE_CONFIG[doc.type]?.label || 'Document'}
                        </div>
                        <div className="doc-icon">
                          <FileText size={20} />
                        </div>
                        <div className="doc-info">
                          <h3>{doc.title}</h3>
                          <div className="doc-meta">
                            <span className="doc-date">
                              <Clock size={14} />
                              {doc.month 
                                ? `${MONTHS[doc.month - 1]} ${doc.year}`
                                : doc.year
                              }
                            </span>
                            <span className={`doc-status ${doc.status}`}>
                              {doc.status === 'available' && <><CheckCircle size={14} /> Disponible</>}
                              {doc.status === 'pending' && <><AlertTriangle size={14} /> En attente</>}
                              {doc.status === 'processing' && <><Clock size={14} /> En cours</>}
                            </span>
                          </div>
                        </div>
                        <div className="doc-actions">
                          {(doc.file_data || doc.file_url) && (
                            <>
                              <button 
                                className="btn-action preview"
                                onClick={() => handlePreview(doc)}
                                title="Aperçu"
                              >
                                <Eye size={18} />
                              </button>
                              <button 
                                className="btn-action email"
                                onClick={() => handleEmailOpen(doc)}
                                title="Envoyer par email"
                              >
                                <Mail size={18} />
                              </button>
                              <button 
                                className="btn-action download"
                                onClick={() => handleDownload(doc)}
                                title="Télécharger"
                              >
                                <Download size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal de prévisualisation */}
      {previewDoc && (
        <div className="preview-modal" onClick={() => setPreviewDoc(null)}>
          <div className="preview-content" onClick={e => e.stopPropagation()}>
            <div className="preview-header">
              <h3>{previewDoc.title}</h3>
              <div className="preview-actions">
                <button 
                  className="btn-download"
                  onClick={() => handleDownload(previewDoc)}
                >
                  <Download size={18} />
                  Télécharger
                </button>
                <button 
                  className="btn-close"
                  onClick={() => setPreviewDoc(null)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="preview-body">
              {(previewDoc.file_data || previewDoc.file_url) ? (
                <iframe
                  src={
                    (previewDoc.file_data || previewDoc.file_url || '').startsWith('data:')
                      ? (previewDoc.file_data || previewDoc.file_url)
                      : `data:application/pdf;base64,${previewDoc.file_data || previewDoc.file_url}`
                  }
                  title={previewDoc.title}
                />
              ) : (
                <div className="no-preview">
                  <FileText size={48} />
                  <p>Aperçu non disponible</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal d'envoi par email */}
      {emailDoc && (
        <div className="email-modal" onClick={() => !isSendingEmail && setEmailDoc(null)}>
          <div className="email-content" onClick={e => e.stopPropagation()}>
            <div className="email-header">
              <Mail size={24} />
              <h3>Envoyer par email</h3>
              <button 
                className="btn-close"
                onClick={() => setEmailDoc(null)}
                disabled={isSendingEmail}
              >
                <X size={20} />
              </button>
            </div>

            {emailSent ? (
              <div className="email-success">
                <CheckCircle size={48} />
                <h4>Email envoyé !</h4>
                <p>Le document a été envoyé à {emailTo}</p>
              </div>
            ) : (
              <div className="email-form">
                {/* Document à envoyer */}
                <div className="email-attachment">
                  <FileText size={20} />
                  <div>
                    <p className="attachment-name">{emailDoc.title}</p>
                    <p className="attachment-file">{emailDoc.file_name}</p>
                  </div>
                </div>

                {/* Champs du formulaire */}
                <div className="form-group">
                  <label>Destinataire *</label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="email@exemple.com"
                    disabled={isSendingEmail}
                  />
                </div>

                <div className="form-group">
                  <label>Objet</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Objet de l'email"
                    disabled={isSendingEmail}
                  />
                </div>

                <div className="form-group">
                  <label>Message</label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    rows={5}
                    placeholder="Votre message..."
                    disabled={isSendingEmail}
                  />
                </div>

                {emailError && (
                  <div className="email-error">
                    <AlertTriangle size={16} />
                    {emailError}
                  </div>
                )}

                <div className="email-actions">
                  <button 
                    className="btn-cancel"
                    onClick={() => setEmailDoc(null)}
                    disabled={isSendingEmail}
                  >
                    Annuler
                  </button>
                  <button 
                    className="btn-send"
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailTo}
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Envoyer
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

