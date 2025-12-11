/**
 * Composant pour annoter un PDF
 * Permet de cliquer sur le PDF et d'ajouter du texte
 */

import { useState, useRef, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Type, Save, Trash2, RotateCcw } from 'lucide-react';
import './PdfAnnotator.css';

interface Annotation {
  id: string;
  x: number; // Position en % de la largeur
  y: number; // Position en % de la hauteur
  text: string;
  page: number;
  fontSize: number;
}

interface PdfAnnotatorProps {
  pdfBase64: string;
  onSave: (annotatedPdfBase64: string, annotations: Annotation[]) => void;
  existingAnnotations?: Annotation[];
}

export function PdfAnnotator({ pdfBase64, onSave, existingAnnotations = [] }: PdfAnnotatorProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>(existingAnnotations);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [saving, setSaving] = useState(false);
  const [fontSize, setFontSize] = useState(12);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Ajouter une nouvelle annotation au clic
  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingMode || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newAnnotation: Annotation = {
      id: `ann-${Date.now()}`,
      x,
      y,
      text: '',
      page: currentPage,
      fontSize
    };

    setAnnotations(prev => [...prev, newAnnotation]);
    setActiveAnnotation(newAnnotation.id);
    setIsAddingMode(false);
  }, [isAddingMode, currentPage, fontSize]);

  // Mettre à jour le texte d'une annotation
  const updateAnnotationText = useCallback((id: string, text: string) => {
    setAnnotations(prev => 
      prev.map(ann => ann.id === id ? { ...ann, text } : ann)
    );
  }, []);

  // Supprimer une annotation
  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    setActiveAnnotation(null);
  }, []);

  // Sauvegarder le PDF avec les annotations
  const handleSave = useCallback(async () => {
    if (annotations.length === 0) {
      alert('Aucune annotation à sauvegarder');
      return;
    }

    setSaving(true);
    try {
      // Décoder le PDF base64
      const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const pages = pdfDoc.getPages();
      setTotalPages(pages.length);

      // Ajouter chaque annotation au PDF
      for (const annotation of annotations) {
        if (!annotation.text.trim()) continue;
        
        const pageIndex = annotation.page - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) continue;
        
        const page = pages[pageIndex];
        const { width, height } = page.getSize();
        
        // Convertir les % en coordonnées PDF (origine en bas à gauche)
        const pdfX = (annotation.x / 100) * width;
        const pdfY = height - ((annotation.y / 100) * height);

        page.drawText(annotation.text, {
          x: pdfX,
          y: pdfY,
          size: annotation.fontSize,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }

      // Sauvegarder le PDF modifié
      const modifiedPdfBytes = await pdfDoc.save();
      const modifiedBase64 = btoa(
        String.fromCharCode(...new Uint8Array(modifiedPdfBytes))
      );

      onSave(modifiedBase64, annotations);
      alert('PDF sauvegardé avec succès !');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde du PDF');
    } finally {
      setSaving(false);
    }
  }, [annotations, pdfBase64, onSave]);

  // Réinitialiser toutes les annotations
  const resetAnnotations = useCallback(() => {
    if (confirm('Supprimer toutes les annotations ?')) {
      setAnnotations([]);
      setActiveAnnotation(null);
    }
  }, []);

  return (
    <div className="pdf-annotator">
      {/* Barre d'outils */}
      <div className="annotator-toolbar">
        <button 
          className={`tool-btn ${isAddingMode ? 'active' : ''}`}
          onClick={() => setIsAddingMode(!isAddingMode)}
          title="Ajouter du texte"
        >
          <Type size={18} />
          <span>Ajouter texte</span>
        </button>

        <div className="font-size-control">
          <label>Taille:</label>
          <select 
            value={fontSize} 
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            <option value={8}>8</option>
            <option value={10}>10</option>
            <option value={12}>12</option>
            <option value={14}>14</option>
            <option value={16}>16</option>
            <option value={18}>18</option>
            <option value={20}>20</option>
          </select>
        </div>

        <div className="toolbar-separator" />

        <button 
          className="tool-btn"
          onClick={resetAnnotations}
          title="Réinitialiser"
          disabled={annotations.length === 0}
        >
          <RotateCcw size={18} />
        </button>

        <button 
          className="tool-btn save-btn"
          onClick={handleSave}
          disabled={saving || annotations.length === 0}
          title="Sauvegarder le PDF"
        >
          <Save size={18} />
          <span>{saving ? 'Sauvegarde...' : 'Sauvegarder'}</span>
        </button>

        <div className="annotation-count">
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Mode d'ajout actif */}
      {isAddingMode && (
        <div className="adding-mode-hint">
          👆 Cliquez sur le PDF pour ajouter du texte
        </div>
      )}

      {/* Conteneur PDF avec annotations */}
      <div 
        ref={containerRef}
        className={`pdf-container ${isAddingMode ? 'adding-mode' : ''}`}
        onClick={handleContainerClick}
      >
        {/* PDF affiché en iframe */}
        <iframe
          ref={iframeRef}
          src={`data:application/pdf;base64,${pdfBase64}`}
          title="PDF à annoter"
          className="pdf-iframe"
        />

        {/* Couche d'annotations */}
        <div className="annotations-layer">
          {annotations
            .filter(ann => ann.page === currentPage)
            .map(annotation => (
              <div
                key={annotation.id}
                className={`annotation ${activeAnnotation === annotation.id ? 'active' : ''}`}
                style={{
                  left: `${annotation.x}%`,
                  top: `${annotation.y}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveAnnotation(annotation.id);
                }}
              >
                <textarea
                  value={annotation.text}
                  onChange={(e) => updateAnnotationText(annotation.id, e.target.value)}
                  placeholder="Tapez ici..."
                  style={{ fontSize: `${annotation.fontSize}px` }}
                  autoFocus={activeAnnotation === annotation.id}
                />
                <button 
                  className="delete-annotation"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAnnotation(annotation.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

