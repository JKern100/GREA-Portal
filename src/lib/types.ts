export type UserRole = "broker" | "office_admin" | "superadmin";
export type DealStage = "Lead" | "Listing" | "Contract" | "Closed";
export type DealSubStatus = "Won" | "Lost";

export const DEAL_STAGES: DealStage[] = ["Lead", "Listing", "Contract", "Closed"];

export const TAG_OPTIONS = [
  "Client",
  "Seller",
  "Active",
  "Buyer",
  "Lender",
  "Referral Source",
  "Other"
];

export const SECTOR_OPTIONS = [
  "Multifamily",
  "Affordable Housing",
  "Student Housing",
  "Capital Services",
  "General"
];

export interface Office {
  id: string;
  code: string;
  name: string;
  last_updated: string | null;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  title: string | null;
  phone: string | null;
  office_id: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface ContactRecord {
  id: string;
  office_id: string;
  contact_name: string;
  account_name: string;
  broker_id: string | null;
  broker_name_snapshot: string;
  broker_phone_snapshot: string;
  listing: string | null;
  note: string | null;
  tags: string[];
  sectors: string[];
  date_added: string;
  created_by: string | null;
  created_at: string;
  // joined
  office?: Office | null;
  broker?: Profile | null;
}

export interface DealRecord {
  id: string;
  deal_name: string;
  property_address: string;
  contact_name: string;
  account_name: string;
  office_id: string;
  assigned_broker_id: string | null;
  assigned_broker_name: string;
  stage: DealStage;
  sub_status: DealSubStatus | null;
  deal_value: number | null;
  sectors: string[];
  notes: string | null;
  om_link: string | null;
  created_by: string | null;
  created_at: string;
  office?: Office | null;
  stage_history?: DealStageHistory[];
}

export interface DealStageHistory {
  id: string;
  deal_id: string;
  stage: DealStage;
  note: string | null;
  occurred_on: string;
}

export interface SpecialtyTeam {
  id: string;
  name: string;
  description: string;
  color: string;
}

