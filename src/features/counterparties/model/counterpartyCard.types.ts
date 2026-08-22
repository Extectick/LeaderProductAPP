export type CounterpartySectionAvailability = 'available' | 'forbidden' | 'unavailable';

export type CounterpartyCardTab = 'overview' | 'finance' | 'activity' | 'profile';
export type CounterpartySalesPeriod = 'week' | 'month' | 'quarter' | 'halfYear' | 'custom';

export type CounterpartyOrganizationSummary = { guid: string; name: string };

export type CounterpartyIdentity = {
  counterpartyGuid: string;
  name: string;
  fullName: string | null;
  inn: string | null;
  kpp: string | null;
  legalType: string | null;
  partnerGuid: string | null;
  partnerName: string | null;
  isActive: boolean | null;
};

export type CounterpartyContext = {
  organizationGuid: string | null;
  organizationName: string | null;
  availableOrganizations: CounterpartyOrganizationSummary[];
  managerGuid: string | null;
  managerName: string | null;
  regionGuid: string | null;
  regionName: string | null;
  zoneGuid: string | null;
  zoneName: string | null;
};

export type CounterpartyOverview = {
  status: string | null;
  debtTotal: number | null;
  overdueDebt: number | null;
  maxOverdueDays: number | null;
  availableCreditLimit: number | null;
  salesAmount: number | null;
  previousSalesAmount: number | null;
  salesChangePercent: number | null;
  lastOrderDate: string | null;
  lastOrderAmount: number | null;
  averageCheck: number | null;
};

export type CounterpartyFinanceSummary = {
  debtTotal: number | null;
  overdueDebt: number | null;
  notDueDebt: number | null;
  prepayment: number | null;
  creditLimit: number | null;
  availableCreditLimit: number | null;
  creditLimitExceeded: boolean | null;
  shipmentProhibited: boolean | null;
  shipmentProhibitionReason: string | null;
  currency: string | null;
  nearestPaymentDate: string | null;
  nearestPaymentAmount?: number | null;
  maxOverdueDays: number | null;
  paymentTermDays?: number | null;
  paidAmount?: number | null;
  paymentTermSource?: string | null;
  agreementGuid?: string | null;
  agreementName?: string | null;
};

export type CounterpartyPaymentReceipt = {
  guid?: string | null;
  number: string | null;
  date: string | null;
  amount: number | null;
  currency?: string | null;
  type: string | null;
  typeCode?: string | null;
  typeLabel?: string | null;
};

export type CounterpartyUpcomingPayment = {
  guid: string;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  amount: number | null;
  currency: string | null;
  status: 'OVERDUE' | 'EXPECTED';
  overdueDays: number;
};

export type CounterpartyPaymentDiscipline = {
  available: boolean;
  periodFrom: string | null;
  periodTo: string | null;
  settledDocumentsCount: number;
  overdueDocumentsCount: number;
  paidOnTimePercent: number | null;
  averageDelayDays: number | null;
  totalSettledAmount: number;
  onTimeSettledAmount: number;
  currency: string | null;
};

export type CounterpartySalesChartPoint = {
  date: string;
  label?: string | null;
  amount: number | null;
};

export type CounterpartySalesSummaryChartPoint = {
  periodFrom: string;
  periodTo: string;
  label: string | null;
  salesAmount: number | null;
  ordersCount: number | null;
  salesDocumentsCount?: number | null;
};

export type CounterpartySalesSummary = {
  periodFrom: string | null;
  periodTo: string | null;
  compareFrom: string | null;
  compareTo: string | null;
  salesAmount: number | null;
  previousSalesAmount: number | null;
  salesChangePercent: number | null;
  profit: number | null;
  previousProfit?: number | null;
  profitabilityPercent: number | null;
  previousProfitabilityPercent?: number | null;
  comparisonAvailable?: boolean | null;
  comparisonUnavailableReason?: string | null;
  dataReliableFrom?: string | null;
  ordersCount: number | null;
  averageCheck: number | null;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  averageOrderIntervalDays: number | null;
  periodPreset?: CounterpartySalesPeriod | null;
  chartGranularity?: string | null;
  lastOrderAmount?: number | null;
  orderFrequencyDays?: number | null;
  chartSeries?: CounterpartySalesSummaryChartPoint[];
  comparisonChartSeries?: CounterpartySalesSummaryChartPoint[];
  currency: string | null;
};

