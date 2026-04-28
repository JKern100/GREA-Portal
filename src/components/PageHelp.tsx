"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
            "Use the search-type pills (All / Contact / Account) to scope the search.",
            "Layer the tag and sector chips on top to narrow the list. Click a chip again to clear it."
          ]
        },
        {
          heading: "Request an intro",
          bullets: [
            "Click 'Request Intro' on a row to draft an email to the owning broker, prefilled with the contact's name and account.",
            "If a contact is marked confidential by the owning office, you'll see a placeholder instead of the details — you can still request an intro."
          ]
        },
        {
          heading: "Add a contact",
          bullets: [
            "Use 'Add Contact' to create a single contact owned by your office. For bulk uploads, use My Office → Contacts."
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
        "Cross-office deal pipeline. See every active deal across the firm, drill into stage history, and report problems on a deal back to the owning office.",
      sections: [
        {
          heading: "Browse and filter",
          bullets: [
            "Click a stage pill (Lead / Listing / Contract / Closed) to filter; the totals above update with your filters.",
            "Filter by office or search by deal name, party, broker, or address.",
            "Click any column header to sort; click again to reverse."
          ]
        },
        {
          heading: "Deal detail",
          bullets: [
            "Click a row to open the deal modal: full party info, sector tags, OM link, and a stage-history timeline.",
            "Use 'Report' on a deal to file feedback tied to that deal — useful for flagging stale data."
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
            "The bar shows the office's contact base as a share of the largest office's roster."
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
      tip: "Freshness is based on when records were uploaded to the portal, not the broker-entered 'Date Added' on each row."
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
            "Search by name, organization, or email; layer tag and sector filters on top.",
            "The opted-out toggle hides recipients who have unsubscribed."
          ]
        },
        {
          heading: "Add or import",
          bullets: [
            "Single entries can be added inline. For bulk uploads, superadmins can use Super Admin → Mailing List."
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
        "The shared inbox for product feedback, bug reports, questions, and data-quality issues. Anyone can submit; superadmins triage.",
      sections: [
        {
          heading: "Submit",
          bullets: [
            "Click '+ Feedback' (bottom right of any page) to open the submit form. The current page URL is captured automatically so the triage team has context.",
            "Pick a category (Bug / Suggestion / Question / Other) and optionally link the item to a contact or deal."
          ]
        },
        {
          heading: "Browse",
          bullets: [
            "Filter by status (Open / In Progress / Resolved / Closed) or category.",
            "Click an item to expand the thread, post a comment, or — if you're a superadmin — change status or assignment."
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
        "Your office's profile and roster. Office admins see and manage the people in their own office here.",
      sections: [
        {
          heading: "Roster",
          bullets: [
            "Each row is one member of your office. Click a row to update their name, title, phone, or specialties.",
            "Use the 'Active' toggle to deactivate someone who has left — they lose access on next request."
          ]
        },
        {
          heading: "Office settings",
          bullets: [
            "Set the office color used as the badge across the portal."
          ]
        }
      ],
      tip: "To add a brand-new user to your office, ask a superadmin — invitations come from Super Admin → Users."
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
            "Download template — the CSV/XLSX format the importer expects, with an Instructions sheet describing each column.",
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
            "Download template — the format the importer expects (Deal Name, Stage, Date Added, etc.) with an Instructions sheet.",
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
          heading: "Invite",
          bullets: [
            "Fill in the invite form. Brokers and office admins must be assigned to an office; superadmins are office-less.",
            "After sending, the page shows the invite URL. Copy and forward it if email delivery is delayed."
          ]
        },
        {
          heading: "Edit a user",
          bullets: [
            "Click a row to change name, title, phone, role, or office.",
            "The 'Active' toggle disables the account at the application layer — they're bounced to /login on next request. Your own row's toggle is locked so you can't deactivate yourself."
          ]
        },
        {
          heading: "Sign-in status",
          bullets: [
            "The status pill on each row tells you whether the account has ever signed in (versus sitting on an unused invite)."
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
      tip: "Deleting an office cascades to its contacts, deals, and member office_id (members are unassigned, not deleted)."
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
        "Firm-wide contacts table with no office scope. Bulk select, reassign, and delete across offices.",
      sections: [
        {
          heading: "Filter and search",
          bullets: [
            "Filter by office, broker, tag, or sector. Search runs across name, account, and note.",
            "Use the column headers to sort; the multi-select checkbox enables bulk actions."
          ]
        },
        {
          heading: "Bulk actions",
          bullets: [
            "Reassign selected contacts to a different broker or office.",
            "Delete with confirmation — there is no undo."
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
        "Firm-wide deals table. Move deals between stages, reassign brokers, and delete in bulk.",
      sections: [
        {
          heading: "Filter and edit",
          bullets: [
            "Filter by office or search by name / party / address.",
            "Click any cell to inline-edit; stage changes are recorded in deal_stage_history."
          ]
        },
        {
          heading: "Bulk actions",
          bullets: [
            "Multi-select then reassign or delete."
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
        "Firm-wide mailing list management: bulk import, dedupe by email, mark opt-outs, and tag/sector edits.",
      sections: [
        {
          heading: "Import",
          bullets: [
            "Use the upload modal to bring in a CSV / XLSX. Replace mode wipes the entire list before importing — handle with care.",
            "Skipped rows are reported with the reason (missing required fields, invalid date, etc.)."
          ]
        },
        {
          heading: "Cleanup",
          bullets: [
            "Filter by source office or opt-out status, then bulk-edit tags or delete.",
            "Address fields and country are optional but used by downstream geo-targeted exports."
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

function getHelp(pathname: string): HelpEntry | null {
  for (const { match, entry } of HELP_BY_PATH) {
    if (match(pathname)) return entry;
  }
  return null;
}

export default function PageHelp() {
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
  const help = getHelp(pathname);
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
