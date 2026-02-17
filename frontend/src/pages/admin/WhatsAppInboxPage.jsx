import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageSquare, Search, Send, ArrowLeft, User, Phone, Clock,
  CheckCircle, AlertCircle, XCircle, Image, FileText, RefreshCw,
  ChevronRight, Inbox, ArrowUpRight, Filter, MoreVertical
} from 'lucide-react';

const WhatsAppInboxPage = () => {
  const { profile } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, sent, failed
  const [view, setView] = useState('conversations'); // conversations, apiLogs
  const [apiLogs, setApiLogs] = useState([]);
  const [apiLogsLoading, setApiLogsLoading] = useState(false);
  const [apiLogsPage, setApiLogsPage] = useState(1);
  const [apiLogsTotal, setApiLogsTotal] = useState(0);
  const [apiLogsLastPage, setApiLogsLastPage] = useState(1);
  const messagesEndRef = useRef(null);

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Erreur conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Fetch API message logs
  const fetchApiLogs = useCallback(async (page = 1) => {
    setApiLogsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/message-logs?page=${page}&per_page=30`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setApiLogs(data.messages || []);
        setApiLogsTotal(data.total || 0);
        setApiLogsPage(data.currentPage || 1);
        setApiLogsLastPage(data.lastPage || 1);
      }
    } catch (error) {
      console.error('Erreur logs:', error);
    } finally {
      setApiLogsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (view === 'apiLogs') {
      fetchApiLogs(apiLogsPage);
    }
  }, [view, apiLogsPage, fetchApiLogs]);

  // Scroll to bottom when selecting conversation
  useEffect(() => {
    if (selectedConv && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedConv]);

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = !searchQuery ||
      (conv.parentName && conv.parentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      conv.phone.includes(searchQuery);

    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'sent' && conv.totalSent > 0) ||
      (filterStatus === 'failed' && conv.totalFailed > 0);

    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    }
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const formatFullDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'pending':
        return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
      case 'in_progress':
        return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const statusLabel = (status) => {
    const map = {
      sent: 'Envoyé',
      failed: 'Échoué',
      pending: 'En attente',
      in_progress: 'En cours'
    };
    return map[status] || status;
  };

  const messageTypeIcon = (type) => {
    switch (type) {
      case 'image': return <Image className="w-3.5 h-3.5" />;
      case 'document': return <FileText className="w-3.5 h-3.5" />;
      default: return null;
    }
  };

  // Stats summary
  const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
  const totalSent = conversations.reduce((sum, c) => sum + c.totalSent, 0);
  const totalFailed = conversations.reduce((sum, c) => sum + c.totalFailed, 0);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {selectedConv && (
            <button
              onClick={() => setSelectedConv(null)}
              className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Boîte de messages</h1>
              <p className="text-xs text-gray-500">WhatsApp — Messages envoyés aux parents</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="hidden sm:flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('conversations')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'conversations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Conversations
            </button>
            <button
              onClick={() => setView('apiLogs')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'apiLogs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Journal API
            </button>
          </div>
          <button
            onClick={() => view === 'conversations' ? fetchConversations() : fetchApiLogs(apiLogsPage)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading || apiLogsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-6 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-xs text-gray-600"><strong className="text-gray-900">{conversations.length}</strong> conversations</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-xs text-gray-600"><strong className="text-gray-900">{totalSent}</strong> envoyés</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-xs text-gray-600"><strong className="text-gray-900">{totalFailed}</strong> échoués</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          <span className="text-xs text-gray-600"><strong className="text-gray-900">{totalMessages}</strong> total</span>
        </div>
      </div>

      {view === 'conversations' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Conversations list - always visible on desktop, hidden on mobile when conversation selected */}
          <div className={`${selectedConv ? 'hidden' : 'flex'} lg:flex w-full lg:w-96 border-r border-gray-200 bg-white flex-col`}>
            {/* Search + Filter */}
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou numéro..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-gray-50"
                />
              </div>
              <div className="flex gap-1">
                {[
                  { key: 'all', label: 'Tous' },
                  { key: 'sent', label: 'Envoyés' },
                  { key: 'failed', label: 'Échoués' }
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilterStatus(f.key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${filterStatus === f.key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <Inbox className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500 font-medium">Aucune conversation</p>
                  <p className="text-xs text-gray-400 mt-1">Les messages envoyés apparaîtront ici</p>
                </div>
              ) : (
                filteredConversations.map(conv => (
                  <button
                    key={conv.phone}
                    onClick={() => setSelectedConv(conv)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedConv?.phone === conv.phone ? 'bg-green-50 border-l-2 border-l-green-500' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-semibold text-sm">
                          {conv.parentName ? conv.parentName.charAt(0).toUpperCase() : '#'}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {conv.parentName || conv.phone}
                          </p>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                            {formatDate(conv.lastMessageAt)}
                          </span>
                        </div>
                        {conv.parentName && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {conv.phone}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-gray-500 truncate pr-2">
                            {conv.messages.length > 0 ? (conv.messages[conv.messages.length - 1].content || `[${conv.messages[conv.messages.length - 1].messageType}]`) : ''}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {conv.totalSent > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600">
                                <CheckCircle className="w-3 h-3" /> {conv.totalSent}
                              </span>
                            )}
                            {conv.totalFailed > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-500">
                                <XCircle className="w-3 h-3" /> {conv.totalFailed}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Message thread - takes remaining space */}
          <div className={`${selectedConv ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-[#f0f2f5]`}>
            {selectedConv ? (
              <>
                {/* Thread header */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => setSelectedConv(null)}
                    className="lg:hidden p-1 hover:bg-gray-100 rounded"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {selectedConv.parentName ? selectedConv.parentName.charAt(0).toUpperCase() : '#'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {selectedConv.parentName || selectedConv.phone}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedConv.phone}
                      <span className="mx-1">·</span>
                      {selectedConv.messageCount} message(s)
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {selectedConv.messages.map((msg, idx) => {
                    // Show date separator
                    const showDate = idx === 0 || (
                      new Date(msg.createdAt).toDateString() !== new Date(selectedConv.messages[idx - 1].createdAt).toDateString()
                    );

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="bg-white/80 backdrop-blur-sm text-[11px] text-gray-500 px-3 py-1 rounded-full shadow-sm">
                              {new Date(msg.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                        )}

                        {/* Outgoing message bubble (WhatsApp style - right aligned) */}
                        <div className="flex justify-end">
                          <div className="max-w-[75%] bg-[#d9fdd3] rounded-lg rounded-tr-none px-3 py-2 shadow-sm">
                            {/* Media indicator */}
                            {msg.messageType !== 'text' && (
                              <div className="flex items-center gap-1.5 mb-1.5 text-green-700">
                                {messageTypeIcon(msg.messageType)}
                                <span className="text-xs font-medium">
                                  {msg.fileName || (msg.messageType === 'image' ? 'Image' : 'Document')}
                                </span>
                              </div>
                            )}

                            {/* Message content */}
                            {msg.content && (
                              <p className="text-[13px] text-gray-900 whitespace-pre-wrap break-words leading-relaxed">
                                {msg.content}
                              </p>
                            )}

                            {/* Error message */}
                            {msg.errorMessage && (
                              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {msg.errorMessage}
                              </p>
                            )}

                            {/* Footer: time + status */}
                            <div className="flex items-center justify-end gap-1.5 mt-1">
                              {msg.senderName && (
                                <span className="text-[10px] text-gray-500 mr-auto">{msg.senderName}</span>
                              )}
                              <span className="text-[10px] text-gray-500">
                                {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {statusIcon(msg.status)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Bottom info bar */}
                <div className="bg-white border-t border-gray-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      {selectedConv.totalSent} envoyé(s)
                    </span>
                    {selectedConv.totalFailed > 0 && (
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                        {selectedConv.totalFailed} échoué(s)
                      </span>
                    )}
                  </div>
                  <a
                    href="/messages/send"
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Envoyer un message
                  </a>
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                <div className="w-20 h-20 bg-gray-200/50 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">Sélectionnez une conversation</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-sm">
                  Choisissez un contact dans la liste pour voir l'historique des messages envoyés
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* API Logs view */
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-4xl mx-auto p-4">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-800">Journal des messages API</h2>
              <p className="text-xs text-gray-500">Logs de tous les messages envoyés via WasenderAPI</p>
            </div>

            {apiLogsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            ) : apiLogs.length === 0 ? (
              <div className="text-center py-12">
                <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Aucun log de message</p>
              </div>
            ) : (
              <>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Destinataire</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Message</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {apiLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                                <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                              </div>
                              <span className="text-sm font-medium text-gray-800">{log.to}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600 truncate max-w-xs">{log.content || '—'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              log.status === 'sent' ? 'bg-green-100 text-green-700' :
                              log.status === 'failed' ? 'bg-red-100 text-red-700' :
                              log.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {statusIcon(log.status)}
                              {statusLabel(log.status)}
                            </span>
                            {log.failed_reason && (
                              <p className="text-[10px] text-red-500 mt-0.5">{log.failed_reason}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {formatFullDate(log.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {apiLogsLastPage > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <span className="text-xs text-gray-500">{apiLogsTotal} messages au total</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setApiLogsPage(p => Math.max(1, p - 1))}
                        disabled={apiLogsPage <= 1}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        Précédent
                      </button>
                      <span className="text-xs text-gray-600">Page {apiLogsPage} / {apiLogsLastPage}</span>
                      <button
                        onClick={() => setApiLogsPage(p => Math.min(apiLogsLastPage, p + 1))}
                        disabled={apiLogsPage >= apiLogsLastPage}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppInboxPage;
