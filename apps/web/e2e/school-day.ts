/** The seeded school is off on Fridays (Asia/Dhaka); journeys that mark today's register skip then. */
export const isSchoolOffToday = (): boolean =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Dhaka",
  }) === "Friday"
