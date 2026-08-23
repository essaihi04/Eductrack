import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ParentAssistantContext = createContext(null);

export const ParentAssistantProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [requestedChildId, setRequestedChildId] = useState('');

  const openAssistant = useCallback((childId = '') => {
    if (childId) setRequestedChildId(childId);
    setIsOpen(true);
  }, []);

  const closeAssistant = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({
    isOpen,
    requestedChildId,
    openAssistant,
    closeAssistant,
  }), [closeAssistant, isOpen, openAssistant, requestedChildId]);

  return (
    <ParentAssistantContext.Provider value={value}>
      {children}
    </ParentAssistantContext.Provider>
  );
};

// Le provider et son hook restent côte à côte : c'est une unité d'état locale
// au layout parent, sans valeur mutable exportée.
// eslint-disable-next-line react-refresh/only-export-components
export const useParentAssistant = () => {
  const value = useContext(ParentAssistantContext);
  if (!value) throw new Error('useParentAssistant doit être utilisé dans ParentAssistantProvider');
  return value;
};
