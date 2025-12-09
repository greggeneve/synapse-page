/**
 * Composant de sélection et gestion des signatures personnalisées
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  PenLine, 
  Plus, 
  Check, 
  Trash2, 
  Edit3,
  Star,
  X,
  Save
} from 'lucide-react';
import type { Signature } from '../services/signatureService';
import { 
  getEmployeeSignatures, 
  getDefaultSignature,
  saveSignature, 
  deleteSignature,
  formatSignatureForPDF
} from '../services/signatureService';
import './SignatureSelector.css';

interface SignatureSelectorProps {
  employeeId: number;
  employeeName: string;
  employeeEmail?: string;
  rmeRcc?: string;
  selectedSignatureId?: number;
  onSignatureChange: (signatureId: number, signatureLines: string[]) => void;
}

export function SignatureSelector({
  employeeId,
  employeeName,
  employeeEmail,
  rmeRcc,
  selectedSignatureId,
  onSignatureChange
}: SignatureSelectorProps) {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSignature, setSelectedSignature] = useState<Signature | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSignature, setEditingSignature] = useState<Partial<Signature> | null>(null);
  const [showManager, setShowManager] = useState(false);

  // Charger les signatures
  const loadSignatures = useCallback(async () => {
    console.log('SignatureSelector: loadSignatures pour employeeId =', employeeId, typeof employeeId);
    setIsLoading(true);
    try {
      const sigs = await getEmployeeSignatures(employeeId);
      console.log('Signatures chargées:', sigs);
      setSignatures(sigs);
      
      // Sélectionner la signature par défaut ou celle déjà sélectionnée
      if (selectedSignatureId) {
        const selected = sigs.find(s => s.id === selectedSignatureId);
        if (selected) {
          setSelectedSignature(selected);
          return;
        }
      }
      
      // Sinon, prendre la signature par défaut
      const defaultSig = await getDefaultSignature(employeeId);
      if (defaultSig) {
        setSelectedSignature(defaultSig);
        // Notifier le parent
        const lines = formatSignatureForPDF(defaultSig, employeeName, employeeEmail, rmeRcc);
        onSignatureChange(defaultSig.id, lines);
        
        // Recharger la liste au cas où une signature par défaut a été créée
        const updatedSigs = await getEmployeeSignatures(employeeId);
        setSignatures(updatedSigs);
      }
    } catch (error) {
      console.error('Erreur chargement signatures:', error);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, employeeName, employeeEmail, rmeRcc, selectedSignatureId, onSignatureChange]);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  // Sélectionner une signature
  const handleSelectSignature = (signature: Signature) => {
    setSelectedSignature(signature);
    const lines = formatSignatureForPDF(signature, employeeName, employeeEmail, rmeRcc);
    onSignatureChange(signature.id, lines);
  };

  // Ouvrir l'éditeur pour une nouvelle signature
  const handleNewSignature = () => {
    setEditingSignature({
      employee_id: employeeId,
      name: '',
      title_line1: '',
      title_line2: '',
      title_line3: '',
      certifications: '',
      show_rme: true,
      show_email: true,
      show_phone: false,
      is_default: false
    });
    setIsEditing(true);
  };

  // Ouvrir l'éditeur pour modifier une signature existante
  const handleEditSignature = (signature: Signature) => {
    setEditingSignature({ ...signature });
    setIsEditing(true);
  };

  // Sauvegarder la signature
  const handleSaveSignature = async () => {
    console.log('handleSaveSignature appelé', editingSignature);
    
    if (!editingSignature || !editingSignature.name?.trim() || !editingSignature.title_line1?.trim()) {
      alert('Le nom et le titre principal sont obligatoires');
      return;
    }

    try {
      console.log('Sauvegarde de la signature...', editingSignature);
      const saved = await saveSignature(editingSignature);
      console.log('Résultat sauvegarde:', saved);
      
      if (saved) {
        await loadSignatures();
        setIsEditing(false);
        setEditingSignature(null);
        
        // Si c'est la nouvelle signature par défaut, la sélectionner
        if (saved.is_default) {
          handleSelectSignature(saved);
        }
      } else {
        console.error('saveSignature a retourné null');
        alert('La sauvegarde a échoué. Vérifiez la console pour plus de détails.');
      }
    } catch (error) {
      console.error('Erreur sauvegarde signature:', error);
      alert('Erreur lors de la sauvegarde: ' + (error as Error).message);
    }
  };

  // Supprimer une signature
  const handleDeleteSignature = async (signatureId: number) => {
    if (!confirm('Supprimer cette signature ?')) return;
    
    try {
      await deleteSignature(signatureId);
      await loadSignatures();
      
      // Si c'était la signature sélectionnée, revenir à la par défaut
      if (selectedSignature?.id === signatureId) {
        const defaultSig = await getDefaultSignature(employeeId);
        if (defaultSig) {
          handleSelectSignature(defaultSig);
        }
      }
    } catch (error) {
      console.error('Erreur suppression signature:', error);
    }
  };

  // Prévisualisation de la signature
  const getSignaturePreview = (signature: Signature): string[] => {
    return formatSignatureForPDF(signature, employeeName, employeeEmail, rmeRcc);
  };

  if (isLoading) {
    return (
      <div className="signature-selector loading">
        <PenLine size={16} />
        <span>Chargement des signatures...</span>
      </div>
    );
  }

  return (
    <div className="signature-selector">
      <div className="signature-header">
        <h3><PenLine size={16} /> Signature</h3>
        <button 
          className="btn-manage"
          onClick={() => setShowManager(!showManager)}
          title="Gérer les signatures"
        >
          {showManager ? 'Fermer' : 'Gérer'}
        </button>
      </div>

      {/* Sélection rapide */}
      <div className="signature-quick-select">
        {signatures.map(sig => (
          <div key={sig.id} className="signature-chip-wrapper">
            <button
              className={`signature-chip ${selectedSignature?.id === sig.id ? 'selected' : ''}`}
              onClick={() => handleSelectSignature(sig)}
              title={`Sélectionner: ${sig.name}`}
            >
              {sig.is_default && <Star size={12} className="default-star" />}
              {sig.name}
              {selectedSignature?.id === sig.id && <Check size={14} />}
            </button>
            <button
              className="signature-edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleEditSignature(sig);
              }}
              title={`Modifier: ${sig.name}`}
            >
              <Edit3 size={12} />
            </button>
          </div>
        ))}
        <button 
          className="signature-chip add-new"
          onClick={handleNewSignature}
          title="Nouvelle signature"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Aperçu de la signature sélectionnée */}
      {selectedSignature && (
        <div className="signature-preview">
          {getSignaturePreview(selectedSignature).map((line, i) => (
            <div key={i} className={`preview-line ${i === 0 ? 'name' : ''}`}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Gestionnaire de signatures */}
      {showManager && (
        <div className="signature-manager">
          <div className="manager-header">
            <h4>Mes signatures</h4>
            <button className="btn-add" onClick={handleNewSignature}>
              <Plus size={14} /> Nouvelle
            </button>
          </div>

          <div className="signatures-list">
            {signatures.map(sig => (
              <div key={sig.id} className="signature-item">
                <div className="signature-info">
                  <div className="signature-name">
                    {sig.is_default && <Star size={12} className="default-star" />}
                    {sig.name}
                  </div>
                  <div className="signature-titles">
                    {sig.title_line1}
                    {sig.title_line2 && ` • ${sig.title_line2}`}
                  </div>
                </div>
                <div className="signature-actions">
                  <button 
                    className="btn-icon"
                    onClick={() => handleEditSignature(sig)}
                    title="Modifier"
                  >
                    <Edit3 size={14} />
                  </button>
                  {!sig.is_default && (
                    <button 
                      className="btn-icon danger"
                      onClick={() => handleDeleteSignature(sig.id)}
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal d'édition */}
      {isEditing && editingSignature && (
        <div className="signature-editor-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h4>{editingSignature.id ? 'Modifier la signature' : 'Nouvelle signature'}</h4>
              <button className="btn-close" onClick={() => setIsEditing(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-field">
                <label>Nom de la signature *</label>
                <input
                  type="text"
                  value={editingSignature.name || ''}
                  onChange={(e) => setEditingSignature(prev => ({ ...prev!, name: e.target.value }))}
                  placeholder="Ex: Directeur, Ostéopathe..."
                />
              </div>

              <div className="form-field">
                <label>Titre principal *</label>
                <input
                  type="text"
                  value={editingSignature.title_line1 || ''}
                  onChange={(e) => setEditingSignature(prev => ({ ...prev!, title_line1: e.target.value }))}
                  placeholder="Ex: Directeur"
                />
              </div>

              <div className="form-field">
                <label>Titre secondaire (optionnel)</label>
                <input
                  type="text"
                  value={editingSignature.title_line2 || ''}
                  onChange={(e) => setEditingSignature(prev => ({ ...prev!, title_line2: e.target.value }))}
                  placeholder="Ex: Responsable de Clinique"
                />
              </div>

              <div className="form-field">
                <label>Titre tertiaire (optionnel)</label>
                <input
                  type="text"
                  value={editingSignature.title_line3 || ''}
                  onChange={(e) => setEditingSignature(prev => ({ ...prev!, title_line3: e.target.value }))}
                  placeholder="Ex: Chef de projet"
                />
              </div>

              <div className="form-field">
                <label>Certifications (séparées par des virgules)</label>
                <input
                  type="text"
                  value={editingSignature.certifications || ''}
                  onChange={(e) => setEditingSignature(prev => ({ ...prev!, certifications: e.target.value }))}
                  placeholder="Ex: Certifié C.D.S, Membre OstéoSwiss"
                />
              </div>

              <div className="form-checkboxes">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingSignature.show_rme ?? true}
                    onChange={(e) => setEditingSignature(prev => ({ ...prev!, show_rme: e.target.checked }))}
                  />
                  Afficher numéro RME
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingSignature.show_email ?? true}
                    onChange={(e) => setEditingSignature(prev => ({ ...prev!, show_email: e.target.checked }))}
                  />
                  Afficher email
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingSignature.is_default ?? false}
                    onChange={(e) => setEditingSignature(prev => ({ ...prev!, is_default: e.target.checked }))}
                  />
                  Signature par défaut
                </label>
              </div>

              {/* Aperçu en temps réel */}
              <div className="editor-preview">
                <label>Aperçu :</label>
                <div className="preview-box">
                  <div className="preview-line name">{employeeName}</div>
                  {editingSignature.title_line1 && (
                    <div className="preview-line">{editingSignature.title_line1}</div>
                  )}
                  {editingSignature.title_line2 && (
                    <div className="preview-line">{editingSignature.title_line2}</div>
                  )}
                  {editingSignature.title_line3 && (
                    <div className="preview-line">{editingSignature.title_line3}</div>
                  )}
                  {editingSignature.certifications && editingSignature.certifications.split(',').map((cert, i) => (
                    <div key={i} className="preview-line cert">{cert.trim()}</div>
                  ))}
                  {editingSignature.show_rme && rmeRcc && (
                    <div className="preview-line rme">RME RCC {rmeRcc}</div>
                  )}
                  {editingSignature.show_email && employeeEmail && (
                    <div className="preview-line email">{employeeEmail}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setIsEditing(false)}>
                Annuler
              </button>
              <button className="btn-save" onClick={handleSaveSignature}>
                <Save size={16} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

