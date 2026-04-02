export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Optional: e.g. "Mar 12, 2025" — shown below the body. */
  date?: string;
  /** Explicitly mark legacy announcements. */
  outOfDate?: boolean;
}

export const announcements: Announcement[] = [
  {
    id: "seasonal-reports-national-state",
    title: "National and state seasonal reports",
    body: "With the goal of being the most accurate church directory transparency of said data and making it public gets an upgrade through these generated reports. They will come out after every season. View them at the top dropdown.",
    date: "Mar 21, 2026",
    outOfDate: true,
  },
  {
    id: "county-view",
    title: "View by county per state",
    body: "Instead of just the state view, go deeper by selecting a county to find a church or review said churches.",
    date: "Mar 15, 2026",
    outOfDate: true,
  },
  {
    id: "core-info-review",
    title: "Sensitive church info requires review",
    body: "Changes to church name, website, or address now go through review (currently just me, Derek). Want to help? Email hey@heresmychurch.com. This helps prevent bots and spam from altering this info.",
    date: "Mar 13, 2025",
    outOfDate: true,
  },
  {
    id: "multi-campus",
    title: "Multi-campus support",
    body: "You can now link churches to a main campus and therefore multi-campus support. To do this, visit Update Church Info. Have fun linking!",
    date: "Mar 12, 2025",
    outOfDate: true,
  },
  {
    id: "reactions",
    title: "Reactions are here",
    body: "Netflix/Apple Maps style reactions: tell us whether a church is not for me, you like it, or you love it. Later we’ll bring in reviews from Google, Facebook, and Yelp.",
    date: "Mar 10, 2025",
    outOfDate: true,
  },
];
