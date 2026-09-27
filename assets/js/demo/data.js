// Fictitious demo data. Names and IDs are invented and marked DEMO; not real companies.
export const COMPANY = { name: 'Nova Administration S.L.', short: 'Nova Administration' };

export const CLIENTS = [
  { id: 'C-1001', name: 'Lumen Óptica S.L.',          taxId: 'DEMO-40412', city: 'Barcelona' },
  { id: 'C-1002', name: 'Lumen Logistics S.L.',       taxId: 'DEMO-70233', city: 'Valencia' },
  { id: 'C-1003', name: 'Brisa Arquitectura S.L.P.',  taxId: 'DEMO-65893', city: 'Girona' },
  { id: 'C-1004', name: 'Caldera Foods S.A.',         taxId: 'DEMO-08117', city: 'Sabadell' },
  { id: 'C-1005', name: 'Caldera Wines S.L.',         taxId: 'DEMO-66100', city: 'Terrassa' },
  { id: 'C-1006', name: 'Norte Clínica Dental S.L.',  taxId: 'DEMO-67021', city: 'Rubí' },
  { id: 'C-1007', name: 'Tessera Studio S.L.',        taxId: 'DEMO-68877', city: 'Madrid' },
  { id: 'C-1008', name: 'Tessera Legal S.L.P.',       taxId: 'DEMO-65509', city: 'Tarragona' },
  { id: 'C-1009', name: 'Brisa Hostel Group S.L.',    taxId: 'DEMO-61844', city: 'Sitges' },
];

// Pending invoices received by Nova Administration on behalf of its clients.
export const INVOICES = [
  { id: 'INV-2026-0418', supplier: 'Montseny Office Supply', clientId: 'C-1001', amount: 482.6,  date: '2026-09-24', concept: 'office',   file: 'INV-2026-0418.pdf', lines: [['Paper A4 80g · 20 boxes', 212.4], ['Toner cartridges · 3', 186.0], ['Delivery', 0]] },
  { id: 'INV-2026-0419', supplier: 'Termo Clima Serveis',    clientId: 'C-1004', amount: 1240.0, date: '2026-09-24', concept: 'hvac',     file: 'INV-2026-0419.pdf', lines: [['Preventive HVAC maintenance', 880.0], ['Filter replacement · 6', 144.8]] },
  { id: 'INV-2026-0420', supplier: 'Red Datos Cloud',        clientId: 'C-1007', amount: 89.0,   date: '2026-09-25', concept: 'hosting',  file: 'INV-2026-0420.pdf', lines: [['Cloud hosting · September', 73.55]] },
  { id: 'INV-2026-0421', supplier: 'Grafik Print Lab',       clientId: 'C-1003', amount: 356.4,  date: '2026-09-25', concept: 'printing', file: 'INV-2026-0421.pdf', lines: [['Plan printing A1 · 24', 238.56], ['Binding', 56.0]] },
  { id: 'INV-2026-0422', supplier: 'Lavanda Cleaning Co.',   clientId: 'C-1006', amount: 615.0,  date: '2026-09-26', concept: 'cleaning', file: 'INV-2026-0422.pdf', lines: [['Cleaning services · September', 508.26]] },
];

export const DOC_TYPES = ['supplier_invoice', 'service_invoice', 'expense_receipt', 'credit_note'];
export const STATUSES = ['pending_review', 'validated', 'ready_for_payment', 'rejected'];

export const clientById = (id) => CLIENTS.find((c) => c.id === id);

export function searchClients(query) {
  const q = norm(query);
  if (!q) return [];
  return CLIENTS.filter((c) => norm(c.name).includes(q) || norm(c.taxId).includes(q) || c.id.toLowerCase().includes(q));
}

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
