import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function request(path, { method = 'GET', body, query } = {}) {
  const token = await getToken();
  let url = `${apiUrl}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

export const financeApi = {
  // Classes (lecture pour module finance)
  listClasses: () => request('/api/finance/classes'),

  // Templates
  listTemplates: () => request('/api/finance/fee-templates'),
  createTemplate: (data) => request('/api/finance/fee-templates', { method: 'POST', body: data }),
  updateTemplate: (id, data) => request(`/api/finance/fee-templates/${id}`, { method: 'PUT', body: data }),
  deleteTemplate: (id) => request(`/api/finance/fee-templates/${id}`, { method: 'DELETE' }),
  applyTemplateToClass: (id, data) => request(`/api/finance/fee-templates/${id}/apply-to-class`, { method: 'POST', body: data }),
  applyTemplateToClasses: (id, data) => request(`/api/finance/fee-templates/${id}/apply-to-classes`, { method: 'POST', body: data }),

  // Student plans
  getStudentPlan: (studentId, academicYear) => request(`/api/finance/students/${studentId}/fee-plan`, { query: { academic_year: academicYear } }),
  saveStudentPlan: (studentId, data) => request(`/api/finance/students/${studentId}/fee-plan`, { method: 'POST', body: data }),

  // Échéancier mensuel + encaissement par mois (factures auto-générées)
  getMonthlyStatus: (studentId, academicYear) => request(`/api/finance/students/${studentId}/monthly-status`, { query: { academic_year: academicYear } }),
  payMonths: (studentId, data) => request(`/api/finance/students/${studentId}/pay-months`, { method: 'POST', body: data }),

  // Invoices
  listInvoices: (filters) => request('/api/finance/invoices', { query: filters }),
  getInvoice: (id) => request(`/api/finance/invoices/${id}`),
  createInvoice: (data) => request('/api/finance/invoices', { method: 'POST', body: data }),
  generateMonthly: (data) => request('/api/finance/invoices/generate-monthly', { method: 'POST', body: data }),
  cancelInvoice: (id, reason) => request(`/api/finance/invoices/${id}/cancel`, { method: 'PUT', body: { reason } }),
  markOverdue: () => request('/api/finance/invoices/mark-overdue', { method: 'POST' }),

  // Payments
  listPayments: (filters) => request('/api/finance/payments', { query: filters }),
  getPayment: (id) => request(`/api/finance/payments/${id}`),
  createPayment: (data) => request('/api/finance/payments', { method: 'POST', body: data }),
  cancelPayment: (id, reason) => request(`/api/finance/payments/${id}/cancel`, { method: 'PUT', body: { reason } }),

  // Caisse (encaissements/dépenses par période et mode)
  getCashRegister: (from, to) => request('/api/finance/cash-register', { query: { from, to } }),

  // Rapports financiers (synthèse exportable par période / mois / jour)
  getReportSummary: (from, to) => request('/api/finance/reports/summary', { query: { from, to } }),

  // Dashboard
  getSummary: () => request('/api/finance/dashboard/summary'),
  getCashflow: (months = 6) => request('/api/finance/dashboard/cashflow', { query: { months } }),
  getByClass: () => request('/api/finance/dashboard/by-class'),

  // Overdue
  getOverdue: () => request('/api/finance/overdue'),

  // Expenses
  listExpenses: (filters) => request('/api/finance/expenses', { query: filters }),
  createExpense: (data) => request('/api/finance/expenses', { method: 'POST', body: data }),
  deleteExpense: (id) => request(`/api/finance/expenses/${id}`, { method: 'DELETE' }),

  // Students finance view
  listStudents: (filters) => request('/api/finance/students', { query: filters }),

  // Finance managers (admin only)
  listManagers: () => request('/api/admin/finance-managers'),
  createManager: (data) => request('/api/admin/finance-managers', { method: 'POST', body: data }),
  updateManager: (id, data) => request(`/api/admin/finance-managers/${id}`, { method: 'PUT', body: data }),
  resetManagerPassword: (id, newPassword) => request(`/api/admin/finance-managers/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  deleteManager: (id) => request(`/api/admin/finance-managers/${id}`, { method: 'DELETE' }),
};

export const formatMAD = (n) => {
  const num = Number(n || 0);
  return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + ' MAD';
};

export const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const CATEGORY_LABELS = {
  registration: 'Inscription',
  tuition: 'Scolarité',
  transport: 'Transport',
  canteen: 'Cantine',
  insurance: 'Assurance',
  activity: 'Activités',
  supplies: 'Fournitures',
  uniform: 'Uniforme',
  other: 'Autre'
};

export const RECURRENCE_LABELS = {
  one_time: 'Une fois',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel'
};

export const METHOD_LABELS = {
  cash: 'Espèces',
  check: 'Chèque',
  transfer: 'Virement',
  card_pos: 'Carte',
  other: 'Autre'
};

export const STATUS_LABELS = {
  draft: 'Brouillon',
  issued: 'Émise',
  partial: 'Partielle',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée'
};

export const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500'
};

export const EXPENSE_CATEGORIES = {
  salaries: 'Salaires',
  rent: 'Loyer',
  utilities: 'Services publics',
  supplies: 'Fournitures',
  maintenance: 'Maintenance',
  equipment: 'Équipement',
  marketing: 'Marketing',
  taxes: 'Impôts',
  insurance: 'Assurance',
  transport: 'Transport',
  other: 'Autre'
};
