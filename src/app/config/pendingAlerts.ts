export interface PendingAlert {
  id: string;
  shortLabel: string;
  description: string;
  /** Optional: e.g. "1–2 days", "2 weeks" — shown below the description. */
  estimatedResolution?: string;
  resolved?: boolean;
}

/** Set to true to show the Known issues pill, panel, and "Report an issue" in the Help modal. */
export const reportIssueEnabled = false;

export const reportErrorsContact = {
  label: "Report an issue",
  mailto: "your@email.com", // or href for a form
};

export const pendingAlerts: PendingAlert[] = [
  {
    id: "ia-tx-nw-quadrant",
    shortLabel: "Data gap: IA & TX NW quadrants",
    description:
      "After improving church attendance data accuracy we didn't complete the NW quadrant of Iowa and Texas. We'll fill these in soon.",
    estimatedResolution: "1–2 days",
    resolved: true,
  },
];
