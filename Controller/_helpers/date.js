// controllers/_helpers/date.js
export function parseBirthDate(input) {
  // Accepts: Date, ISO string "YYYY-MM-DD", or anything JS Date can parse reliably.
  // Returns a Date or null. (We don't throw for convenience.)
  if (!input) return null;
  if (input instanceof Date && !isNaN(input.valueOf())) return input;

  // Common case from HTML <input type=date>: "YYYY-MM-DD"
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // prefer exact YYYY-MM-DD
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (ymd) {
      const dt = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00.000Z`);
      return isNaN(dt.valueOf()) ? null : dt;
    }

    // fallback: let Date parse
    const dt = new Date(trimmed);
    return isNaN(dt.valueOf()) ? null : dt;
  }

  // anything else -> try to construct
  const dt = new Date(input);
  return isNaN(dt.valueOf()) ? null : dt;
}
