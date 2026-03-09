import type { Church } from "./church-data";
import { getSizeCategory, getDenominationGroup, estimateBilingualProbability } from "./church-data";
import {
  X,
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
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { SuggestEditForm } from "./SuggestEditForm";
import { groupServiceTimesByDay, parseServiceTimesForDisplay } from "./ServiceTimesInput";

interface ChurchDetailPanelProps {
  church: Church;
  allChurches: Church[];
  onClose: () => void;
  onChurchClick: (church: Church) => void;
  pendingCorrectionCount?: number;
  onReviewCorrections?: () => void;
  externalShowEditForm?: boolean;
  onEditFormClosed?: () => void;
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

// Helper to render service times in a grouped format
function ServiceTimesCard({ serviceTimes }: { serviceTimes: string }) {
  const grouped = groupServiceTimesByDay(parseServiceTimesForDisplay(serviceTimes));
  return (
    <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <Clock size={14} className="text-purple-400" />
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          Service Times
        </span>
        {grouped.length > 1 && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400/70 font-semibold">
            {grouped.reduce((sum, g) => sum + g.services.length, 0)} services
          </span>
        )}
      </div>
      {grouped.length > 0 ? (
        <div className="space-y-2">
          {grouped.map((group) => (
            <div key={group.day} className="flex items-baseline gap-2.5">
              <span className="text-white/50 text-[11px] font-semibold w-12 flex-shrink-0">
                {group.dayFull.slice(0, 3)}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {group.services.map((svc, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-500/10 text-white/80 border border-purple-500/10"
                  >
                    {svc.time}
                    {svc.label && (
                      <span className="text-white/30 ml-1 text-[9px]">
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
        <p className="text-white text-xs leading-relaxed">{serviceTimes}</p>
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
    <div className="rounded-lg px-3 py-2 bg-amber-500/5 border border-amber-500/10">
      <div className="flex items-center gap-2">
        <Languages size={12} className="text-amber-400 flex-shrink-0" />
        <span className="text-[10px] text-white/50 font-medium">{label}</span>
        <span className="text-white/40 text-[10px] font-semibold tabular-nums ml-auto">{pct}%</span>
        <span className={`text-[8px] px-1 py-px rounded font-semibold ${
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
  pendingCorrectionCount,
  onReviewCorrections,
  externalShowEditForm,
  onEditFormClosed,
}: ChurchDetailPanelProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const sizeCat = getSizeCategory(church.attendance);
  const denomGroup = getDenominationGroup(church.denomination);
  const bilingualInfo = estimateBilingualProbability(church);

  // Count missing extended fields to encourage contributions
  const missingFieldCount = [
    !church.serviceTimes,
    !church.languages || church.languages.length === 0,
    !church.ministries || church.ministries.length === 0,
    !church.pastorName,
    !church.phone,
    !church.email,
  ].filter(Boolean).length;

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

  const fullAddress = [church.address, church.city, church.state]
    .filter(Boolean)
    .join(", ");

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

  // React to external trigger to show edit form
  useEffect(() => {
    if (externalShowEditForm) {
      setShowEditForm(true);
      onEditFormClosed?.();
    }
  }, [externalShowEditForm]);

  if (showEditForm) {
    return (
      <SuggestEditForm
        church={church}
        onClose={() => setShowEditForm(false)}
      />
    );
  }

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    church.name + " " + fullAddress
  )}`;

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        backgroundColor: "#1E1040",
        fontFamily: "'Livvic', sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-lg leading-tight truncate">
              {church.name}
            </h2>
            {fullAddress && (
              <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
                {fullAddress}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={18} className="text-white/60" />
          </button>
        </div>

        {/* Quick action buttons */}
        <div className="flex gap-2 mt-3">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-purple-700/60 hover:bg-purple-700/80 transition-colors"
          >
            <Navigation size={12} />
            Directions
          </a>
          {church.website ? (
            <a
              href={
                church.website.startsWith("http")
                  ? church.website
                  : `https://${church.website}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
            >
              <Globe size={12} />
              Website
              <ExternalLink size={10} className="text-white/40" />
            </a>
          ) : (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(church.name + " " + (church.city || "") + " " + church.state + " church website")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
            >
              <Search size={12} />
              Find Website
            </a>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Attendance */}
          <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                Est. Avg. Weekly Attendance
              </span>
            </div>
            <div className="text-white text-xl font-bold">
              ~{church.attendance.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: sizeCat.color }}
              />
              <span className="text-white/50 text-[11px]">
                {sizeCat.label}
              </span>
            </div>
          </div>

          {/* Denomination */}
          <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <ChurchIcon size={14} className="text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                Denomination
              </span>
            </div>
            <div className="text-white text-sm font-bold leading-snug">
              {church.denomination === "Other" || church.denomination === "Unknown" ? "Unspecified" : church.denomination}
            </div>
            <div className="text-white/40 text-[11px] mt-1.5">
              {sameDenomCount.toLocaleString()} similar in state
            </div>
          </div>
        </div>

        {/* Service Details & Language Estimate */}
        <div className="space-y-3">
          {/* Service Times */}
          {church.serviceTimes && (
            <ServiceTimesCard serviceTimes={church.serviceTimes} />
          )}

          {/* Confirmed Languages */}
          {church.languages && church.languages.length > 0 && (
            <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Languages size={14} className="text-purple-400" />
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  Languages
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {church.languages.map((lang) => (
                  <span key={lang} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Language Estimate — always shown */}
          <LanguageEstimateCard bilingualInfo={bilingualInfo} />

          {/* Ministries */}
          {church.ministries && church.ministries.length > 0 && (
            <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Heart size={14} className="text-purple-400" />
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  Ministries
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {church.ministries.map((m) => (
                  <span key={m} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/8 text-white/60 border border-white/8">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pastor & Contact */}
          {(church.pastorName || church.phone || church.email) && (
            <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
              <div className="flex items-center gap-2 mb-2.5">
                <User size={14} className="text-purple-400" />
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  Contact
                </span>
              </div>
              <div className="space-y-2">
                {church.pastorName && (
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs">Lead Pastor</span>
                    <span className="text-white text-xs font-medium">{church.pastorName}</span>
                  </div>
                )}
                {church.phone && (
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs flex items-center gap-1">
                      <Phone size={10} /> Phone
                    </span>
                    <a href={`tel:${church.phone}`} className="text-purple-300 text-xs font-medium hover:text-purple-200 transition-colors">
                      {church.phone}
                    </a>
                  </div>
                )}
                {church.email && (
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs flex items-center gap-1">
                      <Mail size={10} /> Email
                    </span>
                    <a href={`mailto:${church.email}`} className="text-purple-300 text-xs font-medium hover:text-purple-200 transition-colors">
                      {church.email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {/* Review pending corrections — pink button */}
          {pendingCorrectionCount != null && pendingCorrectionCount > 0 && onReviewCorrections && (
            <button
              onClick={onReviewCorrections}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/20 transition-colors group"
            >
              <ShieldCheck size={13} className="text-pink-400 group-hover:text-pink-300 transition-colors" />
              <span className="text-pink-300 text-xs font-semibold group-hover:text-pink-200 transition-colors">
                Review pending corrections
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-400 font-semibold">
                {pendingCorrectionCount}
              </span>
            </button>
          )}

          {/* Suggest a Correction */}
          <button
            onClick={() => setShowEditForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 transition-colors group"
          >
            <Pencil size={13} className="text-purple-400 group-hover:text-purple-300 transition-colors" />
            <span className="text-purple-300 text-xs font-semibold group-hover:text-purple-200 transition-colors">
              Suggest a Correction
            </span>
            {missingFieldCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-400 font-semibold">
                {missingFieldCount} missing
              </span>
            )}
          </button>
        </div>

        {/* Denomination fact */}
        {DENOMINATION_FACTS[denomGroup] && (
          <div className="rounded-xl p-3.5 bg-purple-900/30 border border-purple-500/15">
            <div className="flex items-start gap-2.5">
              <BookOpen
                size={14}
                className="text-purple-400 flex-shrink-0 mt-0.5"
              />
              <div>
                <span className="text-[10px] uppercase tracking-wider text-purple-400/70 font-semibold block mb-1">
                  Did you know?
                </span>
                <p className="text-white/60 text-xs leading-relaxed">
                  {DENOMINATION_FACTS[denomGroup]}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Nearby churches */}
        {nearbyChurches.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={13} className="text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
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
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/4 hover:bg-white/8 transition-colors text-left group"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ncCat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium truncate group-hover:text-purple-300 transition-colors">
                        {nc.name}
                      </div>
                      <div className="text-white/40 text-[10px] mt-0.5">
                        {nc.denomination === "Other" || nc.denomination === "Unknown" ? "Unspecified" : nc.denomination}
                        {nc.city ? ` \u00b7 ${nc.city}` : ""}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-white/50 text-[10px] font-medium">
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
          <p className="text-white/25 text-[10px] leading-relaxed text-center">
            Data sourced from OpenStreetMap. Attendance figures are estimates
            based on capacity data and denomination averages.
          </p>
        </div>
      </div>
    </div>
  );
}