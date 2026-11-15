/** Provider-neutral calendar event, so a Google/CalDAV source can slot in later. */
export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  isAllDay: boolean;
  /** "busy" | "free" | "tentative" | "oof" | "workingElsewhere" | "unknown" */
  showAs: string;
  isOnline: boolean;
  location?: string | null;
  organizer?: string | null;
  attendeeCount: number;
  isCancelled: boolean;
};

/** Shape stored in DailySnapshot.calendarEventsJson. */
export type CalendarDay = {
  events: CalendarEvent[];
  meetingCount: number;
  meetingMinutes: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  /** Longest uninterrupted gap between meetings, in minutes, during work hours. */
  longestFocusBlockMinutes: number;
  /** Count of meetings that start within 5 minutes of the previous one ending. */
  backToBackCount: number;
};
