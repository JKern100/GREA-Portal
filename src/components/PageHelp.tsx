"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/types";

interface HelpSection {
  heading: string;
  bullets: string[];
}

interface HelpEntry {
  title: string;
  intro: string;
  sections: HelpSection[];
  tip?: string;
}

// Match the most specific path first. Each entry is keyed by the page's
// canonical pathname; a `prefix` array lets a single entry cover nested
// routes (e.g. /admin and its dashboard variants).
const HELP_BY_PATH: Array<{ match: (p: string) => boolean; entry: HelpEntry }> = [
  {
    match: (p) => p === "/contacts",
    entry: {
      title: "Contacts",
      intro:
        "Cross-office contact directory. Search every office's contacts at once, filter by tag or sector, and request an intro from the broker who owns the relationship.",
      sections: [
        {
          heading: "Find contacts",
          bullets: [
            "Type any part of a name, account, or note in the search bar — fuzzy match runs across every office.",
            "Use the search-type pills (All Fields / Contact Name / Account Name) to scope the search.",
            "Toggle 'All contacts' / 'Shared only' to limit results to relationships owned by more than one office.",
            "Layer the tag and sector chips on top to narrow the list. Click a chip again to clear it."
          ]
        },
        {
          heading: "Request an intro",
          bullets: [
            "Every office row on a contact has Outlook and Gmail intro buttons — both draft the same prefilled email; pick whichever client you use.",
            "Use 'Report' next to it to flag a data issue back to the owning office.",
            "If a contact is marked confidential by the owning office, you'll see a placeholder instead of the details."
          ]
        }
      ],
      tip: "Hidden ('Confidential') contacts only appear to people in the owning office and to superadmins."
    }
  },
  {
    match: (p) => p === "/pipeline",
    entry: {
      title: "Pipeline",
      intro:
        "Cross-office deal pipeline. See every active deal across the firm, drill into the details, and report problems on a deal back to the owning office.",
      sections: [
        {
          heading: "Browse and filter",
          bullets: [
            "Use the Stage and Office dropdowns at the top to filter; totals above update with your selection.",
            "Search by deal name, seller / buyer, broker, property type, or address.",
            "Click a column header to sort; click again to reverse."
          ]
        },
        {
          heading: "Deal detail",
          bullets: [
            "Click 'View' on a row to open the deal modal: full party info, sector tags, OM link, and a stage-history timeline.",
            "Use 'Report' on a row to file feedback tied to that deal — useful for flagging stale data."
          ]
        }
      ],
      tip: "Confidential deals are hidden from people outside the owning office."
    }
  },
  {
    match: (p) => p === "/network",
    entry: {
      title: "GREA Network",
      intro:
        "A bird's-eye view of every office. One card per office shows headline counts, a freshness ring, and how the office compares to the largest in the firm.",
      sections: [
        {
          heading: "Reading a card",
          bullets: [
            "The colored badge is the office code; cards are sorted alphabetically and the order matches across the Contacts and Pipeline views.",
            "The ring reports days since the office last uploaded data to the portal — green is current, orange is due, red is stale.",
            "The bar shows the office's share of the largest office in the firm — by contact count in Contacts view, by total pipeline value in Pipeline view."
          ]
        },
        {
          heading: "Switch views",
          bullets: [
            "Use the Contacts / Pipeline toggle in the top right to swap the headline numbers and freshness source between the two data sets.",
            "The four stat tiles at the top recompute totals across whichever view is active."
          ]
        }
      ],
      tip: "Freshness is based on when records were uploaded to the portal, not the broker-entered 'List Date' on each row."
    }
  },
  {
    match: (p) => p === "/mailing-list",
    entry: {
      title: "Mailing List",
      intro:
        "Firm-wide mailing list with deduplication, opt-out tracking, and tag/sector filtering. Used to assemble target lists for cross-office outreach.",
      sections: [
        {
          heading: "Filter and search",
          bullets: [
            "Search by name, organization, email, title, city, state, or note; layer tag and sector filters on top.",
            "Opted-out recipients are hidden by default — tick 'Show opted-out' to include them in the list."
          ]
        },
        {
          heading: "Add or import",
          bullets: [
            "There is no inline add — entries can only be created via bulk import in Super Admin → Mailing List."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/feedback",
    entry: {
      title: "Feedback",
      intro:
        "The shared inbox for product feedback, bug reports, questions, and data-quality issues. Anyone can submit; office admins and superadmins triage.",
      sections: [
        {
          heading: "Submit",
          bullets: [
            "Click '+ Submit Feedback' at the top of this page (or the floating '+ Feedback' button on any other page) — the originating page URL is attached automatically.",
            "Pick a category (Bug / Suggestion / Question / Other), give it a title, and add details. Links to a specific contact or deal are filled in automatically when you arrived via a 'Report' button."
          ]
        },
        {
          heading: "Browse",
          bullets: [
            "Filter by status (Open / In Progress / Resolved / Closed) or category.",
            "Click an item to expand the thread and post a comment; office admins and superadmins also see status, category, and assignee dropdowns in the side panel."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/my-office",
    entry: {
      title: "My Office — Members",
      intro:
        "Your office's roster, plus a one-click invite form for new brokers.",
      sections: [
        {
          heading: "Roster",
          bullets: [
            "Each row is one member of your office. Use the Active toggle to deactivate someone who has left — they lose access on their next request.",
            "To edit a member's name, title, or specialties, open the row's actions menu (⋯) and select Edit details."
          ]
        }
      ],
      tip: "If a member forgets their password, open their row's actions menu (⋯) and select Reset password to generate a one-time recovery link to share."
    }
  },
  {
    match: (p) => p === "/my-office/contacts",
    entry: {
      title: "My Office — Contacts",
      intro:
        "Your office's contact roster. Bulk import, export, search, and per-record privacy controls.",
      sections: [
        {
          heading: "Bulk import / export",
          bullets: [
            "Export CSV / Export Excel — download every contact in your office, including a Broker Name column for reference.",
            "Download template — a CSV with an Instructions sheet describing each column the importer expects.",
            "Upload contacts — Add-on appends new rows; Replace deletes every existing contact (including hidden ones) before importing."
          ]
        },
        {
          heading: "Per-row controls",
          bullets: [
            "The 'Hide' checkbox marks a contact confidential — only your office and superadmins will see it across the portal.",
            "Use the filter input to narrow the visible list."
          ]
        },
        {
          heading: "Delete all",
          bullets: [
            "Wipes every contact in your office. You'll be asked to type DELETE to confirm. There's no undo."
          ]
        }
      ],
      tip: "Replace mode refuses to run if the upload has zero valid rows — that protects you from wiping the table with a bad file."
    }
  },
  {
    match: (p) => p === "/my-office/deals",
    entry: {
      title: "My Office — Pipeline",
      intro:
        "Your office's deal pipeline. Same bulk import / export workflow as Contacts, plus per-deal privacy controls.",
      sections: [
        {
          heading: "Bulk import / export",
          bullets: [
            "Export CSV / Export Excel — download every deal in your office.",
            "Download template — a CSV (Deal Name, Stage, List Date, etc.) with an Instructions sheet.",
            "Upload pipeline — Add-on appends new deals; Replace clears your office's pipeline first."
          ]
        },
        {
          heading: "Per-row controls",
          bullets: [
            "Mark a deal confidential to hide it from people outside your office.",
            "Filter by deal name, party, type, or assigned broker."
          ]
        }
      ],
      tip: "Broker Email in the upload must match a member of your office (case-insensitive). Unknown emails are reported as skipped rows."
    }
  },
  {
    match: (p) => p === "/admin",
    entry: {
      title: "Super Admin — Overview",
      intro:
        "Top-of-funnel snapshot for the whole firm: user counts, office counts, total contacts and deals at a glance.",
      sections: [
        {
          heading: "Use the sidebar",
          bullets: [
            "Users — invite, role-change, deactivate.",
            "Offices — create, rename, recolor.",
            "Activity — historical sign-ins.",
            "Settings — global configuration (network freshness thresholds, etc.).",
            "Contacts / Pipeline / Mailing List — firm-wide data with no office scope."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/admin/users",
    entry: {
      title: "Super Admin — Users",
      intro:
        "Manage every account in the portal: invite new people, change roles, assign offices, and deactivate accounts.",
      sections: [
        {
          heading: "Edit a user",
          bullets: [
            "Change a user's Office and Role with the dropdowns on their row, and use the Active toggle to enable or disable the account. Disabling an account returns the user to the sign-in screen on their next request; your own toggle is locked so you can't disable yourself.",
            "To edit a user's name, title, or specialties, open the row's actions menu (⋯) and select Edit details."
          ]
        },
        {
          heading: "Account status",
          bullets: [
            "The Status column shows whether an account has signed in (Registered) or is still on an unused invite (Pending), and flags any open password-reset request."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/admin/offices",
    entry: {
      title: "Super Admin — Offices",
      intro: "Create and manage offices.",
      sections: [
        {
          heading: "Create / edit",
          bullets: [
            "Each office has a short code (used as the badge) and a long name.",
            "Color is used for the office badge across the portal — pick something distinct from neighbors."
          ]
        }
      ],
      tip: "An office can only be deleted once it has zero contacts and zero deals — the button stays disabled until you reassign or remove them. Members of a deleted office are unassigned, not deleted."
    }
  },
  {
    match: (p) => p === "/admin/activity",
    entry: {
      title: "Super Admin — Sign-in Activity",
      intro:
        "Historical sign-in log for every user. Captured automatically by a database trigger on every successful auth session.",
      sections: [
        {
          heading: "Per user",
          bullets: [
            "One row per user with their total session count and most-recent sign-in.",
            "Click 'View history' to filter the lower table to that user's full sign-in history."
          ]
        },
        {
          heading: "History",
          bullets: [
            "Reverse-chronological list of every sign-in. Use the user dropdown or the text filter to narrow.",
            "Showing the most recent 2,000 sessions; older history is in the database if you need it."
          ]
        }
      ],
      tip: "Impersonation does not record a sign-in — only real auth sessions do."
    }
  },
  {
    match: (p) => p === "/admin/contacts",
    entry: {
      title: "Super Admin — Contacts",
      intro:
        "Firm-wide contacts table with no office scope. Bulk hide, unhide, or delete across offices.",
      sections: [
        {
          heading: "Filter and search",
          bullets: [
            "Filter by office and search by contact name, account, or broker — there are no tag or sector filters here.",
            "The header checkbox selects every visible row and unlocks the bulk action bar; columns are not click-to-sort."
          ]
        },
        {
          heading: "Bulk actions",
          bullets: [
            "Bulk-hide, unhide, or delete the selected rows; office reassignment is per-row via the inline office dropdown.",
            "Delete is confirmed before running — there is no undo."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/admin/deals",
    entry: {
      title: "Super Admin — Pipeline",
      intro:
        "Firm-wide deals table. Stage moves and bulk hide / unhide / delete across offices.",
      sections: [
        {
          heading: "Filter and edit",
          bullets: [
            "Filter by office or search by name / party / address / broker / property type.",
            "Stage is editable inline via the row's stage dropdown; other fields are read-only here — edit them in My Office → Pipeline."
          ]
        },
        {
          heading: "Bulk actions",
          bullets: [
            "Multi-select then bulk-hide, unhide, or delete — there is no bulk reassign."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/admin/mailing-list",
    entry: {
      title: "Super Admin — Mailing List",
      intro:
        "Firm-wide mailing list management: bulk import, dedupe by email, mark opt-outs, and tag/sector filtering.",
      sections: [
        {
          heading: "Import",
          bullets: [
            "Use the upload modal to import a CSV / XLSX. Replace mode by default only wipes the targeted office's entries; tick 'Replace ALL' to nuke every office's rows before importing.",
            "Skipped rows are reported with the reason (missing required fields, invalid date, etc.)."
          ]
        },
        {
          heading: "Cleanup",
          bullets: [
            "Filter by source office, sector, tag, or opt-out status, then bulk-delete the selected rows; per-row edits aren't available in this view.",
            "Address, city, state, ZIP, and country are optional — they're carried through to the CSV export but aren't used by any other feature today."
          ]
        }
      ]
    }
  },
  {
    match: (p) => p === "/admin/settings",
    entry: {
      title: "Super Admin — Settings",
      intro: "Global configuration that applies to every user.",
      sections: [
        {
          heading: "Network freshness",
          bullets: [
            "Set the day thresholds that turn the Network ring from green (current) → orange (due) → red (stale).",
            "Thresholds can differ for the Contacts and Pipeline views."
          ]
        }
      ]
    }
  }
];

// Detailed invite guidance, shown according to who's signed in. The two
// invite forms live on role-specific pages (Super Admin → Users and
// My Office → Members), so each block is injected only on its page and only
// for the matching role.
interface InviteHelp {
  sections: HelpSection[];
  tip: string;
}

const SUPERADMIN_INVITE: InviteHelp = {
  sections: [
    {
      heading: "Invite a user",
      bullets: [
        "In the Invite User panel, enter the person's email address (required) and, optionally, their name.",
        "Choose a Role (Broker, Office Admin, or Super Admin) and an Office. Brokers and office admins must be assigned to an office; super admins are not tied to one.",
        "Select Create Invite. The portal generates a secure, single-use sign-in link and displays it in the panel — no email is sent automatically.",
        "Select Copy link and send it to the recipient through Slack, email, or any other channel. They open the link, set a password on the Welcome screen, and are signed in."
      ]
    },
    {
      heading: "Resend an invite or reset a password",
      bullets: [
        "For a user who hasn't signed in yet (Pending), open their row's actions menu (⋯) and select Copy invite link to generate a fresh link.",
        "For a user who has already signed in (Registered), the actions menu offers Reset password instead, which creates a one-time recovery link to share."
      ]
    }
  ],
  tip: "Invite and reset links expire 24 hours after they are generated and can be used only once. If a link lapses, generate a new one."
};

const OFFICE_ADMIN_INVITE: InviteHelp = {
  sections: [
    {
      heading: "Invite a broker",
      bullets: [
        "In the Invite Broker panel, enter the broker's email address (required) and, optionally, their name.",
        "Select Send Invite. New brokers join your office automatically — the role and office are fixed, and only super admins can create office admins or super admins.",
        "The portal generates a secure, single-use sign-in link and displays it in the panel — no email is sent automatically. Select Copy link and send it to the broker. They open the link, set a password on the Welcome screen, and are signed in."
      ]
    },
    {
      heading: "Resend an invite",
      bullets: [
        "If a broker hasn't signed in yet (Pending), open their row's actions menu (⋯) and select Copy invite link to generate a fresh link to share.",
        "Invite links expire 24 hours after they are generated and can be used only once — generate a new one if a link lapses."
      ]
    }
  ],
  tip: "Invite links expire 24 hours after they are generated and can be used only once. If a link lapses, generate a new one."
};

// Prepend the role-appropriate invite sections to a page's help, preserving
// the page's own tip when it has one.
function withInvite(entry: HelpEntry, invite: InviteHelp): HelpEntry {
  return {
    ...entry,
    sections: [...invite.sections, ...entry.sections],
    tip: entry.tip ?? invite.tip
  };
}

function getHelp(pathname: string, role: UserRole | undefined): HelpEntry | null {
  let entry: HelpEntry | null = null;
  for (const { match, entry: e } of HELP_BY_PATH) {
    if (match(pathname)) {
      entry = e;
      break;
    }
  }
  if (!entry) return null;

  if (pathname === "/admin/users" && role === "superadmin") return withInvite(entry, SUPERADMIN_INVITE);
  if (pathname === "/my-office" && role === "office_admin") return withInvite(entry, OFFICE_ADMIN_INVITE);
  return entry;
}

export default function PageHelp({ role }: { role?: UserRole }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  // Close on Escape — matches the pattern of the other modals in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/login") || pathname.startsWith("/welcome")) return null;
  const help = getHelp(pathname, role);
  if (!help) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Help for this page"
        aria-label="Help for this page"
        style={{
          position: "fixed",
          right: 140,
          bottom: 20,
          zIndex: 150,
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "white",
          color: "var(--navy)",
          border: "1.5px solid var(--navy)",
          fontSize: 18,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, 'Times New Roman', serif"
        }}
      >
        ?
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="page-help-title"
            style={{ maxWidth: 640, padding: 0, overflow: "hidden" }}
          >
            <button
              className="modal-close"
              onClick={() => setOpen(false)}
              aria-label="Close help"
              style={{ color: "rgba(255,255,255,0.85)", top: 14, right: 16 }}
            >
              ×
            </button>

            <div
              style={{
                background: "linear-gradient(135deg, var(--navy) 0%, #2c3e6b 100%)",
                color: "white",
                padding: "22px 28px"
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  opacity: 0.7,
                  fontWeight: 600,
                  marginBottom: 4
                }}
              >
                Help
              </div>
              <div id="page-help-title" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                {help.title}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.9, marginTop: 8, marginBottom: 0 }}>
                {help.intro}
              </p>
            </div>

            <div style={{ padding: "20px 28px 24px", display: "grid", gap: 16 }}>
              {help.sections.map((s) => (
                <div
                  key={s.heading}
                  style={{
                    background: "var(--gray-50)",
                    border: "1px solid var(--gray-200)",
                    borderLeft: "3px solid var(--gold)",
                    borderRadius: 8,
                    padding: "12px 14px"
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      color: "var(--navy)",
                      marginBottom: 6
                    }}
                  >
                    {s.heading}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                    {s.bullets.map((b, i) => (
                      <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--gray-700)" }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {help.tip && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    background: "#fef9e7",
                    border: "1px solid #f0d97c",
                    borderRadius: 8,
                    padding: "10px 14px"
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      background: "#7c5e00",
                      color: "#fef9e7",
                      padding: "2px 7px",
                      borderRadius: 999,
                      lineHeight: 1.4,
                      marginTop: 1
                    }}
                  >
                    Tip
                  </span>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: "#7c5e00" }}>{help.tip}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
