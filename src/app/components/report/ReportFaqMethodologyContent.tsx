/**
 * Shared copy for seasonal report FAQs: methodology details also appear in Help.
 * `variant` switches typography for light (report) vs dark (help modal) surfaces.
 * `geography` scopes US-only Census / 50-states language vs country / world / region.
 */
export type ReportFaqMethodologyVariant = "report" | "help";

export type ReportFaqGeography = "us" | "country" | "world" | "region" | "all";

const STYLES: Record<
  ReportFaqMethodologyVariant,
  {
    briefSpace: string;
    detailsSpace: string;
    sectionTitle: string;
    list: string;
    em: string;
    note: string;
    crossRef: string;
  }
> = {
  report: {
    briefSpace: "space-y-2",
    detailsSpace: "space-y-3",
    sectionTitle: "font-medium text-stone-800",
    list: "list-disc pl-4 space-y-1 text-sm",
    em: "font-medium text-stone-700",
    note: "text-stone-500 text-xs",
    crossRef: "text-stone-500 text-xs",
  },
  help: {
    briefSpace: "space-y-2",
    detailsSpace: "space-y-3",
    sectionTitle: "font-medium text-white/90",
    list: "list-disc pl-4 space-y-1 text-sm text-white/70",
    em: "font-medium text-white/90",
    note: "text-white/50 text-xs",
    crossRef: "text-white/50 text-xs",
  },
};

export function SeasonalReportGenerationFaqBrief({
  variant,
  geography = "all",
  placeLabel = "this map",
  unitNoun = { one: "region", many: "regions" },
}: {
  variant: ReportFaqMethodologyVariant;
  geography?: ReportFaqGeography;
  placeLabel?: string;
  unitNoun?: { one: string; many: string };
}) {
  const s = STYLES[variant];
  const scopeLine =
    geography === "us"
      ? "National views cover all 50 states; state views focus on one state."
      : geography === "world"
        ? "Worldwide views aggregate every populated country on HMC; country views focus on one country."
        : geography === "region"
          ? `This view focuses on one ${unitNoun.one}.`
          : geography === "country"
            ? `Country views cover populated ${unitNoun.many} in ${placeLabel}; ${unitNoun.one} views focus on one ${unitNoun.one}.`
            : "Reports can cover the world, a country, or a single region depending on the page.";

  const populationLine =
    geography === "us"
      ? "Population figures come from U.S. Census data for density metrics. Community correction counts reflect approved suggestions merged into the directory, not every submission."
      : "Population figures are used for density metrics where available. Community correction counts reflect approved suggestions merged into the directory, not every submission.";

  return (
    <div className={`${s.briefSpace} leading-relaxed`}>
      <p>
        Each seasonal overview is a snapshot of the same church records that power the map, built when we
        publish that season. {scopeLine} We aggregate counts, attendance, denominations, languages,
        completeness, spotlights, and rankings in one pass.
      </p>
      <p>{populationLine}</p>
      <p className={s.note}>
        The timestamp on the page is when that snapshot was generated—the live map can change before the
        next publish.
      </p>
      <p className={s.crossRef}>
        See <span className={s.em}>How are the numbers calculated and presented?</span> for the exact rules
        behind completeness, percentages, and trends.
      </p>
    </div>
  );
}

