// Pure moderation policy: signals in, one decision out. No I/O, so every rule is unit tested.
// The engine applies a decision only in enforce mode; shadow mode just records it.
export const POLICY_VERSION = "2026-11-13.1";

export type Outcome = "approve" | "reject" | "hide" | "wait" | "escalate";
export type Reason = { signal: string; detail: string };
export type Decision = { outcome: Outcome; value?: string; reasons: Reason[]; retryAt?: number; policyVersion: string };

export type Evidence = "supported" | "contradicted" | "none";
export type Candidate = {
  value: string;
  /** Independent people (IP /24 or /48 groups, one Lookup person, one partner). */
  people: number;
  /** All people are from the partner key, which counts as one source and never alone. */
  partnerOnly: boolean;
  firstAt: number;
  spam: string | null;
};
export type PolicyInput = {
  field: string;
  current: unknown;
  claimed: boolean;
  /** True when the value was blank and the first contribution was already published. */
  appliedBlankFill: boolean;
  candidates: Candidate[];
  now: number;
  evidence?: Evidence;
  evidenceDetail?: string;
  /** name: similarity of proposed to current (0..1). */
  nameSimilarity?: number;
  /** address: distance in metres from the current pin to the geocoded proposal; null when it didn't geocode. */
  addressDistanceM?: number | null;
  /** denomination: agrees with what the church's name implies. */
  denominationMatchesName?: boolean;
  /** lists (languages, ministries): the proposal only adds entries. */
  listAddsOnly?: boolean;
  /** website proposals. */
  website?: { reachable: boolean; nameOnPage: boolean; parked: boolean; oldSiteGone: boolean; error?: string };
  /** reportClosed. */
  closure?: { siteDeadChecks: number; osmClosed: boolean; googleClosed: boolean; recentActivity: boolean };
  /** reportDuplicate. */
  duplicate?: { targetExists: boolean; distanceM: number | null; nameScore: number; sameAddress: boolean; reportedIsNewerOrThinner: boolean; eitherClaimed: boolean };
  /** homeCampusId. */
  campus?: { targetExists: boolean; distanceKm: number | null; sharesName: boolean };
};

const DAY = 86400000;
export const QUIET_MS = 3 * DAY;
const LOW_RISK = new Set(["phone", "serviceTimes", "denomination", "languages", "ministries"]);
const r = (signal: string, detail: string): Reason => ({ signal, detail });
const d = (outcome: Outcome, reasons: Reason[], extra: Partial<Decision> = {}): Decision => ({ outcome, reasons, policyVersion: POLICY_VERSION, ...extra });

/** The candidate a decision is about: most people, then oldest. Disputes are any other candidates. */
function lead(input: PolicyInput) {
  const sorted = [...input.candidates].sort((a, b) => b.people - a.people || a.firstAt - b.firstAt);
  return { top: sorted[0], disputed: sorted.length > 1 };
}

