import type { Church, HomeCampusSummary } from "./church-data";
import { getSizeCategory, getDenominationGroup, estimateBilingualProbability, getFallbackLocation } from "./church-data";
import {
  Church as ChurchIcon,
  Users,
  Globe,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  Search,
  Pencil,
  Clock,
  Languages,
  Heart,
  User,
  Phone,
  Mail,
  ShieldCheck,
  Shield,
  ThumbsDown,
  ThumbsUp,
  Building2,
  Home,
  X,
} from "lucide-react";
import { ThreeDotLoader } from "./ThreeDotLoader";
import { useState, useMemo, useEffect, useRef, useOptimistic, useTransition } from "react";
import { motion } from "motion/react";
import { SuggestEditForm } from "./SuggestEditForm";
import { CloseButton } from "./ui/close-button";
import { groupServiceTimesByDay, parseServiceTimesForDisplay } from "./ServiceTimesInput";
import { formatFullAddress } from "./AddressInput";
import { formatModerationDisplayValue } from "./formatModerationValue";
import { formatPhoneDisplay } from "./ui/utils";
import { withSiteRef } from "./url-utils";
import { confirmChurchData, fetchCorrectionHistory, fetchReactions, submitReaction, moderateApproveSuggestion, moderateRejectSuggestion } from "./api";
import type { CorrectionHistoryEntry, ReactionType, ReactionCounts, PendingSuggestionItem } from "./api";

/** Church or minimal summary for cross-state main campus link; both have state and shortId for navigation. */
export type ChurchClickTarget = Church | HomeCampusSummary;

const PENDING_FIELD_LABELS: Record<string, string> = {
  name: "Church name",
  website: "Website",
  address: "Address",
  reportClosed: "Church has closed or doesn't exist anymore",
  attendance: "Attendance",
  denomination: "Denomination",
  serviceTimes: "Service times",
  languages: "Languages",
  ministries: "Ministries",
  pastorName: "Pastor name",
  phone: "Phone",
  email: "Email",
  homeCampusId: "Main campus link",
};

