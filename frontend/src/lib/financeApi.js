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
  if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
  return data;
}

async function uploadRequest(path, formData) {
  const token = await getToken();
  const res = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

export const financeApi = {
  // Classes (lecture pour module finance)
  listClasses: (academicYear) => request('/api/finance/classes', { query: { academic_year: academicYear } }),

  // Templates
  listTemplates: () => request('/api/finance/fee-templates'),
  createTemplate: (data) => request('/api/finance/fee-templates', { method: 'POST', body: data }),
  updateTemplate: (id, data) => request(`/api/finance/fee-templates/${id}`, { method: 'PUT', body: data }),
  deleteTemplate: (id) => request(`/api/finance/fee-templates/${id}`, { method: 'DELETE' }),
  applyTemplateToClass: (id, data) => request(`/api/finance/fee-templates/${id}/apply-to-class`, { method: 'POST', body: data }),
  applyTemplateToClasses: (id, data) => request(`/api/finance/fee-templates/${id}/apply-to-classes`, { method: 'POST', body: data }),
  getClassAssignments: (academicYear) => request('/api/finance/fee-templates/class-assignments', { query: { academic_year: academicYear } }),

  // Student plans
  getStudentPlan: (studentId, academicYear) => request(`/api/finance/students/${studentId}/fee-plan`, { query: { academic_year: academicYear } }),
  saveStudentPlan: (studentId, data) => request(`/api/finance/students/${studentId}/fee-plan`, { method: 'POST', body: data }),

  // Échéancier mensuel + encaissement par mois (factures auto-générées)
  getMonthlyStatus: (studentId, academicYear) => request(`/api/finance/students/${studentId}/monthly-status`, { query: { academic_year: academicYear } }),
  payMonths: (studentId, data) => request(`/api/finance/students/${studentId}/pay-months`, { method: 'POST', body: data }),
  getMonthlyServicesStatus: (studentId, academicYear) => request(`/api/finance/students/${studentId}/monthly-services-status`, { query: { academic_year: academicYear } }),
  payServices: (studentId, data) => request(`/api/finance/students/${studentId}/pay-services`, { method: 'POST', body: data }),
  // Annuler le paiement d'un service (mois×service) ; ajouter un service à un mois
  cancelServicePayment: (studentId, data) => request(`/api/finance/students/${studentId}/services/cancel-payment`, { method: 'POST', body: data }),
  addService: (studentId, data) => request(`/api/finance/students/${studentId}/services/add`, { method: 'POST', body: data }),
  restoreService: (studentId, data) => request(`/api/finance/students/${studentId}/services/restore`, { method: 'POST', body: data }),
  payGroupPreview: (data) => request('/api/finance/pay-group/preview', { method: 'POST', body: data }),
  payGroup: (data) => request('/api/finance/pay-group', { method: 'POST', body: data }),

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
  updatePayment: (id, data) => request(`/api/finance/payments/${id}`, { method: 'PUT', body: data }),
  cancelPayment: (id, reason) => request(`/api/finance/payments/${id}/cancel`, { method: 'PUT', body: { reason } }),

  // Caisse (encaissements/dépenses par période et mode)
  getCashRegister: (from, to) => request('/api/finance/cash-register', { query: { from, to } }),

  // Rapports financiers (synthèse exportable par période / mois / jour)
  getReportSummary: (from, to) => request('/api/finance/reports/summary', { query: { from, to } }),

  // Dashboard
  getSummary: (academicYear) => request('/api/finance/dashboard/summary', { query: { academic_year: academicYear } }),
  getCashflow: (months = 6) => request('/api/finance/dashboard/cashflow', { query: { months } }),
  getByClass: (academicYear) => request('/api/finance/dashboard/by-class', { query: { academic_year: academicYear } }),

  // Overdue
  getOverdue: (academicYear) => request('/api/finance/overdue', { query: { academic_year: academicYear } }),

  // Expenses
  listExpenses: (filters) => request('/api/finance/expenses', { query: filters }),
  createExpense: (data) => request('/api/finance/expenses', { method: 'POST', body: data }),
  deleteExpense: (id) => request(`/api/finance/expenses/${id}`, { method: 'DELETE' }),

  // Students finance view
  listStudents: (filters) => request('/api/finance/students', { query: filters }),
  getSiblings: (studentId, academicYear) => request(`/api/finance/students/${studentId}/siblings`, { query: { academic_year: academicYear } }),
  getPaymentBatch: (batchId) => request(`/api/finance/payment-batches/${batchId}`),
  // Ouvre un PDF (facture ou reçu de lot) via fetch authentifié → blob → nouvel onglet
  _openPdf: async (path) => {
    const token = await getToken();
    const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  openInvoicePdf: (id) => financeApi._openPdf(`/api/finance/invoices/${id}/pdf`),
  openBatchReceiptPdf: (batchId) => financeApi._openPdf(`/api/finance/payment-batches/${batchId}/receipt-pdf`),

  // ── Comptabilité de gestion (Phase 1) ──────────────────────────────────
  // Plan comptable
  getChart: () => request('/api/finance/chart'),
  createAccount: (data) => request('/api/finance/chart', { method: 'POST', body: data }),
  updateAccount: (id, data) => request(`/api/finance/chart/${id}`, { method: 'PUT', body: data }),
  deleteAccount: (id) => request(`/api/finance/chart/${id}`, { method: 'DELETE' }),
  syncDefaultAccounts: () => request('/api/finance/chart/sync-defaults', { method: 'POST' }),
  // Budget prévisionnel
  getBudget: (academicYear) => request('/api/finance/budget', { query: { academic_year: academicYear } }),
  saveBudget: (academicYear, rows) => request('/api/finance/budget', { method: 'PUT', body: { academic_year: academicYear, rows } }),
  copyBudgetPreviousYear: (academicYear) => request('/api/finance/budget/copy-previous-year', { method: 'POST', body: { academic_year: academicYear } }),
  // Matrice annuelle Prévisionnel / Réel
  getAnnualMatrix: (academicYear) => request('/api/finance/reports/annual-matrix', { query: { academic_year: academicYear } }),

  // ── Paie (Phase 2) ─────────────────────────────────────────────────────
  listEmployees: () => request('/api/finance/payroll/employees'),
  createEmployee: (data) => request('/api/finance/payroll/employees', { method: 'POST', body: data }),
  updateEmployee: (id, data) => request(`/api/finance/payroll/employees/${id}`, { method: 'PUT', body: data }),
  deleteEmployee: (id) => request(`/api/finance/payroll/employees/${id}`, { method: 'DELETE' }),
  listPayrollRuns: (academicYear) => request('/api/finance/payroll/runs', { query: { academic_year: academicYear } }),
  getPayrollRun: (id) => request(`/api/finance/payroll/runs/${id}`),
  createPayrollRun: (year, month) => request('/api/finance/payroll/runs', { method: 'POST', body: { year, month } }),
  savePayrollLines: (id, lines) => request(`/api/finance/payroll/runs/${id}/lines`, { method: 'PUT', body: { lines } }),
  addPayrollLine: (id, data) => request(`/api/finance/payroll/runs/${id}/lines`, { method: 'POST', body: data }),
  deletePayrollLine: (id, lineId) => request(`/api/finance/payroll/runs/${id}/lines/${lineId}`, { method: 'DELETE' }),
  postPayrollRun: (id) => request(`/api/finance/payroll/runs/${id}/post`, { method: 'POST' }),
  unpostPayrollRun: (id) => request(`/api/finance/payroll/runs/${id}/unpost`, { method: 'POST' }),
  deletePayrollRun: (id) => request(`/api/finance/payroll/runs/${id}`, { method: 'DELETE' }),

  // ── Prêts / leasing (Phase 3) ──────────────────────────────────────────
  listLoans: () => request('/api/finance/loans'),
  getLoan: (id) => request(`/api/finance/loans/${id}`),
  createLoan: (data) => request('/api/finance/loans', { method: 'POST', body: data }),
  deleteLoan: (id) => request(`/api/finance/loans/${id}`, { method: 'DELETE' }),
  payLoanSchedule: (id, sid) => request(`/api/finance/loans/${id}/schedule/${sid}/pay`, { method: 'POST' }),
  unpayLoanSchedule: (id, sid) => request(`/api/finance/loans/${id}/schedule/${sid}/unpay`, { method: 'POST' }),

  // ── Impôts & taxes (Phase 3) ───────────────────────────────────────────
  listTaxes: () => request('/api/finance/taxes'),
  createTax: (data) => request('/api/finance/taxes', { method: 'POST', body: data }),
  deleteTax: (id) => request(`/api/finance/taxes/${id}`, { method: 'DELETE' }),
  payTax: (id) => request(`/api/finance/taxes/${id}/pay`, { method: 'POST' }),
  unpayTax: (id) => request(`/api/finance/taxes/${id}/unpay`, { method: 'POST' }),

  // ── Import relevé bancaire (Phase 4) ───────────────────────────────────
  listStatements: () => request('/api/finance/bank/statements'),
  getStatement: (id) => request(`/api/finance/bank/statements/${id}`),
  uploadStatement: (formData) => uploadRequest('/api/finance/bank/statements', formData),
  deleteStatement: (id) => request(`/api/finance/bank/statements/${id}`, { method: 'DELETE' }),
  applyBankRules: (id) => request(`/api/finance/bank/statements/${id}/apply-rules`, { method: 'POST' }),
  postAllBankTxns: (id) => request(`/api/finance/bank/statements/${id}/post-all`, { method: 'POST' }),
  updateBankTxn: (id, data) => request(`/api/finance/bank/transactions/${id}`, { method: 'PUT', body: data }),
  postBankTxn: (id) => request(`/api/finance/bank/transactions/${id}/post`, { method: 'POST' }),
  unpostBankTxn: (id) => request(`/api/finance/bank/transactions/${id}/unpost`, { method: 'POST' }),
  listBankRules: () => request('/api/finance/bank/rules'),
  createBankRule: (data) => request('/api/finance/bank/rules', { method: 'POST', body: data }),
  updateBankRule: (id, data) => request(`/api/finance/bank/rules/${id}`, { method: 'PUT', body: data }),
  deleteBankRule: (id) => request(`/api/finance/bank/rules/${id}`, { method: 'DELETE' }),
  // Clôture mensuelle
  getMonthClose: (academicYear) => request('/api/finance/month-close', { query: { academic_year: academicYear } }),
  setMonthClose: (academic_year, month, status) => request('/api/finance/month-close', { method: 'POST', body: { academic_year, month, status } }),

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
