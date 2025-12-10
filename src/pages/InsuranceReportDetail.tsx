/**
 * Page de details d'un rapport d'assurance
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  User,
  Building2,
  UserCheck,
  Loader2,
  Sparkles,
  Save
} from 'lucide-react';
import { query } from '../services/mariadb';
import { assignToOsteo, getOsteoList } from '../services/insuranceReportService';
import { extractReportDataFromPDF, findOsteoByName } from '../services/insuranceReportAIService';
import type { TeamMember } from '../types';
import './InsuranceReportDetail.css';

interface InsuranceReportDetailProps {
  user: TeamMember;
}

export function InsuranceReportDetail({ user }: InsuranceReportDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [osteoList, setOsteoList] = useState<{ id: number; name: string }[]>([]);
  const [selectedOsteo, setSelectedOsteo] = useState<number | ''>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadReport = async () => {
      if (!id) return;
      try {
        const result = await query<any>("SELECT * FROM insurance_reports WHERE id = ?", [id]);

        if (result.data?.[0]) {
          const r = result.data[0];
          setReport(r);
          setSelectedOsteo(r.assigned_osteo_id || '');
          if (r.original_pdf) {
            const byteChars = atob(r.original_pdf);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
            const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
            setPdfUrl(URL.createObjectURL(blob));
          }
        }
        const osteos = await getOsteoList();
        setOsteoList(osteos.map(o => ({ id: o.id, name: o.name })));
      } catch (e) { 
        console.error('[InsuranceReportDetail] Erreur chargement:', e); 
      } finally { 
        setLoading(false); 
      }
    };
    loadReport();
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [id]);

  const handleReanalyze = async () => {
    if (!report?.original_pdf) return;
    setAnalyzing(true);
    try {
      console.log('[ReportDetail] Lancement analyse IA...');
      const result = await extractReportDataFromPDF(report.original_pdf);
      console.log('[ReportDetail] Resultat analyse:', result);
      
      if (result.success && result.data) {
        const extraction = result.data;
        
        // Extraire prenom et nom du patient
        const nameParts = (extraction.detected_patient_name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        console.log('[ReportDetail] Mise a jour des champs...');
        console.log('  Patient:', firstName, lastName);
        console.log('  Assurance:', extraction.detected_insurance);
        console.log('  Osteo:', extraction.detected_osteo_name);
        
        // Mettre a jour le rapport
        setReport((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            patient_firstname: firstName || prev.patient_firstname,
            patient_lastname: lastName || prev.patient_lastname,
            insurance_name: extraction.detected_insurance || prev.insurance_name,
            reference_number: extraction.detected_reference || prev.reference_number,
          };
        });
        
        // Trouver et selectionner l'osteo
        if (extraction.detected_osteo_name) {
          const osteoId = await findOsteoByName(extraction.detected_osteo_name);
          if (osteoId) {
            console.log('[ReportDetail] Osteo trouve, ID:', osteoId);
            setSelectedOsteo(osteoId);
          }
        }
        
        // Afficher le resultat
        const msg = [
          'Analyse terminee!',
          '',
          'Patient: ' + (extraction.detected_patient_name || 'Non detecte'),
          'Naissance: ' + (extraction.detected_patient_birthdate || 'Non detectee'),
          'Assurance: ' + (extraction.detected_insurance || 'Non detectee'),
          'Reference: ' + (extraction.detected_reference || 'Non detectee'),
          'Osteopathe: ' + (extraction.detected_osteo_name || 'Non detecte'),
        ].join('\n');
        
        alert(msg);
      } else { 
        alert('Erreur: ' + (result.error || 'Aucune info extraite')); 
      }
    } catch (e: any) { 
      console.error('[ReportDetail] Erreur analyse:', e);
      alert('Erreur: ' + e.message); 
    } finally { 
      setAnalyzing(false); 
    }
  };

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await query("UPDATE insurance_reports SET patient_firstname=?, patient_lastname=?, insurance_name=?, reference_number=? WHERE id=?",
        [report.patient_firstname, report.patient_lastname, report.insurance_name, report.reference_number, report.id]);
      
      if (selectedOsteo && selectedOsteo !== report.assigned_osteo_id) {
        await assignToOsteo(report.id, selectedOsteo as number, parseInt(user.id));
      }
      alert('Enregistre!');
      navigate('/insurance-reports');
    } catch (e: any) { 
      alert('Erreur: ' + e.message); 
    } finally { 
      setSaving(false); 
    }
  };

  if (loading) {
    return (
      <div className="report-detail-page loading">
        <Loader2 size={40} className="spin" />
        <p>Chargement...</p>
      </div>
    );
  }
  
  if (!report) {
    return (
      <div className="report-detail-page error">
        <p>Rapport non trouve</p>
        <button onClick={() => navigate('/insurance-reports')}>Retour</button>
      </div>
    );
  }

  const statusLabel = report.status === 'pending_assignment' ? 'A attribuer' : report.status;

  return (
    <div className="report-detail-page">
      <header className="detail-header">
        <button className="btn-back" onClick={() => navigate('/insurance-reports')}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-info">
          <h1>
            <FileText size={24} />
            {report.original_filename}
          </h1>
          <span className={'status-badge ' + report.status}>{statusLabel}</span>
        </div>
        <div className="header-actions">
          <button className="btn-analyze" onClick={handleReanalyze} disabled={analyzing}>
            {analyzing ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
            {analyzing ? 'Analyse...' : 'Re-analyser IA'}
          </button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
            Enregistrer
          </button>
        </div>
      </header>
      
      <div className="detail-content">
        <aside className="info-panel">
          <section className="info-section">
            <h3><User size={18} /> Patient</h3>
            <div className="info-field">
              <label>Prenom</label>
              <input 
                type="text" 
                value={report.patient_firstname || ''} 
                onChange={e => setReport((p: any) => ({...p, patient_firstname: e.target.value}))} 
              />
            </div>
            <div className="info-field">
              <label>Nom</label>
              <input 
                type="text" 
                value={report.patient_lastname || ''} 
                onChange={e => setReport((p: any) => ({...p, patient_lastname: e.target.value}))} 
              />
            </div>
          </section>
          
          <section className="info-section">
            <h3><Building2 size={18} /> Assurance</h3>
            <div className="info-field">
              <label>Nom</label>
              <input 
                type="text" 
                value={report.insurance_name || ''} 
                onChange={e => setReport((p: any) => ({...p, insurance_name: e.target.value}))} 
              />
            </div>
            <div className="info-field">
              <label>Reference</label>
              <input 
                type="text" 
                value={report.reference_number || ''} 
                onChange={e => setReport((p: any) => ({...p, reference_number: e.target.value}))} 
              />
            </div>
          </section>
          
          <section className="info-section">
            <h3><UserCheck size={18} /> Attribution</h3>
            <div className="info-field">
              <label>Osteopathe</label>
              <select 
                value={selectedOsteo} 
                onChange={e => setSelectedOsteo(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">-- Selectionner --</option>
                {osteoList.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </section>
        </aside>
        
        <main className="pdf-viewer">
          {pdfUrl ? (
            <iframe src={pdfUrl} title="PDF" width="100%" height="100%" />
          ) : (
            <div className="no-pdf">
              <FileText size={60} />
              <p>PDF non disponible</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default InsuranceReportDetail;
