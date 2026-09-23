export interface TaskTemplate {
  id: string;
  label: string;
  description: string;
  tasks: string[];
}

/** Quick-start task sets — plain language, one observable step each. */
export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "search_and_compare",
    label: "Search & compare",
    description: "Find options and open one that fits",
    tasks: [
      "Search for what you need using the main search or filters.",
      "Open two options that look promising and compare them.",
      "Pick the one you'd actually book or buy and say why it's a fit.",
    ],
  },
  {
    id: "filters",
    label: "Use filters",
    description: "Narrow a list with chips or filters",
    tasks: [
      "Use the filters at the top to narrow the list to what you need.",
      "Add at least one more filter and confirm the list updates.",
      "Open one result that still looks right after filtering.",
    ],
  },
  {
    id: "checkout",
    label: "Checkout flow",
    description: "Get through booking or purchase",
    tasks: [
      "Select an option and continue toward checkout.",
      "Review price, dates, and cancellation details before paying.",
      "Reach the payment or confirmation step without getting stuck.",
    ],
  },
  {
    id: "sign_in",
    label: "Sign in / account",
    description: "Log in or manage account settings",
    tasks: [
      "Find where to sign in or create an account.",
      "Complete sign-in (or get to the screen where you'd enter credentials).",
      "Confirm you land on the signed-in home or account area.",
    ],
  },
  {
    id: "mobile_task",
    label: "Mobile task",
    description: "One focused action on a phone-sized flow",
    tasks: [
      "Complete the main action on this screen without leaving the flow.",
      "If something blocks you, note what you tried and where you got stuck.",
    ],
  },
];
