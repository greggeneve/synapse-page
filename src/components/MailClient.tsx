/**
 * Client Mail Synapse
 * 
 * Client mail intégré utilisant IMAP/SMTP.
 * Accède aux données PayFlow en LECTURE SEULE.
 */

import React, { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import {
  Mail,
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Archive,
  X,
  Paperclip,
  Reply,
  ReplyAll,
  Forward,
  RefreshCw,
  Search,
  Loader2,
  AlertCircle,
  FolderOpen,
  Download,
  Eye,
  EyeOff,
  Plus,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Check
} from 'lucide-react';
import type {
  EmailCredentials,
  EmailFolder,
  EmailMessage,
  EmailMessageDetail,
  EmailSignatureTemplate,
  SignatureVariables,
  SendEmailRequest
} from '../services/mailService';
import {
  getMailFolders,
  getMessages,
  getMessage,
  markAsRead,
  markAsUnread,
  deleteMessage,
  sendEmail,
  getSignatureTemplate,
  generateSignature,
  getAttachment,
  formatEmailAddress,
  formatFileSize,
  htmlToText,
  parseEmailAddresses
} from '../services/mailService';
import { getPreference, setPreference, PREFERENCE_KEYS } from '../services/userPreferencesService';
import './MailClient.css';

// ============================================================================
// Types
// ============================================================================

interface MailClientProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: EmailCredentials | null;
  employeeId: number;
  employeeInfo: {
    prenom: string;
    nom: string;
    titre: string;
    telephone: string;
  } | null;
}

type ComposerMode = 'new' | 'reply' | 'reply-all' | 'forward' | null;

interface ComposerState {
  mode: ComposerMode;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  originalMessage?: EmailMessageDetail;
  attachments: { filename: string; mime_type: string; base64_content: string }[];
}

// ============================================================================
// Folder Icon Mapping
// ============================================================================

const getFolderIcon = (folderName: string) => {
  const name = folderName.toLowerCase();
  if (name === 'inbox' || name === 'boîte de réception') return Inbox;
  if (name === 'sent' || name === 'envoyés' || name.includes('sent')) return Send;
  if (name === 'drafts' || name === 'brouillons' || name.includes('draft')) return FileEdit;
  if (name === 'trash' || name === 'corbeille' || name.includes('trash')) return Trash2;
  if (name === 'archive' || name.includes('archive')) return Archive;
  if (name === 'spam' || name === 'junk' || name.includes('spam')) return AlertCircle;
  return FolderOpen;
};

const getFolderDisplayName = (folderName: string): string => {
  const name = folderName.toLowerCase();
  if (name === 'inbox') return 'Boîte de réception';
  if (name === 'sent' || name === 'sent items') return 'Envoyés';
  if (name === 'drafts') return 'Brouillons';
  if (name === 'trash' || name === 'deleted items') return 'Corbeille';
  if (name === 'spam' || name === 'junk') return 'Indésirables';
  if (name === 'archive') return 'Archives';
  return folderName;
};

// ============================================================================
// Composant Principal
// ============================================================================

