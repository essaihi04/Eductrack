import { useState } from 'react';
import { X, Download, Eye, FileText, ExternalLink } from 'lucide-react';

const DocumentViewerModal = ({ document, isOpen, onClose, onView, onDownload }) => {
  if (!isOpen || !document) return null;

  const typeIcons = {
    cours: '📖',
    exercice: '✏️',
    devoir: '📝',
    rattrapage: '🔄',
    approfondissement: '📚'
  };

  const typeLabels = {
    cours: 'Cours',
    exercice: 'Exercice',
    devoir: 'Devoir',
    rattrapage: 'Rattrapage',
    approfondissement: 'Approfondissement'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="text-5xl">{typeIcons[document.document_type] || '📄'}</div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{document.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded-full font-medium">
                  {typeLabels[document.document_type] || document.document_type}
                </span>
                {document.subjects?.name && (
                  <span className="text-sm text-gray-600">{document.subjects.name}</span>
                )}
              </div>
            </div>
          </div>

          {document.description && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-gray-600">{document.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Classe</p>
              <p className="font-medium text-gray-900">{document.classes?.name || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Niveau</p>
              <p className="font-medium text-gray-900">{document.classes?.level || '-'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Date d'ajout</p>
              <p className="font-medium text-gray-900">
                {new Date(document.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Taille du fichier</p>
              <p className="font-medium text-gray-900">
                {(document.file_size / 1024 / 1024).toFixed(2)} Mo
              </p>
            </div>
          </div>

          {document.controls_plan && (
            <div className="mb-6 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 font-medium">Contrôle associé</p>
              <p className="text-sm text-blue-900">{document.controls_plan.name}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onView(document.id);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <Eye className="w-5 h-5" />
              Marquer comme vu
            </button>
            <button
              onClick={() => {
                onDownload(document);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Download className="w-5 h-5" />
              Télécharger
            </button>
          </div>

          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => {
                onDownload(document);
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Ouvrir / Télécharger
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