export type CounterpartyFinancialDocumentStatus = 'OVERDUE' | 'EXPECTED' | 'AWAITING_SHIPMENT' | 'PAID';

export type CounterpartyFinancialDocument = {
  documentGuid: string;
  documentTypeCode: string | null;
  documentTypeName: string | null;
  number: string | null;
  date: string | null;
  status: CounterpartyFinancialDocumentStatus | null;
  dueDate: string | null;
  shipmentDate: string | null;
  daysOverdue: number | null;
  daysRemaining: number | null;
  outstandingAmount: number | null;
  amount: number | null;
  currency: string | null;
  organizationGuid: string | null;
  organizationName: string | null;
};

export type CounterpartyFinancialDocumentsSummary = {
  totalCount: number;
  overdueCount: number;
  pendingCount: number;
  awaitingShipmentCount: number;
};

export type CounterpartyFinancialDocumentsPage = {
  items: CounterpartyFinancialDocument[];
  summary: CounterpartyFinancialDocumentsSummary;
  hasMore: boolean;
  nextCursor: string | null;
  asOf: string;
  stale: boolean;
  sourceVersion: string;
};

export type CounterpartyFinancialDocumentsParams = {
  counterpartyGuid: string;
  organizationGuid: string;
  preset: CounterpartySalesPeriod;
  periodFrom?: string | null;
  periodTo?: string | null;
  status?: CounterpartyFinancialDocumentStatus | null;
  cursor?: string | null;
  limit?: number;
};

export type CounterpartyCommercialTerms = {
  agreementGuid: string | null;
  agreementName: string | null;
  contractGuid: string | null;
  contractName: string | null;
  priceTypeGuid: string | null;
  priceTypeName: string | null;
  currency: string | null;
  paymentForm: string | null;
  paymentTerms: string | null;
  deliveryMethod: string | null;
  deliveryTerms: string | null;
};

export type CounterpartyContact = {
  kind: string | null;
  kindCode?: string | null;
  label: string | null;
  value: string;
  addressType?: string | null;
  isPrimary: boolean;
};

export type CounterpartyAddress = { kind: string | null; label?: string | null; value: string };

export type CounterpartyRecentOrder = {
  guid: string;
  number: string | null;
  date: string | null;
  shipmentDate: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  itemsCount: number | null;
};

export type CounterpartyCardBootstrap = {
  identity: CounterpartyIdentity;
  context: CounterpartyContext;
  organizationOptions?: CounterpartyOrganizationSummary[];
  overview: CounterpartyOverview;
  financeSummary: CounterpartyFinanceSummary | null;
  salesSummary: CounterpartySalesSummary | null;
  salesChart?: CounterpartySalesChartPoint[];
  incomingPayments?: CounterpartyPaymentReceipt[];
  upcomingPayments?: CounterpartyUpcomingPayment[];
  paymentDiscipline?: CounterpartyPaymentDiscipline | null;
  financialDocuments?: CounterpartyFinancialDocument[];
  financialDocumentsSummary?: CounterpartyFinancialDocumentsSummary | null;
  commercialTerms: CounterpartyCommercialTerms | null;
  recentOrders: CounterpartyRecentOrder[];
  contacts: CounterpartyContact[];
  addresses?: CounterpartyAddress[];
  permissions: { viewFinance: boolean; viewSales: boolean; viewContacts: boolean; createOrder: boolean };
  availability: Record<'identity' | 'finance' | 'sales' | 'commercialTerms' | 'orders' | 'contacts', CounterpartySectionAvailability> & Partial<Record<'organizationOptions' | 'payments' | 'upcomingPayments' | 'paymentDiscipline' | 'financialDocuments', CounterpartySectionAvailability>>;
  asOf: string;
  stale: boolean;
  sourceVersion: string;
};

export type CounterpartyCardParams = {
  counterpartyGuid: string;
  organizationGuid?: string | null;
  refresh?: boolean;
  preset?: CounterpartySalesPeriod;
  periodFrom?: string | null;
  periodTo?: string | null;
};