interface ChurchDetailPanelProps {
  church: Church;
  allChurches: Church[];
  onClose: () => void;
  onChurchClick: (target: ChurchClickTarget) => void;
  externalShowEditForm?: boolean;
  onEditFormClosed?: () => void;
  onChurchUpdated?: () => void;
  moderationMode?: boolean;
  moderationPending?: { pendingSuggestions: import("./api").PendingSuggestionItem[] } | null;
  moderatorKey?: string;
  onModerationAction?: () => void;
  /** Field names with pending suggestions (for this church) — shown to all visitors */
  pendingFieldsForChurch?: string[];
  /** Called when user submits an edit that needs moderation (so we refetch pending list) */
  onPendingSubmitted?: () => void;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Haversine distance in miles
function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fun denomination facts
const DENOMINATION_FACTS: Record<string, string> = {
  Catholic:
    "The Catholic Church is the largest Christian church worldwide, with over 1.3 billion members globally.",
  Baptist:
    "Baptist churches emphasize believer's baptism by immersion and the autonomy of local congregations.",
  Methodist:
    "Founded by John Wesley in the 18th century, Methodism emphasizes personal holiness and social justice.",
  Lutheran:
    "Lutheranism traces back to Martin Luther's 95 Theses in 1517, sparking the Protestant Reformation.",
  Presbyterian:
    "Presbyterians are governed by elders (presbyters) and trace their roots to John Calvin and John Knox.",
  Episcopal:
    "The Episcopal Church is part of the worldwide Anglican Communion, blending Catholic and Protestant traditions.",
  Pentecostal:
    "Pentecostalism, born from the Azusa Street Revival of 1906, emphasizes gifts of the Holy Spirit.",
  "Assemblies of God":
    "The AG is the world's largest Pentecostal denomination, with over 69 million adherents worldwide.",
  "Non-denominational":
    "Non-denominational churches are independently governed and often focus on contemporary worship styles.",
  "Latter-day Saints":
    "The Church of Jesus Christ of Latter-day Saints was founded by Joseph Smith in 1830 in New York.",
  "Church of Christ":
    "Churches of Christ practice a cappella worship and seek to restore New Testament Christianity.",
  Orthodox:
    "Eastern Orthodoxy traces an unbroken line back to the apostles, with rich liturgical traditions.",
  "Seventh-day Adventist":
    "Adventists worship on Saturday (the seventh day) and emphasize health and the Second Coming of Christ.",
  Evangelical:
    "Evangelical churches emphasize the authority of Scripture, personal conversion, and sharing the Gospel.",
  "Disciples of Christ":
    "The Christian Church (Disciples of Christ) was born from the American Restoration Movement in the early 1800s, emphasizing unity among Christians.",
  "Church of God":
    "Church of God denominations emerged from the Holiness movement, with the largest being the Church of God (Cleveland, TN) founded in 1886.",
  "Quaker":
    "The Religious Society of Friends (Quakers) was founded by George Fox in 1650s England, known for silent worship and peace testimony.",
  "Mennonite":
    "Mennonites trace their origins to the Anabaptist movement of the 1500s and are named after Menno Simons, emphasizing pacifism and community.",
  "Salvation Army":
    "Founded in 1865 by William Booth in London, the Salvation Army is known for its charitable work and military-style organization.",
};

// Renders time string with a blinking colon (e.g. "9:30 AM" -> "9 : 30 AM")
function TimeWithBlinkingColon({ time }: { time: string }) {
  const colonIndex = time.indexOf(":");
  if (colonIndex === -1) return <>{time}</>;
  const before = time.slice(0, colonIndex);
  const after = time.slice(colonIndex + 1);
  return (
    <>
      {before}
      <span className="animate-colon-blink inline-block w-[0.25em] text-center mx-[2px]" aria-hidden>
        :
      </span>
      {after}
    </>
  );
}

const STATE_TIMEZONE: Record<string, string> = {
  AL: "CST", AK: "AKST", AZ: "MST", AR: "CST", CA: "PST",
  CO: "MST", CT: "EST", DE: "EST", FL: "EST", GA: "EST",
  HI: "HST", ID: "MST", IL: "CST", IN: "EST", IA: "CST",
  KS: "CST", KY: "EST", LA: "CST", ME: "EST", MD: "EST",
  MA: "EST", MI: "EST", MN: "CST", MS: "CST", MO: "CST",
  MT: "MST", NE: "CST", NV: "PST", NH: "EST", NJ: "EST",
  NM: "MST", NY: "EST", NC: "EST", ND: "CST", OH: "EST",
  OK: "CST", OR: "PST", PA: "EST", RI: "EST", SC: "EST",
  SD: "CST", TN: "CST", TX: "CST", UT: "MST", VT: "EST",
  VA: "EST", WA: "PST", WV: "EST", WI: "CST", WY: "MST",
  DC: "EST",
};

function ServiceTimesCard({ serviceTimes, state }: { serviceTimes: string; state?: string }) {
  const grouped = groupServiceTimesByDay(parseServiceTimesForDisplay(serviceTimes));
  return (
    <div className="rounded-xl p-3 bg-white/5 border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <Clock size={16} className="text-purple-400" />
        <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
          Service Times
          {state && STATE_TIMEZONE[state.toUpperCase()] && (
            <span className="ml-1 normal-case tracking-normal text-white/25">({STATE_TIMEZONE[state.toUpperCase()]})</span>
          )}
        </span>
        {grouped.length > 1 && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400/70 font-medium">
            {grouped.reduce((sum, g) => sum + g.services.length, 0)} services
          </span>
        )}
      </div>
      {grouped.length > 0 ? (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.day} className="flex items-baseline gap-3">
              <span className="text-white/50 text-sm font-semibold flex-shrink-0">
                {group.dayFull.slice(0, 3)}
              </span>
              <div className="flex flex-wrap gap-2">
                {group.services.map((svc, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-500/10 text-white/80 border border-purple-500/10 tabular-nums"
                  >
                    <TimeWithBlinkingColon time={svc.time} />
                    {svc.label && (
                      <span className="text-white/55 ml-1.5 text-xs">
                        {svc.label}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white text-sm leading-relaxed">{serviceTimes}</p>
      )}
    </div>
  );
}

// Helper to render the language estimate card (condensed)
function LanguageEstimateCard({ bilingualInfo }: { bilingualInfo: { probability: number; detectedLanguage?: string; confirmed: boolean } }) {
  const pct = Math.round(bilingualInfo.probability * 100);
  const barWidth = Math.max(pct, 2);
  let barColor = "#fde68a";
  if (bilingualInfo.probability >= 0.7) barColor = "#f59e0b";
  else if (bilingualInfo.probability >= 0.4) barColor = "#fbbf24";
  else if (bilingualInfo.probability >= 0.15) barColor = "#fcd34d";

  const label = bilingualInfo.probability === 0
    ? "English only (likely)"
    : bilingualInfo.detectedLanguage
      ? `Likely ${bilingualInfo.detectedLanguage}`
      : "Possibly bilingual";

  return (
    <div className="rounded-lg px-3.5 py-2.5 bg-amber-500/5 border border-amber-500/10">
      <div className="flex items-center gap-2">
        <Languages size={14} className="text-amber-400 flex-shrink-0" />
        <span className="text-xs text-white/50 font-medium">{label}</span>
        <span className="text-white/40 text-xs font-semibold tabular-nums ml-auto">{pct}%</span>
        <span className={`text-[10px] px-1 py-px rounded font-semibold ${
          bilingualInfo.confirmed
            ? "bg-green-500/15 text-green-400/80"
            : "bg-amber-500/15 text-amber-400/70"
        }`}>
          {bilingualInfo.confirmed ? "CONFIRMED" : "EST"}
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1.5">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${barWidth}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

export function ChurchDetailPanel({
  church,
  allChurches,
  onClose,
  onChurchClick,
  externalShowEditForm,
  onEditFormClosed,
  onChurchUpdated,
  moderationMode,
  moderationPending,
  moderatorKey,
  onModerationAction,
  pendingFieldsForChurch = [],
  onPendingSubmitted,
}: ChurchDetailPanelProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editFocusField, setEditFocusField] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [correctionHistory, setCorrectionHistory] = useState<CorrectionHistoryEntry[]>([]);
  const [reactionsLoading, setReactionsLoading] = useState(true);
  const [serverReactionState, setServerReactionState] = useState<{
    counts: ReactionCounts;
    myReaction: ReactionType | null;
  }>({ counts: { not_for_me: 0, like: 0, love: 0 }, myReaction: null });
  const [optimisticReactionState, addOptimisticReaction] = useOptimistic(
    serverReactionState,
    (current, pendingReaction: ReactionType) => {
      const isToggle = current.myReaction === pendingReaction;
      const newCounts = { ...current.counts };
      if (isToggle) {
        newCounts[pendingReaction] = Math.max(0, newCounts[pendingReaction] - 1);
        return { counts: newCounts, myReaction: null };
      }
      if (current.myReaction) {
        newCounts[current.myReaction] = Math.max(0, newCounts[current.myReaction] - 1);
      }
      newCounts[pendingReaction]++;
      return { counts: newCounts, myReaction: pendingReaction };
    }
  );
  const { counts, myReaction } = optimisticReactionState;
  const [reactionAnimKeys, setReactionAnimKeys] = useState({ not_for_me: 0, like: 0, love: 0 });
  const [isReacting, startReactionTransition] = useTransition();
  const [reactionError, setReactionError] = useState(false);
  const hasSubmittedReaction = useRef(false);
  const sizeCat = getSizeCategory(church.attendance);
  const denomGroup = getDenominationGroup(church.denomination);
  const bilingualInfo = estimateBilingualProbability(church);

  // Count missing extended fields to encourage contributions (phone and email are optional, not counted)
  const missingFieldCount = [
    !church.serviceTimes,
    !church.languages || church.languages.length === 0,
    !church.ministries || church.ministries.length === 0,
    !church.pastorName,
  ].filter(Boolean).length;

  // Other campuses (same state): churches that list this one as their main
  const otherCampuses = useMemo(() => {
    return allChurches.filter((c) => c.homeCampusId === church.id);
  }, [church.id, allChurches]);

  // Main campus: same-state from list, cross-state from API homeCampus
  const mainCampusSameState = useMemo(() => {
    if (!church.homeCampusId) return null;
    return allChurches.find((c) => c.id === church.homeCampusId) ?? null;
  }, [church.homeCampusId, allChurches]);
  const mainCampusCrossState = church.homeCampusId && church.homeCampus ? church.homeCampus : null;

  // Get nearby churches
  const nearbyChurches = useMemo(() => {
    return allChurches
      .filter((c) => c.id !== church.id)
      .map((c) => ({
        ...c,
        distance: distanceMiles(church.lat, church.lng, c.lat, c.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [church, allChurches]);

  // Same denomination churches nearby
  const sameDenomCount = useMemo(() => {
    return allChurches.filter(
      (c) =>
        c.id !== church.id &&
        getDenominationGroup(c.denomination) === denomGroup
    ).length;
  }, [church, allChurches, denomGroup]);

  const hasAddressOrCity = church.address?.trim() || church.city?.trim();
  const fullAddress = hasAddressOrCity
    ? formatFullAddress(church.address, church.city, church.state)
    : (getFallbackLocation(church) || "");

  const handleCopyAddress = () => {
    if (fullAddress) {
      navigator.clipboard.writeText(fullAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  // Reset edit form when church changes
  const prevChurchIdRef = useRef(church.id);
  useEffect(() => {
    if (church.id !== prevChurchIdRef.current) {
      setShowEditForm(false);
      prevChurchIdRef.current = church.id;
    }
  }, [church.id]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [church.id]);

  // React to external trigger to show edit form
  useEffect(() => {
    if (externalShowEditForm) {
      setShowEditForm(true);
      onEditFormClosed?.();
    }
  }, [externalShowEditForm]);

  // Fetch correction history
  useEffect(() => {
    setCorrectionHistory([]);
    setConfirmed(false);
    fetchCorrectionHistory(church.id)
      .then((data) => setCorrectionHistory(data.history))
      .catch(() => {});
  }, [church.id]);

  // Reset "submitted reaction" flag when church changes so next fetch applies
  useEffect(() => {
    hasSubmittedReaction.current = false;
  }, [church.id]);

  // Fetch reactions
  useEffect(() => {
    setReactionsLoading(true);
    setReactionError(false);
    setServerReactionState({ counts: { not_for_me: 0, like: 0, love: 0 }, myReaction: null });
    fetchReactions(church.id)
      .then((data) => {
        if (!hasSubmittedReaction.current) {
          setServerReactionState({ counts: data.counts, myReaction: data.myReaction });
        }
      })
      .catch((err) => {
        console.error("Failed to fetch reactions:", err);
        setReactionError(true);
      })
      .finally(() => setReactionsLoading(false));
  }, [church.id]);

  const handleConfirmData = async () => {
    setConfirming(true);
    try {
      await confirmChurchData(church.id);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
    } catch (err) {
      console.error("Failed to confirm:", err);
    } finally {
      setConfirming(false);
    }
  };

  const handleReaction = (reaction: ReactionType) => {
    setReactionAnimKeys((k) => ({ ...k, [reaction]: k[reaction] + 1 }));
    hasSubmittedReaction.current = true;
    setReactionError(false);

    startReactionTransition(async () => {
      addOptimisticReaction(reaction);
      try {
        const res = await submitReaction(church.id, reaction);
        setServerReactionState({
          counts: res.counts,
          myReaction: res.myReaction ?? null,
        });
      } catch (err) {
        console.error("Failed to submit reaction:", err);
        setReactionError(true);
      }
    });
  };

  if (showEditForm) {
    return (
      <SuggestEditForm
        church={church}
        allChurches={allChurches}
        onClose={() => { setShowEditForm(false); setEditFocusField(null); }}
        focusField={editFocusField}
        onChurchUpdated={onChurchUpdated}
        onPendingSubmitted={onPendingSubmitted}
        pendingFieldsForChurch={pendingFieldsForChurch}
      />
    );
  }

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    church.name + " " + fullAddress
  )}`;

  return (
    <div
      className="h-full flex flex-col overflow-hidden rounded-[20px]"
      style={{
        backgroundColor: "#1E1040",
        fontFamily: "'Livvic', sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-xl leading-tight line-clamp-2 text-pretty">
              {church.name}
            </h2>
            {(church.homeCampusId || otherCampuses.length > 0 || fullAddress) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {church.homeCampusId && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-purple-500/25 text-purple-300 border border-purple-500/30">
                    Campus
                  </span>
                )}
                {otherCampuses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => document.getElementById("other-campuses")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-purple-500/25 text-purple-300 border border-purple-500/30 hover:bg-purple-500/35 transition-colors cursor-pointer"
                  >
                    Multiple Campuses
                  </button>
                )}
                {fullAddress && (
                  <p className="text-white/50 text-sm leading-relaxed text-balance">
                    {fullAddress}
                  </p>
                )}
              </div>
            )}
          </div>
          <CloseButton onClick={onClose} size="lg" className="-mt-2" />
        </div>

        {/* Updates pending review — visible to all visitors (not only moderators) */}
        {!moderationMode && pendingFieldsForChurch.length > 0 && (
          <div className="flex items-center gap-2 mt-3 py-2 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Clock size={14} className="text-amber-400 flex-shrink-0" />
            <p className="text-amber-200/90 text-xs">
              Updates to {pendingFieldsForChurch.map((f) => PENDING_FIELD_LABELS[f] ?? f).join(", ")} are pending review and will appear once approved.
            </p>
          </div>
        )}

        {/* Quick action buttons */}
        <div className="flex gap-2 mt-3">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white bg-purple-700/60 hover:bg-purple-700/80 transition-colors"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)" }}
          >
            <Navigation size={14} />
            Directions
          </a>
          {church.website ? (
            <a
              href={withSiteRef(
                church.website.startsWith("http")
                  ? church.website
                  : `https://${church.website}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)" }}
            >
              <Globe size={14} />
              Website
              <ExternalLink size={12} className="text-white/40" />
            </a>
          ) : (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(church.name + " " + (church.city || "") + " " + church.state + " church website")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)" }}
            >
              <Search size={14} />
              Find Website
            </a>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Reaction bar (Netflix-style thumbs) — above service times */}
        {!reactionsLoading && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              How do you feel about this church?
            </span>
            <div className="flex gap-2">
              {(
                [
                  {
                    reaction: "not_for_me" as ReactionType,
                    label: "Not for me",
                    Icon: ThumbsDown,
                    animate: { x: [0, -4, 4, -3, 3, 0] },
                    transition: { duration: 0.4 },
                  },
                  {
                    reaction: "like" as ReactionType,
                    label: "I like it",
                    Icon: ThumbsUp,
                    animate: { scale: [1, 1.3, 0.95, 1.05, 1] },
                    transition: { duration: 0.4 },
                  },
                  {
                    reaction: "love" as ReactionType,
                    label: "I love it",
                    Icon: Heart,
                    animate: { scale: [1, 1.4, 1], rotate: [0, -10, 10, -5, 0] },
                    transition: { duration: 0.5 },
                  },
                ] as const
              ).map(({ reaction, label, Icon, animate, transition }) => {
                const isSelected = myReaction === reaction;
                const restState = reaction === "love" ? { scale: 1, rotate: 0 } : reaction === "like" ? { scale: 1 } : { x: 0 };
                return (
                  <motion.button
                    key={reaction}
                    type="button"
                    onClick={() => handleReaction(reaction)}
                    disabled={isReacting}
                    className={`group flex-1 flex flex-col items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors min-w-0 ${
                      isSelected
                        ? "bg-purple-600 border-purple-600 text-white"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80"
                    }`}
                  >
                    <motion.span
                      key={reactionAnimKeys[reaction]}
                      initial={false}
                      animate={reactionAnimKeys[reaction] > 0 ? animate : restState}
                      transition={transition}
                      className={`inline-flex items-center justify-center transition-all duration-200 ${
                        isSelected
                          ? "fill-white stroke-white"
                          : "fill-white stroke-white group-hover:fill-purple-400 group-hover:stroke-purple-400 group-hover:scale-110 group-hover:rotate-6"
                      }`}
                    >
                      <Icon size={20} strokeWidth={1.5} className="fill-inherit stroke-inherit" />
                    </motion.span>
                    <span className="text-sm font-medium truncate w-full text-center">
                      {label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
            {/* Overall summary from reactions */}
            {(() => {
              const total = counts.not_for_me + counts.like + counts.love;
              const dominant =
                counts.love >= counts.like && counts.love >= counts.not_for_me
                  ? "love"
                  : counts.like >= counts.not_for_me
                    ? "like"
                    : "not_for_me";
              const message =
                total === 0
                  ? "No reactions yet"
                  : dominant === "love"
                    ? "Overall people love this church."
                    : dominant === "like"
                      ? "Overall people like this church."
                      : "Reactions are mixed.";
              return (
                <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/10">
                  <p className="text-white/70 text-sm font-medium text-center">{message}</p>
                </div>
              );
            })()}
            {reactionError && (
              <p className="text-red-400/80 text-xs">Failed to save — check your connection and try again.</p>
            )}
          </div>
        )}

        {/* Primary: Service Times first */}
        {church.serviceTimes && (
          <ServiceTimesCard serviceTimes={church.serviceTimes} state={church.state} />
        )}

        {/* Primary: Core stats — 2-col grid for attendance + denomination */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <Users size={13} className="text-purple-400 flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">Attendance*</span>
            </div>
            <div className="text-white text-base font-semibold">~{church.attendance.toLocaleString()}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sizeCat.color }} />
              <span className="text-white/50 text-xs">{sizeCat.label}</span>
            </div>
            <div className="text-white/35 text-[10px] mt-1">* Estimated weekly number</div>
          </div>
          <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <ChurchIcon size={13} className="text-purple-400 flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">Denomination</span>
            </div>
            <div className="text-white text-base font-medium">{church.denomination === "Other" || church.denomination === "Unknown" ? "Unspecified" : church.denomination}</div>
            <div className="text-white/40 text-xs mt-0.5">{sameDenomCount.toLocaleString()} similar in state</div>
          </div>
        </div>

        {/* Languages — single language: simple line with icon; multiple: badges */}
        {church.languages && church.languages.length > 0 && (
          church.languages.length === 1 ? (
            <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/10 flex items-center gap-2">
              <Languages size={14} className="text-purple-400 flex-shrink-0" />
              <span className="text-sm text-white/90">{church.languages[0]}</span>
            </div>
          ) : (
            <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/10 flex items-center gap-2">
              <Languages size={14} className="text-purple-400 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
                {church.languages.map((lang) => (
                  <span key={lang} className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )
        )}

        {/* Bilingual estimate — only when language not confirmed */}
        {!bilingualInfo.confirmed && (
          <LanguageEstimateCard bilingualInfo={bilingualInfo} />
        )}

        {/* Secondary: Ministries (compact) */}
        {church.ministries && church.ministries.length > 0 && (
          <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/5">
            <div className="flex items-center gap-2 mb-1.5">
              <Heart size={14} className="text-purple-400 flex-shrink-0" />
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Ministries</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {church.ministries.map((m) => (
                <span key={m} className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/8 text-white/60 border border-white/8">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Secondary: Contact (compact) */}
        {(church.pastorName || church.phone || church.email) && (
          <div className="rounded-lg px-3 py-2.5 bg-white/5 border border-white/5">
            <div className="flex items-center gap-2 mb-1.5">
              <User size={14} className="text-purple-400 flex-shrink-0" />
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Contact</span>
            </div>
            <div className="space-y-1">
              {church.pastorName && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-white/50 text-xs">{(church.homeCampusId || church.homeCampus) ? "Campus Pastor" : "Lead Pastor"}</span>
                  <span className="text-white text-sm font-medium truncate">{church.pastorName}</span>
                </div>
              )}
              {church.phone && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-white/50 text-xs flex items-center gap-1"><Phone size={11} /> Phone</span>
                  <a href={`tel:${church.phone}`} className="text-purple-300 text-sm font-medium hover:text-purple-200 transition-colors truncate">{formatPhoneDisplay(church.phone)}</a>
                </div>
              )}
              {church.email && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-white/50 text-xs flex items-center gap-1"><Mail size={11} /> Email</span>
                  <a href={`mailto:${church.email}`} className="text-purple-300 text-sm font-medium hover:text-purple-200 transition-colors truncate">{church.email}</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inline review: pending changes for this church */}
        {moderationMode && moderationPending && (() => {
          const pendingForChurch = moderationPending.pendingSuggestions.filter(s => s.churchId === church.id);
          if (pendingForChurch.length === 0) return null;
          return (
            <InlineModerationSection
              items={pendingForChurch}
              moderatorKey={moderatorKey || ""}
              onAction={onModerationAction}
            />
          );
        })()}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {/* Data looks correct */}
          <button
            onClick={handleConfirmData}
            disabled={confirming || confirmed}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/15 transition-colors group disabled:opacity-70"
          >
            {confirmed ? (
              <>
                <Check size={15} className="text-green-400" />
                <span className="text-green-400 text-sm font-medium">Data confirmed, thank you!</span>
              </>
            ) : (
              <>
                <ShieldCheck size={15} className="text-green-400 group-hover:text-green-300 transition-colors" />
                <span className="text-green-300 text-sm font-medium group-hover:text-green-200 transition-colors">
                  Data looks correct
                </span>
              </>
            )}
          </button>

          {/* Update Church Info */}
          <button
            onClick={() => { setEditFocusField(null); setShowEditForm(true); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 transition-colors group"
          >
            <Pencil size={15} className="text-purple-400 group-hover:text-purple-300 transition-colors" />
            <span className="text-purple-300 text-sm font-medium group-hover:text-purple-200 transition-colors">
              Update Church Info
            </span>
            {missingFieldCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-white font-medium">
                {missingFieldCount} missing
              </span>
            )}
          </button>
        </div>

        {/* Denomination fact */}
        {DENOMINATION_FACTS[denomGroup] && (
          <div className="rounded-xl p-4 bg-purple-900/30 border border-purple-500/15">
            <div className="flex items-start gap-2.5">
              <BookOpen
                size={16}
                className="text-purple-400 flex-shrink-0 mt-0.5"
              />
              <div>
                <span className="text-xs uppercase tracking-wider text-purple-400/70 font-semibold block mb-1">
                  Did you know?
                </span>
                <p className="text-white/60 text-sm leading-relaxed">
                  {DENOMINATION_FACTS[denomGroup]}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Changes */}
        {correctionHistory.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={15} className="text-purple-400" />
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
                Recent Changes
              </span>
            </div>
            <div className="space-y-1.5">
              {correctionHistory.slice(0, 5).map((entry, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
                  <Check size={12} className="text-green-400/60 flex-shrink-0" />
                  <span className="text-white/50 text-xs font-medium capitalize">{entry.field === "serviceTimes" ? "Service Times" : entry.field === "pastorName" ? "Pastor" : entry.field === "homeCampusId" ? "Link to main campus" : entry.field}</span>
                  <span className="text-white/30 text-xs ml-auto">{formatTimeAgo(entry.appliedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other campuses */}
        {otherCampuses.length > 0 && (
          <div id="other-campuses">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={15} className="text-purple-400" />
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
                Other Campuses
              </span>
            </div>
            <div className="space-y-1.5">
              {otherCampuses.map((campus) => {
                const cat = getSizeCategory(campus.attendance);
                return (
                  <button
                    key={campus.id}
                    onClick={() => onChurchClick(campus)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg bg-white/4 hover:bg-white/8 transition-colors text-left group"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                        {campus.name}
                      </div>
                      <div className="text-white/40 text-xs mt-0.5">
                        {campus.denomination === "Other" || campus.denomination === "Unknown" ? "Unspecified" : campus.denomination}
                        {campus.city ? ` \u00b7 ${campus.city}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main campus (when this church is a campus) */}
        {(mainCampusSameState || mainCampusCrossState) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Home size={15} className="text-purple-400" />
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
                Main Campus
              </span>
            </div>
            <div className="space-y-1.5">
              {mainCampusSameState ? (
                <button
                  onClick={() => onChurchClick(mainCampusSameState)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg bg-white/4 hover:bg-white/8 transition-colors text-left group"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getSizeCategory(mainCampusSameState.attendance).color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                      {mainCampusSameState.name}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5">
                      {mainCampusSameState.denomination === "Other" || mainCampusSameState.denomination === "Unknown" ? "Unspecified" : mainCampusSameState.denomination}
                      {mainCampusSameState.city ? ` \u00b7 ${mainCampusSameState.city}` : ""}
                    </div>
                  </div>
                </button>
              ) : mainCampusCrossState ? (
                <button
                  onClick={() => onChurchClick(mainCampusCrossState)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg bg-white/4 hover:bg-white/8 transition-colors text-left group"
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-purple-400/60" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                      {mainCampusCrossState.name}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5">
                      {mainCampusCrossState.state}
                    </div>
                  </div>
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Nearby churches */}
        {nearbyChurches.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={15} className="text-purple-400" />
              <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
                Nearby Churches
              </span>
            </div>
            <div className="space-y-1.5">
              {nearbyChurches.map((nc) => {
                const ncCat = getSizeCategory(nc.attendance);
                return (
                  <button
                    key={nc.id}
                    onClick={() => onChurchClick(nc)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg bg-white/4 hover:bg-white/8 transition-colors text-left group"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ncCat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                        {nc.name}
                      </div>
                      <div className="text-white/40 text-xs mt-0.5">
                        {nc.denomination === "Other" || nc.denomination === "Unknown" ? "Unspecified" : nc.denomination}
                        {nc.city ? ` \u00b7 ${nc.city}` : ""}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-white/50 text-xs font-medium">
                        {nc.distance < 1
                          ? `${(nc.distance * 5280).toFixed(0)} ft`
                          : `${nc.distance.toFixed(1)} mi`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Data source note */}
        <div className="pt-3 border-t border-white/5">
          <p className="text-white/25 text-xs leading-relaxed text-center">
            Data sourced from OpenStreetMap. Attendance figures are estimates
            based on building footprint area, denomination averages, capacity
            data, and regional population scaling.
          </p>
          {church.lastVerified && (
            <p className="text-white/30 text-xs mt-1 text-center flex items-center justify-center gap-1">
              <ShieldCheck size={11} className="inline" />
              Last verified {formatTimeAgo(church.lastVerified)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Inline review section for church detail ---
const MOD_FIELD_LABELS: Record<string, string> = { name: "Church Name", website: "Website", address: "Address" };

function InlineModerationSection({
  items,
  moderatorKey,
  onAction,
}: {
  items: PendingSuggestionItem[];
  moderatorKey: string;
  onAction?: () => void;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handle = async (fn: () => Promise<any>, id: string) => {
    setActionLoading(id);
    try {
      await fn();
      onAction?.();
    } catch {
      // error handled silently
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="rounded-xl p-4 bg-purple-500/10 border border-purple-500/20 space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-purple-400/80 font-semibold flex items-center gap-1.5">
        <Shield size={11} className="text-purple-400" />
        Pending Changes
      </p>
      {items.map((s) => {
        const id = `${s.churchId}-${s.field}`;
        const isActing = actionLoading === id;
        const currentDisplay = formatModerationDisplayValue(s.field, s.currentValue);
        const proposedDisplay = formatModerationDisplayValue(s.field, s.proposedValue);
        const isWebsite = s.field === "website";
        const currentIsUrl = isWebsite && /^https?:\/\//i.test(s.currentValue ?? "");
        const proposedIsUrl = isWebsite && /^https?:\/\//i.test(s.proposedValue);
        return (
          <div key={id} className="space-y-1">
            <span className="text-purple-300 text-[10px] uppercase tracking-wider font-semibold">
              {MOD_FIELD_LABELS[s.field] || s.field}
            </span>
            {s.alreadyApplied && (
              <p className="text-[10px] uppercase tracking-wider text-amber-400/90 font-medium">Already applied</p>
            )}
            {s.currentValue != null && s.currentValue !== "" && (
              <p className="text-white/50 text-xs">
                Current:{" "}
                {currentIsUrl ? (
                  <a
                    href={s.currentValue!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 underline hover:text-white/90"
                  >
                    {currentDisplay || s.currentValue}
                  </a>
                ) : (
                  <span className="text-white/70">{currentDisplay}</span>
                )}
              </p>
            )}
            <p className="text-white text-xs">
              Proposed:{" "}
              {proposedIsUrl ? (
                <a
                  href={s.proposedValue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-300 font-medium underline hover:text-green-200"
                >
                  {proposedDisplay || s.proposedValue}
                </a>
              ) : (
                <span className="text-green-300 font-medium">{proposedDisplay}</span>
              )}
            </p>
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={() => handle(() => moderateApproveSuggestion(moderatorKey, s.churchId, s.field), id)}
                disabled={isActing}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[10px] font-medium transition-colors disabled:opacity-50"
              >
                {isActing ? <ThreeDotLoader size={10} /> : <Check size={10} />}
                Approve
              </button>
              <button
                onClick={() => handle(() => moderateRejectSuggestion(moderatorKey, s.churchId, s.field), id)}
                disabled={isActing}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600/20 hover:bg-red-600/40 text-red-400 text-[10px] font-medium transition-colors disabled:opacity-50"
              >
                <X size={10} />
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}