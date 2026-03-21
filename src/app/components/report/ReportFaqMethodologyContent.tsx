/**
 * Shared copy for seasonal report FAQs: methodology details also appear in Help.
 * `variant` switches typography for light (report) vs dark (help modal) surfaces.
 */
export type ReportFaqMethodologyVariant = "report" | "help";

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
}: {
  variant: ReportFaqMethodologyVariant;
}) {
  const s = STYLES[variant];
  return (
    <div className={`${s.briefSpace} leading-relaxed`}>
      <p>
        Each seasonal overview is a snapshot of the same church records that power the map, built when we
        publish that season. National views cover all 50 states; state views focus on one state. We
        aggregate counts, attendance, denominations, languages, completeness, spotlights, and rankings in
        one pass.
      </p>
      <p>
        Population figures come from U.S. Census data for density metrics. Community correction counts
        reflect approved suggestions merged into the directory, not every submission.
      </p>
      <p className={s.note}>
        The timestamp on the page is when that snapshot was generated—the live map can change before the
        next publish.
      </p>
      <p className={s.crossRef}>
        Open <span className={s.em}>How we calculate and present the numbers</span> for the exact rules
        behind completeness, percentages, and trends.
      </p>
    </div>
  );
}

export function SeasonalReportMethodologyFaqDetails({
  variant,
}: {
  variant: ReportFaqMethodologyVariant;
}) {
  const s = STYLES[variant];
  return (
    <div className={s.detailsSpace}>
      <p className="leading-relaxed">
        These are the definitions and calculations we use so the numbers stay consistent and
        explainable—our layer on top of the raw directory data.
      </p>
      <div className="space-y-2">
        <p className={s.sectionTitle}>Geography and scope</p>
        <ul className={s.list}>
          <li>
            National views use all 50 states (Alaska and Hawaii included). For rankings and cross-state
            comparisons we merge D.C.&apos;s church count into Maryland (same as the live map) so we
            don&apos;t double-count the metro area.
          </li>
          <li>
            State views filter to that state only. County sections need valid latitude and longitude so
            we can place each church in a county; churches without coordinates still count toward state
            totals but may be absent from county tables.
          </li>
        </ul>
      </div>
      <div className="space-y-2">
        <p className={s.sectionTitle}>“Needs review” and completeness scores</p>
        <ul className={s.list}>
          <li>
            We treat four fields as core: a meaningful street address (not only city/state), a website
            that looks like a real URL, service times that aren&apos;t empty placeholders (e.g. &quot;see
            website&quot;, &quot;TBD&quot;), and a denomination other than blank / Unknown / Other.
          </li>
          <li>
            A church is flagged <span className={s.em}>needs review</span> when{" "}
            <span className={s.em}>two or more</span> of those are missing. Rankings use{" "}
            <span className={s.em}>% complete</span> as the share of churches in that state or county that
            are <em>not</em> in that bucket.
          </li>
          <li>
            Separate percentages (website, phone, service times, etc.) count each field on its own.
            &quot;Has a contact path&quot; means website <em>or</em> a phone number with at least 10 digits.
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
            <span className={s.em}>Regional patterns</span> highlight groups where a state&apos;s share is
            more than <em>twice</em> the national share; we only consider states with at least 20 churches so
            small samples don&apos;t dominate.
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
            <span className={s.em}>Churches per 10,000 people</span> is (church count ÷ census population) ×
            10,000. <span className={s.em}>People per church</span> is population ÷ church count, rounded to a
            whole number.
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
          <li>
            On state pages, &quot;how we compare&quot; ranks use the same census populations and per-state
            church totals (with D.C. folded into Maryland). Peer states are neighbors in the sorted lists, not
            a formal statistical model.
          </li>
        </ul>
      </div>
    </div>
  );
}
