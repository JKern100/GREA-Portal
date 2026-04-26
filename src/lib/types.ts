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
  color: string | null;
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
  /**
   * When a superadmin is impersonating another user, this holds the
   * superadmin's own profile. Undefined on real (non-impersonated) profiles.
   */
  _impersonatedBy?: Profile;
}

export interface ContactRecord {
  id: string;
  office_id: string;
  contact_name: string;
  account_name: string;
  broker_id: string | null;
  broker_name_snapshot: string;
  broker_phone_snapshot: string;
  contact_phone: string | null;
  contact_email: string | null;
  relationship_status: string | null;
  listing: string | null;
  note: string | null;
  tags: string[];
  sectors: string[];
  date_added: string;
  last_contact_date: string | null;
  is_confidential: boolean;
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
  property_type: string | null;
  seller_name: string | null;
  buyer_name: string | null;
  office_id: string;
  assigned_broker_id: string | null;
  assigned_broker_name: string;
  stage: DealStage;
  sub_status: DealSubStatus | null;
  deal_value: number | null;
  sectors: string[];
  notes: string | null;
  om_link: string | null;
  date_added: string | null;
  is_confidential: boolean;
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

export interface MailingListEntry {
  id: string;
  name: string;
  email: string | null;
  organization: string | null;
  title: string | null;
  phone: string | null;
  sectors: string[];
  tags: string[];
  notes: string | null;
  source_office_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type FeedbackCategory = "bug" | "suggestion" | "question" | "other";
export type FeedbackStatus = "open" | "in_progress" | "resolved" | "closed";

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["bug", "suggestion", "question", "other"];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ["open", "in_progress", "resolved", "closed"];

export interface FeedbackItem {
  id: string;
  title: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  submitted_by: string | null;
  assigned_to: string | null;
  related_contact_id: string | null;
  related_deal_id: string | null;
  context_url: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackComment {
  id: string;
  item_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