export function SeasonalReportMethodologyFaqDetails({
  variant,
  geography = "all",
  placeLabel = "this map",
  unitNoun = { one: "region", many: "regions" },
}: {
  variant: ReportFaqMethodologyVariant;
  geography?: ReportFaqGeography;
  placeLabel?: string;
  unitNoun?: { one: string; many: string };
}) {
  const s = STYLES[variant];
  const unitOne = unitNoun.one;
  const unitMany = unitNoun.many;

  return (
    <div className={s.detailsSpace}>
      <p className="leading-relaxed">
        These are the definitions and calculations we use so the numbers stay consistent and
        explainable—our layer on top of the raw directory data.
      </p>
      <div className="space-y-2">
        <p className={s.sectionTitle}>Geography and scope</p>
        <ul className={s.list}>
          {geography === "us" || geography === "all" ? (
            <li>
              {geography === "all"
                ? "U.S. national views use all 50 states (Alaska and Hawaii included). For rankings and cross-state comparisons we merge D.C.'s church count into Maryland (same as the live map) so we don't double-count the metro area."
                : "National views use all 50 states (Alaska and Hawaii included). For rankings and cross-state comparisons we merge D.C.'s church count into Maryland (same as the live map) so we don't double-count the metro area."}
            </li>
          ) : null}
          {geography === "world" || geography === "all" ? (
            <li>
              Worldwide views aggregate populated countries on HMC. Rankings compare countries (or
              regions within a country report).
            </li>
          ) : null}
          {geography === "country" ? (
            <li>
              This report covers populated {unitMany} in {placeLabel}. Rankings and density tables use
              those {unitMany}.
            </li>
          ) : null}
          {geography === "region" || geography === "us" || geography === "all" ? (
            <li>
              {geography === "region"
                ? `This view filters to one ${unitOne}. County or local sections need valid latitude and longitude so we can place each church; churches without coordinates still count toward totals but may be absent from local tables.`
                : "State views filter to that state only. County sections need valid latitude and longitude so we can place each church in a county; churches without coordinates still count toward state totals but may be absent from county tables."}
            </li>
          ) : null}
          {geography === "country" ? (
            <li>
              {unitOne.charAt(0).toUpperCase() + unitOne.slice(1)} views (when published) filter to that{" "}
              {unitOne} only. Churches without coordinates still count toward totals but may be absent from
              local breakdowns.
            </li>
          ) : null}
        </ul>
      </div>
      <div className="space-y-2">
        <p className={s.sectionTitle}>“Needs review” and completeness scores</p>
        <ul className={s.list}>
          <li>
            A church is <span className={s.em}>complete</span> when it has a name and a meaningful street
            address (not only city/region)—enough to verify the pin on the map. It is flagged{" "}
            <span className={s.em}>needs review</span> when either is missing. Rankings use{" "}
            <span className={s.em}>% complete</span> as the share of churches in that {unitOne} that are{" "}
            <em>not</em> in that bucket.
          </li>
          <li>
            Separate percentages (website, phone, service times, etc.) count each field on its own and do
            not gate needs-review. &quot;Has a contact path&quot; means website <em>or</em> a phone number
            with at least 10 digits.
          </li>
        </ul>
      </div>
      <div className="space-y-2">
        <p className={s.sectionTitle}>Denominations and languages</p>
        <ul className={s.list}>
          <li>
            Denominations are grouped into fixed buckets (Catholic, Baptist, Non-denominational, etc.) by
            matching keywords in the stored label—first match wins. Anything that doesn&apos;t match lands in{" "}
            <span className={s.em}>Unspecified</span>.
          </li>
          <li>
            <span className={s.em}>Regional patterns</span> highlight groups where a {unitOne}&apos;s share is
            more than <em>twice</em> the overall share for this report; we only consider {unitMany} with at
            least 20 churches so small samples don&apos;t dominate.
          </li>
          <li>
            Language diversity uses structured language tags when present. If a church only lists English, we
            also infer likely languages from name patterns (e.g. Korean, Spanish, Vietnamese). That&apos;s a
            heuristic, not a claim about every service.
          </li>
        </ul>
      </div>
      <div className="space-y-2">
        <p className={s.sectionTitle}>Attendance, density, and spotlights</p>
        <ul className={s.list}>
          <li>
            Attendance on each record is the same estimate described under &quot;Where does the data come
            from?&quot; We sum those estimates for big-picture totals and compute median, 25th, and
            75th percentiles using only churches with an attendance value greater than zero.
          </li>
          <li>
            <span className={s.em}>Churches per 10,000 people</span> is (church count ÷ population) ×
            10,000 when population is available. <span className={s.em}>People per church</span> is
            population ÷ church count, rounded to a whole number.
            {geography === "us" || geography === "all"
              ? " U.S. density metrics use Census population estimates."
              : ""}
          </li>
          <li>
            Spotlights pick the ten largest churches by estimated attendance and the ten smallest among
            churches with a positive estimate (so zeros don&apos;t fill the list).
          </li>
          <li>
            Top ministry tags show how often each tag appears among churches that list at least one
            ministry—percentages are relative to that subset, not all churches.
          </li>
        </ul>
      </div>
      <div className="space-y-2">
        <p className={s.sectionTitle}>Percentages, community stats, and trends</p>
        <ul className={s.list}>
          <li>
            Most percentages are rounded to one decimal place. Tiny non-zero values are shown as at least
            0.1% and incomplete totals as at most 99.9% so rounding doesn&apos;t read as exactly 0% or 100%
            when the underlying data isn&apos;t.
          </li>
          <li>
            Community correction counts come from approved merges into the directory. Season-over-season
            &quot;trending&quot; sections compare this snapshot to the <em>previous published</em> season
            (church counts, share shifts by denomination, quality movers, etc.), not day-to-day edits.
          </li>
          {(geography === "us" || geography === "region" || geography === "all") && (
            <li>
              On state pages, &quot;how we compare&quot; ranks use the same census populations and per-state
              church totals (with D.C. folded into Maryland). Peer states are neighbors in the sorted lists, not
              a formal statistical model.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