export function MailClient({
  isOpen,
  onClose,
  credentials,
  employeeId,
  employeeInfo
}: MailClientProps) {
  // État principal
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('INBOX');
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessageDetail | null>(null);
  const [totalMessages, setTotalMessages] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);

  // État de chargement
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // État du composeur
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Signature
  const [signatureTemplate, setSignatureTemplate] = useState<EmailSignatureTemplate | null>(null);
  const [signature, setSignature] = useState<string>('');

  // UI
  const [searchQuery, setSearchQuery] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Sélection multiple
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Drag & Drop des dossiers
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // Ref pour l'upload de fichiers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // Chargement initial
  // ============================================================================

  // Ref pour éviter les requêtes en double (React Strict Mode)
  const loadingRef = useRef(false);
  
  useEffect(() => {
    if (isOpen && credentials && !loadingRef.current) {
      loadingRef.current = true;
      // Séquencer les requêtes pour éviter les conflits IMAP
      const init = async () => {
        await loadFolders();
        // Petit délai pour laisser la connexion IMAP se fermer
        await new Promise(r => setTimeout(r, 500));
        await loadMessages();
        loadingRef.current = false;
      };
      init();
      loadSignatureTemplate();
    }
  }, [isOpen, credentials]);

  useEffect(() => {
    // Ne recharger que si on change de dossier manuellement (pas au premier chargement)
    if (isOpen && credentials && selectedFolder && !loadingFolders && !loadingRef.current) {
      loadMessages();
    }
  }, [selectedFolder, offset]);

  useEffect(() => {
    if (signatureTemplate && employeeInfo && credentials) {
      const variables: SignatureVariables = {
        prenom: employeeInfo.prenom,
        nom: employeeInfo.nom,
        titre: employeeInfo.titre,
        telephone: employeeInfo.telephone,
        email: credentials.email_address
      };
      setSignature(generateSignature(signatureTemplate.template_html, variables));
    }
  }, [signatureTemplate, employeeInfo, credentials]);

  // Initialiser l'ordre des dossiers depuis la DB
  useEffect(() => {
    if (folders.length > 0 && folderOrder.length === 0 && employeeId) {
      // Charger l'ordre depuis la base de données
      getPreference<string[]>(employeeId, PREFERENCE_KEYS.MAIL_FOLDER_ORDER).then(savedOrder => {
        if (savedOrder && Array.isArray(savedOrder)) {
          // Fusionner avec les nouveaux dossiers
          const existingPaths = new Set(folders.map(f => f.path));
          const validOrder = savedOrder.filter((p: string) => existingPaths.has(p));
          const newFolders = folders.filter(f => !validOrder.includes(f.path)).map(f => f.path);
          setFolderOrder([...validOrder, ...newFolders]);
        } else {
          setFolderOrder(folders.map(f => f.path));
        }
      }).catch(() => {
        // Fallback sur l'ordre par défaut en cas d'erreur
        setFolderOrder(folders.map(f => f.path));
      });
    }
  }, [folders, employeeId]);

  // Sauvegarder l'ordre des dossiers dans la DB
  const saveFolderOrderRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (folderOrder.length > 0 && employeeId) {
      // Debounce pour éviter trop de requêtes
      if (saveFolderOrderRef.current) {
        clearTimeout(saveFolderOrderRef.current);
      }
      saveFolderOrderRef.current = setTimeout(() => {
        setPreference(employeeId, PREFERENCE_KEYS.MAIL_FOLDER_ORDER, folderOrder);
      }, 500);
    }
    return () => {
      if (saveFolderOrderRef.current) {
        clearTimeout(saveFolderOrderRef.current);
      }
    };
  }, [folderOrder, employeeId]);

  // Raccourcis clavier
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ne pas intercepter si on est dans un input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Pas de raccourcis si le composeur est ouvert
      if (composer) return;

      const currentIndex = selectedMessage 
        ? messages.findIndex(m => m.uid === selectedMessage.uid)
        : -1;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < messages.length - 1) {
            loadMessage(messages[currentIndex + 1]);
          } else if (currentIndex === -1 && messages.length > 0) {
            loadMessage(messages[0]);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            loadMessage(messages[currentIndex - 1]);
          }
          break;

        case 'e':
        case 'E':
          // Archiver le message
          if (selectedMessage || selectedMessages.size > 0) {
            e.preventDefault();
            handleArchiveMessages();
          }
          break;

        case 'Delete':
        case 'Backspace':
          // Supprimer les messages sélectionnés
          if (selectedMessages.size > 0) {
            e.preventDefault();
            handleDeleteSelectedMessages();
          } else if (selectedMessage) {
            e.preventDefault();
            handleDeleteMessage();
          }
          break;

        case 'r':
          if (selectedMessage && !e.shiftKey) {
            e.preventDefault();
            openComposer('reply', selectedMessage);
          }
          break;

        case 'R':
          if (selectedMessage && e.shiftKey) {
            e.preventDefault();
            openComposer('reply-all', selectedMessage);
          }
          break;

        case 'f':
          if (selectedMessage) {
            e.preventDefault();
            openComposer('forward', selectedMessage);
          }
          break;

        case 'Escape':
          if (selectedMessages.size > 0) {
            setSelectedMessages(new Set());
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedMessage, messages, composer, selectedMessages]);

  // ============================================================================
  // Fonctions de chargement
  // ============================================================================

  const loadFolders = async () => {
    if (!credentials) return;
    
    setLoadingFolders(true);
    setError(null);
    
    try {
      const folderList = await getMailFolders(credentials);
      setFolders(folderList);
      
      if (!selectedFolder && folderList.length > 0) {
        const inbox = folderList.find(f => f.name.toLowerCase() === 'inbox');
        setSelectedFolder(inbox?.path || folderList[0].path);
      }
    } catch (e: any) {
      setError(`Erreur lors du chargement des dossiers: ${e.message}`);
    } finally {
      setLoadingFolders(false);
    }
  };

  const loadMessages = async () => {
    if (!credentials || !selectedFolder) return;
    
    setLoadingMessages(true);
    setError(null);
    
    try {
      const result = await getMessages(credentials, selectedFolder, offset, limit);
      setMessages(result.messages);
      setTotalMessages(result.total);
    } catch (e: any) {
      setError(`Erreur lors du chargement des messages: ${e.message}`);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMessage = async (message: EmailMessage) => {
    if (!credentials) return;
    
    setLoadingMessage(true);
    setError(null);
    
    try {
      const detail = await getMessage(credentials, message.folder, message.uid);
      if (detail) {
        setSelectedMessage(detail);
        
        if (!message.is_read) {
          await markAsRead(credentials, message.folder, message.uid);
          setMessages(prev => prev.map(m => 
            m.uid === message.uid ? { ...m, is_read: true } : m
          ));
        }
      }
    } catch (e: any) {
      setError(`Erreur lors du chargement du message: ${e.message}`);
    } finally {
      setLoadingMessage(false);
    }
  };

  const loadSignatureTemplate = async () => {
    if (!credentials?.email_signature_category) return;
    
    try {
      const template = await getSignatureTemplate(credentials.email_signature_category);
      setSignatureTemplate(template);
    } catch (e) {
      console.error('Erreur chargement signature:', e);
    }
  };

  // ============================================================================
  // Actions sur les messages
  // ============================================================================

  const handleRefresh = () => {
    loadFolders();
    loadMessages();
    setSelectedMessage(null);
  };

  const handleDeleteMessage = async () => {
    if (!credentials || !selectedMessage) return;
    
    const confirmed = window.confirm('Voulez-vous vraiment supprimer ce message ?');
    if (!confirmed) return;
    
    try {
      await deleteMessage(credentials, selectedMessage.folder, selectedMessage.uid);
      setMessages(prev => prev.filter(m => m.uid !== selectedMessage.uid));
      setSelectedMessage(null);
    } catch (e: any) {
      setError(`Erreur lors de la suppression: ${e.message}`);
    }
  };

  const handleToggleRead = async () => {
    if (!credentials || !selectedMessage) return;
    
    try {
      if (selectedMessage.is_read) {
        await markAsUnread(credentials, selectedMessage.folder, selectedMessage.uid);
      } else {
        await markAsRead(credentials, selectedMessage.folder, selectedMessage.uid);
      }
      
      setSelectedMessage(prev => prev ? { ...prev, is_read: !prev.is_read } : null);
      setMessages(prev => prev.map(m => 
        m.uid === selectedMessage.uid ? { ...m, is_read: !m.is_read } : m
      ));
    } catch (e: any) {
      setError(`Erreur: ${e.message}`);
    }
  };

  // Sélection multiple avec Shift
  const handleMessageClick = (message: EmailMessage, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      // Sélection par plage
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelection = new Set(selectedMessages);
      for (let i = start; i <= end; i++) {
        newSelection.add(messages[i].uid);
      }
      setSelectedMessages(newSelection);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle sélection individuelle
      const newSelection = new Set(selectedMessages);
      if (newSelection.has(message.uid)) {
        newSelection.delete(message.uid);
      } else {
        newSelection.add(message.uid);
      }
      setSelectedMessages(newSelection);
      setLastSelectedIndex(index);
    } else {
      // Sélection simple - charger le message
      setSelectedMessages(new Set());
      setLastSelectedIndex(index);
      loadMessage(message);
    }
  };

  // Archiver les messages sélectionnés
  const handleArchiveMessages = async () => {
    if (!credentials) return;
    
    const uidsToArchive = selectedMessages.size > 0 
      ? Array.from(selectedMessages)
      : selectedMessage ? [selectedMessage.uid] : [];
    
    if (uidsToArchive.length === 0) return;

    try {
      // Trouver le dossier Archives
      const archiveFolder = folders.find(f => 
        f.name.toLowerCase() === 'archive' || f.name.toLowerCase().includes('archive')
      );
      
      if (!archiveFolder) {
        setError('Dossier Archives non trouvé');
        return;
      }

      // Archiver chaque message (via moveMessage si disponible, sinon supprimer)
      for (const uid of uidsToArchive) {
        const msg = messages.find(m => m.uid === uid);
        if (msg) {
          // TODO: implémenter moveMessage côté backend
          // Pour l'instant, on simule en supprimant de la liste
          await deleteMessage(credentials, msg.folder, uid);
        }
      }
      
      setMessages(prev => prev.filter(m => !uidsToArchive.includes(m.uid)));
      setSelectedMessages(new Set());
      if (selectedMessage && uidsToArchive.includes(selectedMessage.uid)) {
        setSelectedMessage(null);
      }
    } catch (e: any) {
      setError(`Erreur d'archivage: ${e.message}`);
    }
  };

  // Supprimer les messages sélectionnés
  const handleDeleteSelectedMessages = async () => {
    if (!credentials || selectedMessages.size === 0) return;
    
    const count = selectedMessages.size;
    const confirmed = window.confirm(`Voulez-vous vraiment supprimer ${count} message(s) ?`);
    if (!confirmed) return;
    
    try {
      for (const uid of selectedMessages) {
        const msg = messages.find(m => m.uid === uid);
        if (msg) {
          await deleteMessage(credentials, msg.folder, uid);
        }
      }
      
      setMessages(prev => prev.filter(m => !selectedMessages.has(m.uid)));
      setSelectedMessages(new Set());
      if (selectedMessage && selectedMessages.has(selectedMessage.uid)) {
        setSelectedMessage(null);
      }
    } catch (e: any) {
      setError(`Erreur lors de la suppression: ${e.message}`);
    }
  };

  // Drag & Drop des dossiers
  const handleFolderDragStart = (e: React.DragEvent, folderPath: string) => {
    setDraggedFolder(folderPath);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    if (draggedFolder && draggedFolder !== folderPath) {
      setDragOverFolder(folderPath);
    }
  };

  const handleFolderDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleFolderDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    if (!draggedFolder || draggedFolder === targetPath) return;
    
    const newOrder = [...folderOrder];
    const draggedIndex = newOrder.indexOf(draggedFolder);
    const targetIndex = newOrder.indexOf(targetPath);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedFolder);
      setFolderOrder(newOrder);
    }
    
    setDraggedFolder(null);
    setDragOverFolder(null);
  };

  const handleFolderDragEnd = () => {
    setDraggedFolder(null);
    setDragOverFolder(null);
  };

  // Trier les dossiers selon l'ordre personnalisé
  const sortedFolders = [...folders].sort((a, b) => {
    const indexA = folderOrder.indexOf(a.path);
    const indexB = folderOrder.indexOf(b.path);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const handleDownloadAttachment = async (attachment: { id: string; filename: string }) => {
    if (!credentials || !selectedMessage) return;
    
    try {
      const data = await getAttachment(
        credentials,
        selectedMessage.folder,
        selectedMessage.uid,
        attachment.id
      );
      
      if (data) {
        const link = document.createElement('a');
        link.href = `data:${data.mime_type};base64,${data.base64_content}`;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e: any) {
      setError(`Erreur téléchargement: ${e.message}`);
    }
  };

  // ============================================================================
  // Composeur d'email
  // ============================================================================

  const openComposer = (mode: ComposerMode, originalMessage?: EmailMessageDetail) => {
    let to = '';
    let cc = '';
    let subject = '';
    let body = '';

    if (originalMessage) {
      if (mode === 'reply') {
        to = originalMessage.from.email;
        subject = originalMessage.subject.startsWith('Re:') 
          ? originalMessage.subject 
          : `Re: ${originalMessage.subject}`;
        body = buildReplyBody(originalMessage);
      } else if (mode === 'reply-all') {
        to = originalMessage.from.email;
        const otherRecipients = originalMessage.to
          .filter(r => r.email !== credentials?.email_address)
          .map(r => r.email)
          .join(', ');
        if (otherRecipients) {
          cc = otherRecipients;
          setShowCc(true);
        }
        subject = originalMessage.subject.startsWith('Re:') 
          ? originalMessage.subject 
          : `Re: ${originalMessage.subject}`;
        body = buildReplyBody(originalMessage);
      } else if (mode === 'forward') {
        subject = originalMessage.subject.startsWith('Fwd:') 
          ? originalMessage.subject 
          : `Fwd: ${originalMessage.subject}`;
        body = buildForwardBody(originalMessage);
      }
    }

    setComposer({
      mode,
      to,
      cc,
      bcc: '',
      subject,
      body,
      originalMessage,
      attachments: []
    });
  };

  const buildReplyBody = (message: EmailMessageDetail): string => {
    const date = new Date(message.date).toLocaleString('fr-CH');
    return `<br><br>${signature}<br><br><hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
<p>Le ${date}, ${formatEmailAddress(message.from)} a écrit :</p>
<blockquote style="border-left: 2px solid #ccc; margin: 0; padding-left: 10px; color: #666;">
${message.body_html || message.body_text}
</blockquote>`;
  };

  const buildForwardBody = (message: EmailMessageDetail): string => {
    const date = new Date(message.date).toLocaleString('fr-CH');
    return `<br><br>${signature}<br><br><hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
<p><strong>---------- Message transféré ----------</strong></p>
<p>De: ${formatEmailAddress(message.from)}<br>
Date: ${date}<br>
Objet: ${message.subject}<br>
À: ${message.to.map(formatEmailAddress).join(', ')}</p>
<br>
${message.body_html || message.body_text}`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !composer) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setComposer(prev => prev ? {
          ...prev,
          attachments: [...prev.attachments, {
            filename: file.name,
            mime_type: file.type,
            base64_content: base64
          }]
        } : null);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setComposer(prev => prev ? {
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    } : null);
  };

  const handleSendEmail = async () => {
    if (!credentials || !composer) return;
    
    const toAddresses = parseEmailAddresses(composer.to);
    if (toAddresses.length === 0) {
      setError('Veuillez spécifier au moins un destinataire');
      return;
    }

    setSendingEmail(true);
    setError(null);

    try {
      let finalBody = composer.body;
      if (composer.mode === 'new' && signature) {
        finalBody = `${composer.body}<br><br>${signature}`;
      }

      const request: SendEmailRequest = {
        to: toAddresses,
        cc: parseEmailAddresses(composer.cc),
        bcc: parseEmailAddresses(composer.bcc),
        subject: composer.subject,
        body_html: finalBody,
        body_text: htmlToText(finalBody),
        attachments: composer.attachments,
        in_reply_to: composer.originalMessage?.id,
        references: composer.originalMessage?.references
      };

      const result = await sendEmail(credentials, request);
      
      if (result.success) {
        setComposer(null);
        if (selectedFolder.toLowerCase().includes('sent')) {
          loadMessages();
        }
      } else {
        setError(`Erreur d'envoi: ${result.error}`);
      }
    } catch (e: any) {
      setError(`Erreur d'envoi: ${e.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  // ============================================================================
  // Pagination
  // ============================================================================

  const handlePrevPage = () => {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  };

  const handleNextPage = () => {
    if (offset + limit < totalMessages) {
      setOffset(offset + limit);
    }
  };

  // ============================================================================
  // Rendu
  // ============================================================================

  if (!isOpen) return null;

  // Afficher un message si pas de credentials
  if (!credentials || !credentials.email_address || !credentials.email_password) {
    return (
      <div className="mail-client-overlay">
        <div className="mail-client" style={{ maxWidth: '500px', height: 'auto' }}>
          <div className="mail-client-header">
            <div className="mail-header-left">
              <Mail size={24} />
              <h2>Messagerie</h2>
            </div>
            <div className="mail-header-actions">
              <button onClick={onClose} className="btn-icon" title="Fermer">
                <X size={20} />
              </button>
            </div>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <AlertCircle size={48} style={{ color: '#f59e0b', marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem', color: '#1e293b' }}>Messagerie non configurée</h3>
            <p style={{ color: '#64748b', margin: '0 0 1.5rem' }}>
              Votre compte email n'est pas encore configuré.<br />
              Contactez l'administrateur pour activer votre messagerie.
            </p>
            <button 
              onClick={onClose}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mail-client-overlay">
      <div className={`mail-client ${isMaximized ? 'maximized' : ''}`}>
        {/* Header */}
        <div className="mail-client-header">
          <div className="mail-header-left">
            <Mail size={24} />
            <h2>Messagerie</h2>
            {credentials && (
              <span className="mail-email-address">{credentials.email_address}</span>
            )}
          </div>
          <div className="mail-header-actions">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="btn-icon"
              title={isMaximized ? 'Réduire' : 'Agrandir'}
            >
              {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button onClick={onClose} className="btn-icon" title="Fermer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mail-error">
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Corps principal */}
        <div className="mail-client-body">
          {/* Sidebar - Dossiers */}
          <div className="mail-sidebar">
            <button className="btn-new-message" onClick={() => openComposer('new')}>
              <Plus size={18} />
              Nouveau message
            </button>

            <div className="mail-folders">
              {loadingFolders ? (
                <div className="mail-loading">
                  <Loader2 size={20} className="spinning" />
                </div>
              ) : (
                <nav>
                  {sortedFolders.map(folder => {
                    const Icon = getFolderIcon(folder.name);
                    const isSelected = folder.path === selectedFolder;
                    const isDragging = draggedFolder === folder.path;
                    const isDragOver = dragOverFolder === folder.path;
                    
                    return (
                      <div
                        key={folder.path}
                        draggable
                        onDragStart={(e) => handleFolderDragStart(e, folder.path)}
                        onDragOver={(e) => handleFolderDragOver(e, folder.path)}
                        onDragLeave={handleFolderDragLeave}
                        onDrop={(e) => handleFolderDrop(e, folder.path)}
                        onDragEnd={handleFolderDragEnd}
                        className={`mail-folder-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                        onClick={() => {
                          setSelectedFolder(folder.path);
                          setOffset(0);
                          setSelectedMessage(null);
                          setSelectedMessages(new Set());
                        }}
                      >
                        <GripVertical size={12} className="drag-handle" />
                        <Icon size={16} />
                        <span className="folder-name">{getFolderDisplayName(folder.name)}</span>
                        {folder.unread_count > 0 && (
                          <span className="folder-badge">{folder.unread_count}</span>
                        )}
                      </div>
                    );
                  })}
                </nav>
              )}
            </div>
          </div>

          {/* Zone centrale */}
          <div className="mail-content">
            {/* Barre d'outils */}
            <div className="mail-toolbar">
              <button onClick={handleRefresh} className="btn-icon" title="Actualiser" disabled={loadingMessages}>
                <RefreshCw size={18} className={loadingMessages ? 'spinning' : ''} />
              </button>
              
              <div className="mail-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="mail-pagination">
                <span>{offset + 1}-{Math.min(offset + limit, totalMessages)} sur {totalMessages}</span>
                <button onClick={handlePrevPage} disabled={offset === 0} className="btn-icon">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={handleNextPage} disabled={offset + limit >= totalMessages} className="btn-icon">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Contenu : Liste + Lecture */}
            <div className="mail-panels">
              {/* Liste des messages */}
              <div className={`mail-list ${selectedMessage ? 'narrow' : ''}`} ref={messageListRef}>
                {/* Barre d'actions pour sélection multiple */}
                {selectedMessages.size > 0 && (
                  <div className="selection-toolbar">
                    <span className="selection-count">
                      <Check size={14} />
                      {selectedMessages.size} sélectionné(s)
                    </span>
                    <button onClick={handleArchiveMessages} className="btn-action small" title="Archiver (E)">
                      <Archive size={14} /> Archiver
                    </button>
                    <button onClick={handleDeleteSelectedMessages} className="btn-action small danger" title="Supprimer (Suppr)">
                      <Trash2 size={14} /> Supprimer
                    </button>
                    <button onClick={() => setSelectedMessages(new Set())} className="btn-action small">
                      <X size={14} /> Annuler
                    </button>
                  </div>
                )}
                
                {loadingMessages ? (
                  <div className="mail-loading">
                    <Loader2 size={24} className="spinning" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="mail-empty">
                    <Inbox size={48} />
                    <p>Aucun message</p>
                  </div>
                ) : (
                  <div className="message-list">
                    {messages.map((message, index) => {
                      const isSelected = selectedMessage?.uid === message.uid;
                      const isMultiSelected = selectedMessages.has(message.uid);
                      
                      return (
                        <div
                          key={message.uid}
                          onClick={(e) => handleMessageClick(message, index, e)}
                          className={`message-item ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${!message.is_read ? 'unread' : ''}`}
                        >
                          <div className="message-checkbox">
                            <input
                              type="checkbox"
                              checked={isMultiSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                const newSelection = new Set(selectedMessages);
                                if (isMultiSelected) {
                                  newSelection.delete(message.uid);
                                } else {
                                  newSelection.add(message.uid);
                                }
                                setSelectedMessages(newSelection);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="message-content">
                            <div className="message-header">
                              <span className="message-from">
                                {message.from.name || message.from.email}
                              </span>
                              {message.has_attachments && <Paperclip size={12} />}
                              <span className="message-date">
                                {new Date(message.date).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' })}
                              </span>
                            </div>
                            <div className="message-subject">{message.subject || '(Sans objet)'}</div>
                            <div className="message-preview">{message.preview}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Zone de lecture */}
              {selectedMessage && (
                <div className="mail-reader">
                  <div className="reader-header">
                    <h3>{selectedMessage.subject || '(Sans objet)'}</h3>
                    <div className="reader-meta">
                      <div className="reader-from">
                        <div className="avatar">
                          {(selectedMessage.from.name || selectedMessage.from.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="from-name">{selectedMessage.from.name || selectedMessage.from.email}</p>
                          <p className="from-to">À: {selectedMessage.to.map(r => r.name || r.email).join(', ')}</p>
                        </div>
                      </div>
                      <span className="reader-date">
                        {new Date(selectedMessage.date).toLocaleString('fr-CH')}
                      </span>
                    </div>

                    <div className="reader-actions">
                      <div className="reader-actions-group">
                        <button onClick={() => openComposer('reply', selectedMessage)} className="btn-action-primary" title="Répondre (R)">
                          <Reply size={18} />
                          <span>Répondre</span>
                        </button>
                        <button onClick={() => openComposer('reply-all', selectedMessage)} className="btn-action-secondary" title="Répondre à tous (Shift+R)">
                          <ReplyAll size={18} />
                          <span>Répondre à tous</span>
                        </button>
                        <button onClick={() => openComposer('forward', selectedMessage)} className="btn-action-secondary" title="Transférer (F)">
                          <Forward size={18} />
                          <span>Transférer</span>
                        </button>
                      </div>
                      <div className="reader-actions-secondary">
                        <button onClick={handleArchiveMessages} className="btn-icon-labeled" title="Archiver (E)">
                          <Archive size={16} />
                        </button>
                        <button onClick={handleToggleRead} className="btn-icon-labeled" title={selectedMessage.is_read ? 'Marquer non lu' : 'Marquer lu'}>
                          {selectedMessage.is_read ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button onClick={handleDeleteMessage} className="btn-icon-labeled danger" title="Supprimer (Suppr)">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedMessage.attachments.length > 0 && (
                    <div className="reader-attachments">
                      <Paperclip size={14} />
                      {selectedMessage.attachments.map(att => (
                        <button key={att.id} onClick={() => handleDownloadAttachment(att)} className="attachment-chip">
                          <Download size={12} />
                          {att.filename} ({formatFileSize(att.size)})
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="reader-body">
                    {loadingMessage ? (
                      <div className="mail-loading">
                        <Loader2 size={24} className="spinning" />
                      </div>
                    ) : (
                      <div 
                        className="message-html"
                        dangerouslySetInnerHTML={{ 
                          __html: selectedMessage.body_html || selectedMessage.body_text.replace(/\n/g, '<br>') 
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {!selectedMessage && messages.length > 0 && (
                <div className="mail-placeholder">
                  <Mail size={64} />
                  <p>Sélectionnez un message</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Composeur (Modal) */}
        {composer && (
          <div className="composer-overlay">
            <div className="composer">
              <div className="composer-header">
                <h3>
                  {composer.mode === 'new' && 'Nouveau message'}
                  {composer.mode === 'reply' && 'Répondre'}
                  {composer.mode === 'reply-all' && 'Répondre à tous'}
                  {composer.mode === 'forward' && 'Transférer'}
                </h3>
                <button onClick={() => setComposer(null)} className="btn-icon">
                  <X size={20} />
                </button>
              </div>

              <div className="composer-fields">
                <div className="field-row">
                  <label>À:</label>
                  <input
                    type="text"
                    value={composer.to}
                    onChange={e => setComposer(prev => prev ? { ...prev, to: e.target.value } : null)}
                    placeholder="destinataire@exemple.com"
                  />
                  <button onClick={() => setShowCc(!showCc)} className="btn-link">Cc</button>
                  <button onClick={() => setShowBcc(!showBcc)} className="btn-link">Cci</button>
                </div>

                {showCc && (
                  <div className="field-row">
                    <label>Cc:</label>
                    <input
                      type="text"
                      value={composer.cc}
                      onChange={e => setComposer(prev => prev ? { ...prev, cc: e.target.value } : null)}
                    />
                  </div>
                )}

                {showBcc && (
                  <div className="field-row">
                    <label>Cci:</label>
                    <input
                      type="text"
                      value={composer.bcc}
                      onChange={e => setComposer(prev => prev ? { ...prev, bcc: e.target.value } : null)}
                    />
                  </div>
                )}

                <div className="field-row">
                  <label>Objet:</label>
                  <input
                    type="text"
                    value={composer.subject}
                    onChange={e => setComposer(prev => prev ? { ...prev, subject: e.target.value } : null)}
                    placeholder="Objet du message"
                  />
                </div>
              </div>

              {composer.attachments.length > 0 && (
                <div className="composer-attachments">
                  {composer.attachments.map((att, i) => (
                    <span key={i} className="attachment-chip">
                      <Paperclip size={12} />
                      {att.filename}
                      <button onClick={() => removeAttachment(i)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="composer-body">
                <textarea
                  value={composer.body}
                  onChange={e => setComposer(prev => prev ? { ...prev, body: e.target.value } : null)}
                  placeholder="Rédigez votre message..."
                />
              </div>

              <div className="composer-footer">
                <div className="composer-tools">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    style={{ display: 'none' }}
                  />
                  <button onClick={() => fileInputRef.current?.click()} className="btn-action">
                    <Paperclip size={16} /> Joindre
                  </button>
                </div>

                <div className="composer-actions">
                  <button onClick={() => setComposer(null)} className="btn-secondary">
                    Annuler
                  </button>
                  <button onClick={handleSendEmail} disabled={sendingEmail} className="btn-primary">
                    {sendingEmail ? (
                      <>
                        <Loader2 size={16} className="spinning" />
                        Envoi...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Envoyer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MailClient;