export function decide(input: PolicyInput): Decision {
  const { field, now } = input;
  const { top, disputed } = lead(input);
  if (!top) return d("wait", [r("empty", "No proposal is waiting.")], { retryAt: now + DAY });
  const v = top.value;
  if (top.spam) return d("reject", [r("spam", top.spam)], { value: v });

  // A published blank fill only needs to pass the spam check above.
  if (input.appliedBlankFill) return d("approve", [r("blank-fill", "Filled an empty field and passed the spam checks.")], { value: v });

  // Changing a claimed church's contact email moves ownership: always a person.
  if (field === "email" && input.claimed) return d("escalate", [r("ownership", "Changing a claimed church's contact email needs a reviewer.")], { value: v });

  const corroborated = top.people >= 2 && !top.partnerOnly && !disputed;
  const quiet = top.people >= 1 && !disputed && now - top.firstAt >= QUIET_MS;
  const supported = input.evidence === "supported";
  const contradicted = input.evidence === "contradicted";
  const evidenceNote = input.evidenceDetail ? `: ${input.evidenceDetail}` : "";

  switch (field) {
    case "phone":
    case "serviceTimes": {
      if (supported) return d("approve", [r("website", `The church website shows it${evidenceNote}`)], { value: v });
      if (contradicted && top.people === 1) return d("reject", [r("website", `The church website shows something different${evidenceNote}`)], { value: v });
      if (corroborated) return d("approve", [r("corroborated", `${top.people} people sent the same value.`)], { value: v });
      if (quiet) return d("approve", [r("quiet", "One person sent it 3+ days ago and nobody disagreed.")], { value: v });
      if (disputed) return d("escalate", [r("dispute", "People sent different values.")], { value: v });
      return d("wait", [r("waiting", "Waiting for website evidence, a second person, or 3 quiet days.")], { value: v, retryAt: top.firstAt + QUIET_MS });
    }
    case "denomination":
    case "languages":
    case "ministries": {
      if (disputed) return d("escalate", [r("dispute", "People sent different values.")], { value: v });
      if (field !== "denomination" && input.listAddsOnly === false) return d("escalate", [r("removal", "The change removes entries.")], { value: v });
      if (corroborated) return d("approve", [r("corroborated", `${top.people} people sent the same value.`)], { value: v });
      if (field === "denomination" && input.denominationMatchesName) return d("approve", [r("name-rule", "Matches what the church's name implies.")], { value: v });
      if (quiet) return d("approve", [r("quiet", "One person sent it 3+ days ago and nobody disagreed.")], { value: v });
      return d("wait", [r("waiting", "Waiting for a second person or 3 quiet days.")], { value: v, retryAt: top.firstAt + QUIET_MS });
    }
    case "pastorName":
      if (supported) return d("approve", [r("website", `The church website names them${evidenceNote}`)], { value: v });
      return d("escalate", [r("unverified", "The pastor's name isn't on the church website.")], { value: v });
    case "email":
      if (supported) return d("approve", [r("website", `The address is on the church website${evidenceNote}`)], { value: v });
      return d("escalate", [r("unverified", "The address isn't on the church website.")], { value: v });
    case "website": {
      const w = input.website;
      if (!w) return d("escalate", [r("unchecked", "The new website couldn't be checked.")], { value: v });
      if (!w.reachable || w.parked) return d("reject", [r("website", w.error || (w.parked ? "The new website looks parked or for sale." : "The new website can't be reached."))], { value: v });
      if (!w.nameOnPage) return d("escalate", [r("website", "The new website doesn't mention this church by name.")], { value: v });
      if (w.oldSiteGone || !input.current) return d("approve", [r("website", "The new site names this church and the old one is gone or redirects there.")], { value: v });
      return d("escalate", [r("website", "Both the old and new websites are live.")], { value: v });
    }
    case "name": {
      if (supported) return d("approve", [r("website", `The church website uses this name${evidenceNote}`)], { value: v });
      if ((input.nameSimilarity ?? 0) >= 0.8) return d("approve", [r("small-fix", "A small correction to the existing name.")], { value: v });
      return d("escalate", [r("rename", "A new name needs a reviewer.")], { value: v });
    }
    case "address": {
      if (input.addressDistanceM == null) return d("escalate", [r("geocode", "The new address couldn't be found on the map.")], { value: v });
      if (input.addressDistanceM <= 150) return d("approve", [r("nearby", `The new address is ${Math.round(input.addressDistanceM)} m from the current pin.`)], { value: v });
      if (supported) return d("approve", [r("website", `The church website shows this address${evidenceNote}`)], { value: v });
      return d("escalate", [r("moved", `The new address is ${Math.round(input.addressDistanceM)} m away, which may be a move.`)], { value: v });
    }
    case "reportClosed": {
      const c = input.closure;
      const strong = !!c && (c.siteDeadChecks >= 2 || c.osmClosed || c.googleClosed) && !c.recentActivity;
      if (top.people >= 2 && strong) {
        const why = c!.googleClosed ? "Google lists it as permanently closed" : c!.osmClosed ? "OpenStreetMap marks it closed" : "its website has been down on two checks a day apart";
        return d("hide", [r("closure", `${top.people} people reported it closed, ${why}, and nothing confirmed it in 30 days.`)], { value: v });
      }
      if (now - top.firstAt >= 21 * DAY) return d("escalate", [r("closure", "Not enough evidence after 21 days.")], { value: v });
      return d("wait", [r("closure", "Waiting for more reports or evidence it closed.")], { value: v, retryAt: now + DAY });
    }
    case "reportDuplicate": {
      const x = input.duplicate;
      if (!x || !x.targetExists) return d("reject", [r("duplicate", "The listing it duplicates doesn't exist.")], { value: v });
      const near = x.distanceM != null && x.distanceM <= 100;
      if (near && (x.nameScore >= 0.85 || x.sameAddress) && x.reportedIsNewerOrThinner && !x.eitherClaimed) {
        return d("hide", [r("duplicate", `Same church ${Math.round(x.distanceM!)} m apart; hiding the newer or less complete listing.`)], { value: v });
      }
      return d("escalate", [r("duplicate", "Not clearly the same church.")], { value: v });
    }
    case "reportRelocated":
      return d("escalate", [r("move", "Moves always go to a reviewer.")], { value: v });
    case "reportOutOfScope":
      return d("escalate", [r("scope", "Scope reports always go to a reviewer.")], { value: v });
    case "homeCampusId": {
      const c = input.campus;
      if (!c || !c.targetExists) return d("reject", [r("campus", "The main campus listing doesn't exist.")], { value: v });
      if (c.distanceKm != null && c.distanceKm <= 50 && c.sharesName) return d("approve", [r("campus", "A nearby listing with a shared name.")], { value: v });
      return d("escalate", [r("campus", "Not clearly the same church family.")], { value: v });
    }
    case "attendance":
      return d("escalate", [r("attendance", "Attendance changes go to a reviewer.")], { value: v });
    default:
      return LOW_RISK.has(field) ? d("wait", [], { value: v, retryAt: now + DAY }) : d("escalate", [r("unknown", "No rule for this field.")], { value: v });
  }
}

// ── Deterministic spam checks, run before anything else ──
const PROFANITY = /\b(f+u+c+k+|s+h+i+t+|b+i+t+c+h+|c+u+n+t+|porn|viagra|casino|crypto ?airdrop|loan offer)\b/i;
const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|cn|top|info)\b/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/;
export function spamReason(field: string, value: string): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  if (PROFANITY.test(v)) return "Contains blocked words.";
  if (/(.)\1{7,}/.test(v)) return "Repeated characters.";
  if (/[\u{1F300}-\u{1FAFF}]{3,}/u.test(v)) return "A run of emoji.";
  const textField = ["name", "pastorName", "denomination", "languages", "ministries"].includes(field);
  if (textField && URL_RE.test(v)) return "A link in a text field.";
  if (textField && EMAIL_RE.test(v)) return "Contact details in a text field.";
  if (["name", "pastorName", "denomination"].includes(field) && PHONE_RE.test(v)) return "A phone number in a text field.";
  if (field === "name" && v.length > 20 && v === v.toUpperCase() && /[A-Z]{12,}/.test(v)) return "Shouting in the name.";
  if (field === "website" && /\.example(\/|$)|bit\.ly|tinyurl|t\.co\//i.test(v)) return "A placeholder or shortened link.";
  return null;
}
