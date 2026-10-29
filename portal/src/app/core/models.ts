// The shapes the API returns. Types only: nothing here exists at runtime.

export type Role = 'broker' | 'underwriter';
export type Branch = 21 | 23;
export type ClientType = 'person' | 'company';
export type RiskProfile = 'defensive' | 'neutral' | 'dynamic';
export type PolicyStatus = 'active' | 'surrendered' | 'matured';
export type RequestType = 'fund_switch' | 'partial_surrender' | 'extra_premium';
export type RequestStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  brokerId: number | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Allocation {
  fundId: number;
  percent: number;
}

export interface PolicyRequest {
  id: number;
  policyId: number;
  policyNumber: string;
  branch: Branch;
  clientId: number;
  clientName: string;
  brokerName: string;
  type: RequestType;
  payload: { amount?: number; iban?: string; allocations?: Allocation[] };
  status: RequestStatus;
  createdAt: string;
  createdByName: string;
  assignedToName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
}

export interface Policy {
  id: number;
  policyNumber: string;
  clientId: number;
  clientName: string;
  productCode: string;
  productName: string;
  branch: Branch;
  status: PolicyStatus;
  startDate: string;
  endDate: string | null;
  totalPremiums: number;
  currentValue: number;
}

export interface Dashboard {
  clients: number;
  activePolicies: number;
  assetsUnderManagement: number;
  reservesByBranch: { branch21: number; branch23: number };
  openRequests: number;
  maturities: Policy[];
  recentRequests: PolicyRequest[];
}

/** What the API sends back when something goes wrong: { error: { code, message, details? } } */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

/** One page of a list: { items, total, page, pageSize } */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Client {
  id: number;
  brokerId: number;
  type: ClientType;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  nationalNumber: string | null;
  companyName: string | null;
  companyNumber: string | null;
  email: string;
  phone: string | null;
  iban: string;
  city: string;
  language: 'fr' | 'nl' | 'en';
  riskProfile: RiskProfile | null;
  createdAt: string;
  policyCount?: number;
  totalValue?: number;
}

export interface ClientDetail extends Client {
  policies: Policy[];
  requests: PolicyRequest[];
}

export interface Product {
  id: number;
  code: string;
  name: string;
  branch: Branch;
  clientType: ClientType;
  guaranteedRate: number | null;
  entryFeeRate: number;
  managementFeeRate: number;
  minPremium: number;
  premiumTaxRate: number;
  description: string;
}

export interface FundHolding {
  fundId: number;
  isin: string;
  name: string;
  riskClass: number;
  units: number;
  nav: number;
  navDate: string;
  value: number;
  share: number;
}

export interface B21Year {
  year: number;
  guaranteedRate: number;
  profitSharingRate: number;
  reserve: number;
}

export interface PolicyDetail extends Policy {
  product: Product;
  branch21: { history: B21Year[] } | null;
  branch23: { funds: FundHolding[] } | null;
  requests: PolicyRequest[];
}

export interface Fund {
  id: number;
  isin: string;
  name: string;
  riskClass: number;
  currency: string;
  nav: number;
  navDate: string;
  change1y: number | null;
}
