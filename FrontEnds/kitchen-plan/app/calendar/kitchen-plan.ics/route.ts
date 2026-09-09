const seedMeals = [
  "Beef Tacos & Black Beans",
  "Sheet-Pan Lemon-Herb Chicken",
  "Chicken-Feta Chopped Salad",
];

function easternDate(offset: number) {
  const value = new Date(Date.now() + offset * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}${part("month")}${part("day")}`;
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = seedMeals.map((meal, index) => {
    const date = easternDate(index);
    return [
      "BEGIN:VEVENT",
      `UID:kitchen-plan-${index}@homelab`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/New_York:${date}T180000`,
      `DTEND;TZID=America/New_York:${date}T190000`,
      `SUMMARY:${escapeIcs(meal)}`,
      `DESCRIPTION:${escapeIcs(`Open Kitchen Plan: ${origin}/\nMPID:seed-${index}`)}`,
      `URL:${origin}/`,
      "SEQUENCE:0",
      "END:VEVENT",
    ].join("\r\n");
  });

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kitchen Plan//Meal Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Kitchen Plan Preview",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"kitchen-plan.ics\"",
      "Cache-Control": "public, max-age=300",
    },
  });
}
