export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Optional: e.g. "Mar 12, 2025" — shown below the body. */
  date?: string;
}

export const announcements: Announcement[] = [
  {
    id: "core-info-review",
    title: "Updates to main church info requires review",
    body: "Changes to church name, website, or address now go through review (currently just me, Derek). Want to help? Email hey@heresmychurch.com. This helps prevent bots and spam from altering this info.",
    date: "Mar 13, 2025",
  },
  {
    id: "multi-campus",
    title: "Multi-campus support",
    body: "You can now link churches to a main campus and therefore multi-campus support. To do this, visit Update Church Info. Have fun linking!",
    date: "Mar 12, 2025",
  },
  {
    id: "reactions",
    title: "Reactions are here",
    body: "Netflix/Apple Maps style reactions: tell us whether a church is not for me, you like it, or you love it. Later we’ll bring in reviews from Google, Facebook, and Yelp.",
    date: "Mar 10, 2025",
  },
];
