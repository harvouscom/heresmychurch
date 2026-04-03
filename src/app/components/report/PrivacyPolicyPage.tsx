import { useEffect, type ComponentType } from "react";
import { Link } from "react-router";
import {
  Shield,
  BarChart3,
  Cookie,
  Server,
  Mail,
  Globe,
  Baby,
  Clock,
} from "lucide-react";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

const EMAIL = "hey@heresmychurch.com";
const EFFECTIVE_DATE = "April 3, 2026";

type Icon = ComponentType<{ className?: string }>;

function PolicySection({
  id,
  title,
  description,
  icon: IconCmp,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: Icon;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-12 mb-8 sm:mb-10 rounded-none bg-white p-6 sm:p-10 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]"
      style={{ transform: "rotate(-0.3deg)" }}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100/60">
            <IconCmp className="h-4 w-4 text-purple-700" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl tracking-tight">{title}</h2>
        </div>
        <p className="text-pretty mt-2 text-sm text-stone-500 leading-relaxed sm:text-base">{description}</p>
      </div>
      <div className="text-stone-700 text-sm sm:text-base leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function PrivacyPolicyPage() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    const origBodyOverflow = body.style.overflow;
    const origBodyHeight = body.style.height;
    const origHtmlOverflow = html.style.overflow;
    const origHtmlHeight = html.style.height;
    const origRootHeight = root?.style.height ?? "";
    const origRootMinHeight = root?.style.minHeight ?? "";

    html.style.overflow = "visible";
    html.style.height = "auto";
    body.style.overflow = "visible";
    body.style.height = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.minHeight = "100dvh";
    }

    return () => {
      html.style.overflow = origHtmlOverflow;
      html.style.height = origHtmlHeight;
      body.style.overflow = origBodyOverflow;
      body.style.height = origBodyHeight;
      if (root) {
        root.style.height = origRootHeight;
        root.style.minHeight = origRootMinHeight;
      }
    };
  }, []);

  useEffect(() => {
    const title = "Privacy Policy — Here's My Church";
    const description =
      "How Here's My Church collects, uses, and protects information when you use the map, reports, and community features.";
    const prevTitle = document.title;
    document.title = title;

    const setMeta = (selector: string, attr: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, content);
    };
    const origin = window.location.origin;
    const url = `${origin}/privacy`;

    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:url"]', "content", url);

    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-500">
      <header>
        <div className="mx-auto max-w-3xl px-6 py-8 sm:py-10">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-purple-600 transition-colors"
            >
              <div className="w-6 h-6 rounded overflow-hidden shrink-0">
                <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
              </div>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Explore the map
            </Link>
            <span className="text-xs text-stone-400">Updated {EFFECTIVE_DATE}</span>
          </div>

          <h1 className="mt-8 text-2xl font-bold text-stone-900 sm:text-4xl tracking-tight leading-[1.1]">
            Privacy Policy
          </h1>
          <p className="text-pretty mt-2 text-base sm:text-lg text-stone-500 leading-relaxed">
            Here&apos;s My Church (&quot;HMC,&quot; &quot;we,&quot; &quot;us&quot;) explains what information is involved when you use
            heresmychurch.com and how we handle it. We designed the product to work without accounts; this policy
            describes what still applies when you browse, contribute, or use optional features.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 pb-16 sm:pb-20">
        <main>
          <PolicySection
            id="overview"
            icon={Shield}
            title="Overview"
            description="A quick summary of our approach."
          >
            <p>
              You can explore the map and most features without signing in. We use privacy-conscious analytics, host
              data on Supabase, and only ask for location when you explicitly use nearby features. Community
              submissions (adding or updating church listings) are stored so we can review and publish them.
            </p>
            <p className="text-stone-500 text-sm">
              This policy is not legal advice. If you have questions about your situation, consult a qualified
              professional.
            </p>
          </PolicySection>

          <PolicySection
            id="collection"
            icon={BarChart3}
            title="Information we process"
            description="What we may collect or generate when you use the site."
          >
            <ul className="list-disc pl-5 space-y-2 marker:text-purple-400">
              <li>
                <span className="font-medium text-stone-800">Usage and performance.</span> We use{" "}
                <a
                  href="https://usefathom.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-800 underline underline-offset-2"
                >
                  Fathom Analytics
                </a>{" "}
                to understand aggregate traffic (for example, which pages are viewed). Fathom is built to avoid
                invasive tracking; see their documentation for details on what they process.
              </li>
              <li>
                <span className="font-medium text-stone-800">Community submissions.</span> When you suggest a new
                church or updates to a listing, we store the information you submit (such as names, addresses, URLs,
                and service times) and related technical metadata needed for moderation and fraud prevention.
              </li>
              <li>
                <span className="font-medium text-stone-800">Approximate &quot;active visitors&quot; on the map.</span>{" "}
                To show a live count, the site assigns a random identifier stored in your browser (
                <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">localStorage</code>) and syncs presence
                through our backend. This is not tied to your name or email.
              </li>
              <li>
                <span className="font-medium text-stone-800">Device location (optional).</span> If you use features that
                need &quot;nearby&quot; results, your browser may share coordinates with the site. We use that to sort
                or filter results; refer to your browser or OS settings to revoke access at any time.
              </li>
              <li>
                <span className="font-medium text-stone-800">Communications.</span> If you email us (for example at{" "}
                <a href={`mailto:${EMAIL}`} className="text-purple-600 hover:text-purple-800 underline underline-offset-2">
                  {EMAIL}
                </a>
                ), we receive your message and whatever address you send from.
              </li>
            </ul>
          </PolicySection>

          <PolicySection
            id="cookies-storage"
            icon={Cookie}
            title="Cookies and browser storage"
            description="Small files and storage we use to remember choices on your device."
          >
            <ul className="list-disc pl-5 space-y-2 marker:text-purple-400">
              <li>
                <span className="font-medium text-stone-800">Cookies.</span> We set first-party cookies to remember that
                you&apos;ve seen certain in-app messages (for example, introductory or seasonal notices). These are not
                used for advertising profiles.
              </li>
              <li>
                <span className="font-medium text-stone-800">Session storage.</span> Optional location hints for nearby
                features may be cached in <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">sessionStorage</code>{" "}
                for the current browser session to improve the experience.
              </li>
              <li>
                <span className="font-medium text-stone-800">Local storage.</span> A random session id for the live
                visitor count (see above) may be stored in{" "}
                <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">localStorage</code>.
              </li>
            </ul>
          </PolicySection>

          <PolicySection
            id="use"
            icon={Server}
            title="How we use information"
            description="Why we process data and what we don&apos;t do with it."
          >
            <ul className="list-disc pl-5 space-y-2 marker:text-purple-400">
              <li>Operate, secure, and improve heresmychurch.com and related APIs.</li>
              <li>Review, merge, or decline community submissions to keep listings accurate.</li>
              <li>Understand aggregate usage so we can prioritize fixes and features.</li>
              <li>Respond to support or legal requests when required.</li>
            </ul>
            <p className="pt-2">
              We do not sell your personal information. We do not use third-party advertising pixels on this policy&apos;s
              effective date.
            </p>
          </PolicySection>

          <PolicySection
            id="third-parties"
            icon={Globe}
            title="Third-party services"
            description="Vendors and public services the product relies on."
          >
            <ul className="list-disc pl-5 space-y-2 marker:text-purple-400">
              <li>
                <span className="font-medium text-stone-800">Supabase</span> hosts our database and server-side logic for
                the map and submissions.
              </li>
              <li>
                <span className="font-medium text-stone-800">OpenStreetMap and related tools</span> provide map data and,
                when you add a church by address, may receive geocoding queries (for example via Nominatim) subject to
                their policies.
              </li>
              <li>
                <span className="font-medium text-stone-800">Fathom</span> processes analytics as described above.
              </li>
            </ul>
            <p className="text-stone-500 text-sm pt-1">
              Each provider has its own privacy practices; we encourage you to read their policies if you want more
              detail.
            </p>
          </PolicySection>

          <PolicySection
            id="retention-rights"
            icon={Clock}
            title="Retention and your choices"
            description="How long we keep data and steps you can take."
          >
            <p>
              We retain submissions and operational logs as needed to run the service, comply with law, and resolve
              disputes. Aggregate analytics may be retained according to our analytics provider&apos;s settings.
            </p>
            <p>
              You can clear cookies and browser storage from your device settings. You can disable location sharing in
              your browser. For requests related to information you submitted (for example, correction or deletion of a
              contribution), contact us at{" "}
              <a href={`mailto:${EMAIL}`} className="text-purple-600 hover:text-purple-800 underline underline-offset-2">
                {EMAIL}
              </a>
              . We&apos;ll respond as required by applicable law.
            </p>
          </PolicySection>

          <PolicySection
            id="children"
            icon={Baby}
            title="Children"
            description="The map is intended for a general audience."
          >
            <p>
              HMC is not directed at children under 13, and we do not knowingly collect personal information from them. If
              you believe a child has submitted personal data through the site, contact us and we will take appropriate
              steps.
            </p>
          </PolicySection>

          <PolicySection
            id="changes-contact"
            icon={Mail}
            title="Changes and contact"
            description="When we update this policy and how to reach us."
          >
            <p>
              We may update this policy from time to time. The &quot;Updated&quot; date at the top of the page will change when
              we do; for significant changes we may also post a notice on the site.
            </p>
            <p>
              Questions about privacy:{" "}
              <a href={`mailto:${EMAIL}`} className="text-purple-600 hover:text-purple-800 underline underline-offset-2">
                {EMAIL}
              </a>
              .
            </p>
          </PolicySection>
        </main>
      </div>
    </div>
  );
}
