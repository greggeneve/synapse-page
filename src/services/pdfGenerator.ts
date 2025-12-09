import jsPDF from 'jspdf';
import type { Report } from '../types';
import type { ReportTeamMember } from './teamReportService';
import { getReportTeam } from './teamReportService';
import { getReportSettings, type ReportSettings } from './reportSettingsService';

// Couleurs
const COLORS = {
  primary: [0, 82, 147] as [number, number, number],       // Bleu POGE
  red: [220, 38, 38] as [number, number, number],          // Rouge pour À REMPLIR
  text: [0, 0, 0] as [number, number, number],             // Noir
  gray: [100, 100, 100] as [number, number, number],       // Gris
};

interface PDFOptions {
  report: Report;
  logoBase64?: string;
}

// Convertir une image URL en base64
export async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible de créer le contexte canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Génère un rapport PDF au format A4 professionnel POGE
 * Avec liens cliquables (email, téléphone, site web, logo)
 */
export async function generateReportPDF(options: PDFOptions): Promise<Blob> {
  const { report, logoBase64 } = options;

  // Récupérer l'équipe triée et les paramètres
  const team = await getReportTeam();
  const settings = await getReportSettings();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  
  // Marges
  const marginLeft = 10;
  const marginRight = 15;
  const marginTop = 15;
  const sidebarWidth = 45; // Largeur colonne gauche pour les praticiens
  const contentStartX = marginLeft + sidebarWidth + 5;
  const contentWidth = pageWidth - contentStartX - marginRight;
  const footerY = pageHeight - 15;

  let currentPage = 1;
  const totalPagesEstimated = 2; // Toujours au moins 2 pages (recto/verso)
  
  // Nombre de praticiens max sur la page 1
  // Limité à 9 pour ne pas empiéter sur le pied de page
  const MAX_PRACTITIONERS_PAGE_1 = 9;
  const page1Team = team.slice(0, MAX_PRACTITIONERS_PAGE_1);
  const page2Team = team.slice(MAX_PRACTITIONERS_PAGE_1);

  // === FONCTION POUR DESSINER LE LOGO ET SLOGAN ===
  const drawLogoAndSlogan = (yStart: number): number => {
    let yPos = yStart;

    // Logo (cliquable vers le site web)
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', marginLeft, yPos, 35, 35);
        // Ajouter un lien cliquable sur le logo
        if (settings.footer_website_link) {
          doc.link(marginLeft, yPos, 35, 35, { url: settings.footer_website_link });
        }
      } catch (e) {
        console.warn('Impossible d\'ajouter le logo:', e);
      }
    }

    // Slogan sous le logo (depuis les paramètres)
    yPos += 38;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.primary);
    doc.text(settings.slogan_line1 || 'Pour toute urgence, un', marginLeft, yPos);
    doc.text(settings.slogan_line2 || 'rdv vous est proposé', marginLeft, yPos + 2.5);
    doc.text(settings.slogan_line3 || 'dans la journée.', marginLeft, yPos + 5);

    return yPos + 12;
  };

  // === FONCTION POUR DESSINER UN MEMBRE DE L'ÉQUIPE ===
  const drawTeamMember = (member: ReportTeamMember, yPos: number): number => {
    // Nom en gras
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.text);
    doc.text(`${member.prenom} ${member.nom}`, marginLeft, yPos);
    yPos += 3.5;

    // Titres (peut être multi-lignes séparées par \n)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const titleLines = member.displayTitle.split('\n');
    for (const titleLine of titleLines) {
      doc.text(titleLine, marginLeft, yPos);
      yPos += 2.8;
    }

    // Certifications (sans virgule)
    doc.setFontSize(7);
    for (const cert of member.certifications) {
      doc.text(cert, marginLeft + 2, yPos);
      yPos += 2.5;
    }

    // RME RCC
    if (member.rme_rcc) {
      doc.text(member.rme_rcc, marginLeft + 2, yPos);
      yPos += 2.5;
    }

    return yPos + 3; // Espacement entre praticiens
  };

  // === FONCTION POUR DESSINER L'EN-TÊTE PAGE 1 ===
  const drawHeaderPage1 = () => {
    let yPos = drawLogoAndSlogan(marginTop);

    // Liste des praticiens (page 1 : max 5 premiers)
    for (const member of page1Team) {
      yPos = drawTeamMember(member, yPos);
    }

    // Date en haut à droite
    const today = new Date().toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.text);
    doc.text(`Genève, le ${today}`, pageWidth - marginRight, marginTop + 10, { align: 'right' });

    return yPos;
  };

  // === FONCTION POUR DESSINER L'EN-TÊTE PAGE 2 (VERSO) ===
  const drawHeaderPage2 = () => {
    let yPos = drawLogoAndSlogan(marginTop);

    // Liste des praticiens (page 2 : suite)
    for (const member of page2Team) {
      yPos = drawTeamMember(member, yPos);
    }

    return yPos;
  };

  // === FONCTION POUR DESSINER LE PIED DE PAGE (avec mise en forme personnalisée) ===
  const drawFooter = () => {
    const fontSize = parseInt(settings.footer_font_size || '7', 10);
    const lineSpacing = parseFloat(settings.footer_line_spacing || '1.2');
    const alignment = (settings.footer_alignment || 'left') as 'left' | 'center' | 'right';
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    
    // Fonction pour remplacer les variables et dessiner avec liens
    const drawFormattedLine = (template: string, yPosition: number) => {
      // Remplacer les variables par leurs valeurs
      let line = template
        .replace('{address}', settings.footer_address || '')
        .replace('{city}', settings.footer_city || '')
        .replace('{phone}', settings.footer_phone || '')
        .replace('{fax}', settings.footer_fax || '')
        .replace('{email}', settings.footer_email || '')
        .replace('{website}', settings.footer_website || '')
        .replace('{page}', `${currentPage}`);
      
      // Calculer la position X selon l'alignement
      let xPos: number;
      const textWidth = doc.getTextWidth(line);
      const contentWidth = pageWidth - marginLeft - marginRight;
      
      switch (alignment) {
        case 'center':
          xPos = marginLeft + (contentWidth - textWidth) / 2;
          break;
        case 'right':
          xPos = pageWidth - marginRight - textWidth;
          break;
        default:
          xPos = marginLeft;
      }
      
      // Dessiner le texte avec les liens cliquables
      doc.setTextColor(...COLORS.gray);
      
      // Parser la ligne pour trouver les éléments cliquables
      let currentX = xPos;
      let remainingText = line;
      
      // Chercher et remplacer les valeurs cliquables
      const clickables = [
        { value: settings.footer_phone, link: settings.footer_phone_link },
        { value: settings.footer_email, link: settings.footer_email_link },
        { value: settings.footer_website, link: settings.footer_website_link },
      ].filter(c => c.value && c.link);
      
      // Dessiner le texte segment par segment
      for (const clickable of clickables) {
        const idx = remainingText.indexOf(clickable.value);
        if (idx >= 0) {
          // Texte avant le lien
          if (idx > 0) {
            const beforeText = remainingText.substring(0, idx);
            doc.setTextColor(...COLORS.gray);
            doc.text(beforeText, currentX, yPosition);
            currentX += doc.getTextWidth(beforeText);
          }
          
          // Le lien cliquable
          doc.setTextColor(...COLORS.primary);
          doc.text(clickable.value, currentX, yPosition);
          doc.link(currentX, yPosition - 2, doc.getTextWidth(clickable.value), 4, { url: clickable.link });
          currentX += doc.getTextWidth(clickable.value);
          
          remainingText = remainingText.substring(idx + clickable.value.length);
        }
      }
      
      // Texte restant
      if (remainingText) {
        doc.setTextColor(...COLORS.gray);
        doc.text(remainingText, currentX, yPosition);
      }
    };
    
    // Dessiner les lignes selon le format configuré
    const line1Format = settings.footer_format_line1 || '{address} - {city}    Tél : {phone}';
    const line2Format = settings.footer_format_line2 || 'E-mail : {email}    Site : {website}    Page {page}';
    
    const lineHeight = fontSize * lineSpacing * 0.4; // Convertir en mm
    
    drawFormattedLine(line1Format, footerY);
    drawFormattedLine(line2Format, footerY + lineHeight);
  };

  // === FONCTION POUR NOUVELLE PAGE ===
  const addNewPage = () => {
    drawFooter();
    doc.addPage();
    currentPage++;
    return marginTop + 10; // Retourner la position Y de départ
  };

  // === DESSINER LA PREMIÈRE PAGE (RECTO) ===
  let sidebarEndY = drawHeaderPage1();
  
  // Position Y pour le contenu (aligné avec la date)
  let yPos = marginTop + 25;

  // Bloc d'adresse destinataire selon norme DIN 5008:2020
  // - Distance bord supérieur → début zone d'adresse : 4,5 cm (45mm)
  // - Largeur zone : 8,5-9 cm (85-90mm)
  // - Hauteur zone : 4,5 cm (45mm, 9 lignes max)
  // - Aligné à droite pour courrier professionnel
  const addressBlockTop = 45; // 4,5 cm du haut de la page
  const addressBlockRight = pageWidth - marginRight; // Aligné à droite
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  
  // Positionner le destinataire à 4,5 cm du haut, aligné à droite
  const destinataireText = report.destinataire || 'A qui de droit';
  doc.text(destinataireText, addressBlockRight, addressBlockTop, { align: 'right' });
  
  // Continuer après le bloc d'adresse (4,5 cm + 4,5 cm de hauteur = 9 cm du haut)
  yPos = addressBlockTop + 45; // Fin du bloc d'adresse à 9 cm du haut

  // Objet - "Concerne [Patient] née le [date]"
  doc.text('Concerne ', contentStartX, yPos);
  const concerneWidth = doc.getTextWidth('Concerne ');
  
  if (report.patientName) {
    doc.setTextColor(...COLORS.primary);
    doc.text(report.patientName, contentStartX + concerneWidth, yPos);
    const nameWidth = doc.getTextWidth(report.patientName);
    doc.setTextColor(...COLORS.text);
    doc.text(' né(e) le ', contentStartX + concerneWidth + nameWidth, yPos);
    
    if (report.patientBirthDate) {
      const birthDate = new Date(report.patientBirthDate);
      const formattedBirth = birthDate.toLocaleDateString('fr-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      doc.text(formattedBirth, contentStartX + concerneWidth + nameWidth + doc.getTextWidth(' né(e) le '), yPos);
    } else {
      doc.setTextColor(...COLORS.red);
      doc.text('À REMPLIR', contentStartX + concerneWidth + nameWidth + doc.getTextWidth(' né(e) le '), yPos);
      doc.setTextColor(...COLORS.text);
    }
  } else {
    doc.setTextColor(...COLORS.red);
    doc.text('[Patient]', contentStartX + concerneWidth, yPos);
    doc.setTextColor(...COLORS.text);
    doc.text(' né(e) le ', contentStartX + concerneWidth + doc.getTextWidth('[Patient]'), yPos);
    doc.setTextColor(...COLORS.red);
    doc.text('À REMPLIR', contentStartX + concerneWidth + doc.getTextWidth('[Patient]') + doc.getTextWidth(' né(e) le '), yPos);
  }
  yPos += 10;

  // Introduction formelle
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  if (report.introduction) {
    const introLines = doc.splitTextToSize(report.introduction, contentWidth);
    doc.text(introLines, contentStartX, yPos);
    yPos += introLines.length * 4.5 + 5;
  } else {
    doc.text('Madame, Monsieur,', contentStartX, yPos);
    yPos += 10;
  }

  // === CONTENU DU RAPPORT ===
  const content = report.correctedContent || report.content;
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Vérifier si on a besoin d'une nouvelle page
    if (yPos > footerY - 20) {
      yPos = addNewPage();
    }
    
    // Titre de consultation/section en gras avec ligne
    if (trimmedLine.match(/^Consultation\s+\d{2}[\.\/]\d{2}[\.\/]\d{4}/i) ||
        trimmedLine.match(/^(#{1,3}\s*)?[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-Za-zàâäéèêëïîôùûüç\s&\-]*\s+\d{2}[\.\/]\d{2}[\.\/]\d{4}$/)) {
      yPos += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.text);
      doc.text(trimmedLine.replace(/^#+\s*/, ''), contentStartX, yPos);
      yPos += 1.5;
      
      // Ligne sous le titre
      doc.setDrawColor(...COLORS.text);
      doc.setLineWidth(0.5);
      doc.line(contentStartX, yPos, pageWidth - marginRight, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }
    // Sous-titre en italique (Motif de consultation, Anamnèse, etc.)
    else if (trimmedLine.match(/^(Motif de consultation|Anamnèse|Examen clinique|Interprétation clinique|Traitement ostéopathique|Plan et recommandations|Diagnostic|Conclusions?|Évolution)$/i) ||
             trimmedLine.match(/^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][a-zàâäéèêëïîôùûüç\s]+$/)) {
      yPos += 3;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.text);
      doc.text(trimmedLine, contentStartX, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
    }
    // Titre markdown ## ou ###
    else if (trimmedLine.startsWith('## ') || trimmedLine.startsWith('### ')) {
      yPos += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.text);
      doc.text(trimmedLine.replace(/^#+\s*/, ''), contentStartX, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
    }
    // Liste à puces
    else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('• ') || trimmedLine.startsWith('* ')) {
      const bulletText = trimmedLine.replace(/^[-•*]\s*/, '');
      const bulletLines = doc.splitTextToSize(`• ${bulletText}`, contentWidth - 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(bulletLines, contentStartX + 2, yPos);
      yPos += bulletLines.length * 4.5;
    }
    // Ligne vide
    else if (trimmedLine === '') {
      yPos += 3;
    }
    // Texte en gras **texte**
    else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(trimmedLine.replace(/\*\*/g, ''), contentStartX, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 5;
    }
    // Texte normal
    else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const textLines = doc.splitTextToSize(trimmedLine, contentWidth);
      
      // Vérifier si le texte tient sur la page
      if (yPos + (textLines.length * 4.5) > footerY - 10) {
        yPos = addNewPage();
      }
      
      doc.text(textLines, contentStartX, yPos);
      yPos += textLines.length * 4.5;
    }
  }

  // === SIGNATURE ===
  yPos += 10;
  
  if (yPos > footerY - 25) {
    yPos = addNewPage();
  }
  
  // Utiliser les lignes de signature personnalisées si disponibles
  if (report.signatureLines && report.signatureLines.length > 0) {
    for (let i = 0; i < report.signatureLines.length; i++) {
      const line = report.signatureLines[i];
      
      // Première ligne (nom) en gras
      if (i === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.text);
      } else if (line.includes('@')) {
        // Email en couleur primaire et cliquable
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.primary);
        doc.text(line, contentStartX, yPos);
        doc.link(contentStartX, yPos - 2, doc.getTextWidth(line), 4, { url: `mailto:${line}` });
        yPos += 3.5;
        continue;
      } else if (line.includes('RME')) {
        // RME en plus petit
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.text);
      }
      
      doc.text(line, contentStartX, yPos);
      yPos += i === 0 ? 4 : 3.5;
    }
  } else {
    // Signature par défaut
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.text);
    doc.text(report.authorName || '', contentStartX, yPos);
    yPos += 4;
    
    const author = team.find(m => 
      `${m.prenom} ${m.nom}`.toLowerCase() === (report.authorName || '').toLowerCase()
    );
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    if (author) {
      doc.text(`Ostéopathe, ${author.displayTitle}`, contentStartX, yPos);
      yPos += 3.5;
    }
    
    // Email de l'auteur (cliquable)
    const authorEmail = report.authorEmail || 
      (report.authorName ? `${report.authorName.toLowerCase().replace(' ', '.')}@poge.ch` : '');
    if (authorEmail) {
      doc.setTextColor(...COLORS.primary);
      const emailText = authorEmail.toLowerCase();
      doc.text(emailText, contentStartX, yPos);
      doc.link(contentStartX, yPos - 2, doc.getTextWidth(emailText), 4, { url: `mailto:${emailText}` });
      yPos += 3.5;
    }
  }
  
  // Site web retiré de la signature (disponible dans le pied de page)

  // Dessiner le pied de page de la page 1
  drawFooter();

  // === PAGE 2 (VERSO) - Toujours présente ===
  doc.addPage();
  currentPage = 2;
  
  // Dessiner l'en-tête de la page 2 avec les praticiens restants
  const page2HeaderEndY = drawHeaderPage2();
  
  // Zone de contenu page 2 (pour suite du rapport si nécessaire ou info équipe)
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  
  const teamInfoY = Math.max(page2HeaderEndY + 20, pageHeight / 3);
  const teamInfoText = page2Team.length > 0 
    ? `Notre équipe (suite) - ${team.length} praticiens au total`
    : `Notre équipe - ${team.length} praticiens au total`;
  
  doc.text(teamInfoText, contentStartX, teamInfoY);
  
  // Dessiner le pied de page de la page 2
  drawFooter();

  // Mettre à jour le nombre total de pages sur chaque page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    // Effacer l'ancien numéro et réécrire avec le total
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - marginRight - 20, footerY - 1, 25, 6, 'F');
    doc.text(`Page ${i}/${totalPages}`, pageWidth - marginRight, footerY + 3, { align: 'right' });
  }

  return doc.output('blob');
}

/**
 * Télécharge le PDF
 */
export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
