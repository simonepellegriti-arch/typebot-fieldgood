import { defaultButtonLabel } from "../constants";
import type { ChoiceInputBlock } from "./schema";

export const defaultChoiceInputOptions = {
  buttonLabel: defaultButtonLabel,
  searchInputPlaceholder: "Filter the options...",
  isMultipleChoice: false,
  isSearchable: false,
  areInitialSearchButtonsVisible: true,
} as const satisfies ChoiceInputBlock["options"];

export const defaultChoiceItemResearchOptions = {
  isExclusive: false,
  hasTextInput: false,
  textInputRequired: false,
  textInputPlaceholder: "Please specify...",
} as const;

/** Video/image options and display order (all optional in saved bots). */
export const defaultChoiceMediaOptions = {
  areItemsRandomized: false,
  requireWatchBeforeSelect: false,
  minimumWatchPercentage: 80,
} as const;

/** Clip of a video option: custom play/pause/replay controls unless native ones are enabled. */
export const defaultChoiceItemMediaOptions = {
  areControlsDisplayed: false,
  isMuted: false,
} as const;
