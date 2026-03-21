import { useState } from "react";
import { Mail, Copy, Check, AlertCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { CloseButton } from "./ui/close-button";
import { reportErrorsContact } from "../config/pendingAlerts";
import { SeasonalReportMethodologyFaqDetails } from "./report/ReportFaqMethodologyContent";
import logoImg from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

const EMAIL = "hey@heresmychurch.com";

function XLogoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function HelpModal({
  onClose,
  showReportIssue = true,
  onReportIssue,
}: {
  onClose: () => void;
  showReportIssue?: boolean;
  onReportIssue?: () => void;
}) {
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(EMAIL);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        style={{ backgroundColor: "#1E1040" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-col items-center text-center px-6 pt-6 pb-4 border-b border-white/10 flex-shrink-0">
          <CloseButton
            onClick={onClose}
            size="md"
            className="absolute top-4 right-4"
          />
          <div className="w-16 h-16 rounded-xl overflow-hidden mb-3">
            <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-white font-medium text-[22px] leading-tight">Need Help?</h2>
          <p className="text-white/60 text-sm leading-relaxed mt-3 text-pretty">
            Get in touch or check the answers below.
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <p className="text-white/40 text-[11px] uppercase tracking-wider font-medium mb-3">
            Contact & report
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            <div
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
            >
              <Mail size={14} className="flex-shrink-0" />
              <a
                href={`mailto:${EMAIL}`}
                className="hover:text-white/90 transition-colors min-w-0 truncate"
              >
                {EMAIL}
              </a>
              <button
                type="button"
                onClick={handleCopyEmail}
                aria-label="Copy email"
                className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors text-white/40 hover:text-white/70"
              >
                {copiedEmail ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Copy size={12} aria-hidden />
                )}
              </button>
            </div>
            {showReportIssue &&
              (onReportIssue ? (
                <button
                  type="button"
                  onClick={onReportIssue}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
                >
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {reportErrorsContact.label}
                </button>
              ) : (
                reportErrorsContact.mailto && (
                  <a
                    href={`mailto:${reportErrorsContact.mailto}?subject=Issue%20report`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
                  >
                    <AlertCircle size={14} className="flex-shrink-0" />
                    {reportErrorsContact.label}
                  </a>
                )
              ))
            }
            <a
              href="https://x.com/heresmychurch"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 transition-colors"
            >
              <XLogoIcon size={14} />
              @heresmychurch
            </a>
          </div>

          <p className="text-white/40 text-[11px] uppercase tracking-wider font-medium mb-3">
            Common questions
          </p>
          <Accordion type="single" collapsible className="border-white/10">
            <AccordionItem value="this-project" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                What is this project?
              </AccordionTrigger>
              <AccordionContent className="text-white/70 space-y-2">
                <p>
                  Here&apos;s My Church (HMC) is a free, open-source, interactive map that helps people
                  discover Christian churches across all 50 U.S. states. No account needed. You can
                  browse by state, search and filter by denomination, size, or language, view church
                  details (address, website, service times, and more), and contribute by adding
                  churches or suggesting edits.
                </p>
                <p className="text-white/50 text-xs">
                  Started by Derek Castelli, who&apos;s also building a Bible notes app called{" "}
                  <a href="https://harvous.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70 transition-colors">Harvous</a>.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="goals" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                What are the goals?
              </AccordionTrigger>
              <AccordionContent className="text-white/70">
                The goal is simple: make it easy for anyone to find a church near them, with data
                that&apos;s actually up to date. We want every church to be included and kept
                accurate through community contributions.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="data-source" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                Where does the data come from?
              </AccordionTrigger>
              <AccordionContent className="text-white/70">
                We use OpenStreetMap church data with denomination matching, ARDA (Association of
                Religion Data Archives) reference data, U.S. Census population data,
                and community-submitted churches and corrections. Attendance estimates
                are primarily based on building footprint area from OpenStreetMap, with
                denomination averages, capacity data, and regional population scaling
                used where building data is not available.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="methodology-numbers" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                How we calculate and present the numbers
              </AccordionTrigger>
              <AccordionContent className="text-white/70 text-sm leading-relaxed">
                <SeasonalReportMethodologyFaqDetails variant="help" />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="add-church" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                How do I add a church?
              </AccordionTrigger>
              <AccordionContent className="text-white/70 space-y-2">
                <p>
                  Click any state on the map to zoom in, then use the &quot;Add a Church&quot; button
                  in the state summary panel. You can also start a search and you&apos;ll see the
                  option to add your church. No account is required.
                </p>
                <p className="text-white/50 text-xs italic">
                  We encourage you to find your church first; if it&apos;s already listed, please
                  update the information instead of adding a duplicate.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="suggest-edit" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                How do I suggest an edit or correct information?
              </AccordionTrigger>
              <AccordionContent className="text-white/70">
                Click a church on the map to open its detail panel, then use the &quot;Update Church
                Info&quot; button to suggest corrections or add missing details (address, service
                times, website, etc.). Submissions are reviewed and merged to keep the map accurate.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="how-we-compare" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                How does HMC compare to other directories?
              </AccordionTrigger>
              <AccordionContent className="text-white/70 space-y-3">
                <p>
                  Most church directories are either a category inside a general-purpose map
                  (like Google Maps) or paid listing sites (like Church Finder or Church.org).
                  HMC is different:
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                    <span><span className="text-white/90 font-medium">Attendance estimates</span> — no other directory provides this</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                    <span><span className="text-white/90 font-medium">Language tracking</span> — see which churches offer services in other languages</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                    <span><span className="text-white/90 font-medium">Community corrections</span> — a purpose-built flow for fixing church data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                    <span><span className="text-white/90 font-medium">100% free</span> — no paid listings, no premium tiers, no sponsored results</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                    <span><span className="text-white/90 font-medium">Open source</span> — built on OpenStreetMap, fully transparent</span>
                  </li>
                </ul>
                <p className="text-white/50 text-xs">
                  See the full comparison in our{" "}
                  <a
                    href="/report/launch-2026#how-we-compare"
                    className="underline hover:text-white/70 transition-colors"
                  >
                    Launch Report
                  </a>
                  .
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="data-updates" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                How often is the data updated?
              </AccordionTrigger>
              <AccordionContent className="text-white/70">
                Reference data (e.g. OpenStreetMap, ARDA) is refreshed on a regular schedule.
                Community submissions and corrections are reviewed and merged continuously, so
                suggested edits can appear on the map after review.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="open-source" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                Is this open source?
              </AccordionTrigger>
              <AccordionContent className="text-white/70">
                Yes. The project is open source under the{" "}
                <a
                  href="https://creativecommons.org/licenses/by-nc/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white/90 transition-colors"
                >
                  Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)
                </a>{" "}
                license. You can find the code on{" "}
                <a
                  href="https://github.com/harvouscom/Heresmychurch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white/90 transition-colors"
                >
                  GitHub
                </a>
                .
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="expand-us" className="border-white/10">
              <AccordionTrigger className="text-white/90 hover:text-white hover:no-underline [&>svg]:text-white/40">
                Are there plans to expand beyond the U.S.?
              </AccordionTrigger>
              <AccordionContent className="text-white/70">
                Yes. We plan to expand to other countries in the future.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="px-6 pb-5 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-white text-sm font-medium transition-colors"
            style={{ backgroundColor: "rgba(107, 33, 168, 0.9)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "rgba(107, 33, 168, 1)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "rgba(107, 33, 168, 0.9)")
            }
          >
            Close
          </button>
          <p className="text-white/25 text-[10px] text-center mt-1.5">Version {__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
