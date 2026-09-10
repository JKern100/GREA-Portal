/**
 * Curated header aliases for the Import Mapper's auto-matcher.
 *
 * These are real column names seen in offices' CRM exports (HubSpot for PHL,
 * a Salesforce-style listing export for NYC/APA) that mean the same thing as
 * one of our template columns but don't match it by name. Matching one of
 * these counts as a confident match, not a guess — see
 * `docs/SPECS_IMPORT_MAPPER.md` §3.
 *
 * Deliberately NOT wired into `mapHeaders`: the importer stays strict so a
 * mis-named column is reported rather than silently absorbed. The mapper
 * shows the admin what it matched and lets them override it. If we ever want
 * the plain upload path to accept these too, that is a separate decision.
 *
 * Keys are template column keys. Values are matched case- and
 * punctuation-insensitively via `normaliseHeader`.
 */

export const CONTACT_HEADER_ALIASES: Record<string, string[]> = {
  contact_name: ["Name", "Full Name", "Contact", "Primary Contact", "Contact Full Name"],
  account_name: ["Company", "Company Name", "Account", "Organization", "Organisation", "Associated Company"],
  broker_email: ["Owner Email", "Contact Owner Email", "Salesperson Email", "Agent Email", "Broker Email Address"],
  broker_name: ["Owner", "Contact Owner", "Salesperson", "Agent", "Broker", "Record Owner"],
  broker_phone: ["Owner Phone", "Agent Phone"],
  contact_email: ["Email", "Email Address", "E-mail", "Primary Email"],
  contact_phone: ["Phone", "Phone Number", "Mobile", "Mobile Phone", "Primary Phone"],
  relationship_status: ["Status", "Lifecycle Stage", "Contact Status"],
  last_contact_date: ["Last Activity Date", "Last Contacted", "Last Activity", "Last Touch"],
  note: ["Notes", "Comments", "Description", "Background"],
  listing: ["Property", "Associated Listing"],
  tags: ["Tag", "Labels", "Categories"],
  sectors: ["Sector", "Asset Type", "Product Type"]
};

export const DEAL_HEADER_ALIASES: Record<string, string[]> = {
  deal_name: ["Listing", "Listing Name", "Opportunity", "Opportunity Name", "Property", "Property Name", "Campaign"],
  property_address: ["Address", "Street Address", "Property Address", "Location"],
  property_type: ["Type", "Asset Type", "Primary Property Type", "Product Type"],
  deal_value: ["Amount", "Price", "Asking Price", "Value", "List Price", "Campaign Price"],
  stage: ["Pipeline Stage", "Deal Stage", "Status", "Opportunity Stage"],
  sub_status: ["Won/Lost", "Outcome", "Result", "Close Reason"],
  broker_email: ["Owner Email", "Salesperson Email", "Agent Email", "Listing Agent Email"],
  broker_name: ["Owner", "Salesperson", "Agent", "Broker", "Listing Agent", "Record Owner"],
  seller_name: ["Seller", "Vendor"],
  buyer_name: ["Buyer", "Purchaser"],
  sectors: ["Sector", "Asset Class"],
  om_link: ["OM", "OM URL", "Offering Memorandum", "Setup Link", "Marketing Link"],
  date_added: ["List Date", "Date Added", "Listed", "Created Date", "Activity Date", "Listing Date"],
  notes: ["Note", "Comments", "Description", "Subtitle"]
};

export function aliasesFor(entity: "contacts" | "deals"): Record<string, string[]> {
  return entity === "contacts" ? CONTACT_HEADER_ALIASES : DEAL_HEADER_ALIASES;
}
