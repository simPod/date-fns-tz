import { tzTokenizeDate } from '../tzTokenizeDate/index.js'
import { newDateUTC } from '../newDateUTC/index.js'

const MILLISECONDS_IN_HOUR = 3600000
const MILLISECONDS_IN_MINUTE = 60000

const patterns = {
  timezone: /([Z+-].*)$/,
  timezoneZ: /^(Z)$/,
  timezoneHH: /^([+-]\d{2})$/,
  timezoneHHMM: /^([+-])(\d{2}):?(\d{2})$/,
}

// Parse constious time zone offset formats to an offset in milliseconds
export function tzParseTimezone(
  timezoneString: string | undefined,
  date: Date | number | undefined,
  isUtcDate?: boolean
): number {
  // Empty string
  if (!timezoneString) {
    return 0
  }

  // Z
  let token = patterns.timezoneZ.exec(timezoneString)
  if (token) {
    return 0
  }

  let hours: number
  let absoluteOffset: number

  // ±hh
  token = patterns.timezoneHH.exec(timezoneString)
  if (token) {
    hours = parseInt(token[1], 10)

    if (!validateTimezone(hours)) {
      return NaN
    }

    return -(hours * MILLISECONDS_IN_HOUR)
  }

  // ±hh:mm or ±hhmm
  token = patterns.timezoneHHMM.exec(timezoneString)
  if (token) {
    hours = parseInt(token[2], 10)
    const minutes = parseInt(token[3], 10)

    if (!validateTimezone(hours, minutes)) {
      return NaN
    }

    absoluteOffset = Math.abs(hours) * MILLISECONDS_IN_HOUR + minutes * MILLISECONDS_IN_MINUTE
    return token[1] === '+' ? -absoluteOffset : absoluteOffset
  }

  // IANA time zone
  if (isValidTimezoneIANAString(timezoneString)) {
    date = new Date(date || Date.now())
    const utcDate = isUtcDate ? date : toUtcDate(date)

    const offset = calcOffset(utcDate, timezoneString)

    const fixedOffset = isUtcDate ? offset : fixOffset(date, offset, timezoneString)

    return -fixedOffset
  }

  return NaN
}

function toUtcDate(date: Date) {
  return newDateUTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  )
}

function calcOffset(date: Date, timezoneString: string) {
  const tokens = tzTokenizeDate(date, timezoneString)

  // ms dropped because it's not provided by tzTokenizeDate
  const asUTC = newDateUTC(
    tokens[0],
    tokens[1] - 1,
    tokens[2],
    tokens[3] % 24,
    tokens[4],
    tokens[5],
    0
  ).getTime()

  let asTS = date.getTime()
  const over = asTS % 1000
  asTS -= over >= 0 ? over : 1000 + over
  return asUTC - asTS
}

function fixOffset(date: Date, offset: number, timezoneString: string) {
  const localTS = date.getTime()

  // Our UTC time is just a guess because our offset is just a guess
  let utcGuess = localTS - offset

  // Test whether the zone matches the offset for this ts
  const o2 = calcOffset(new Date(utcGuess), timezoneString)

  // If so, offset didn't change, and we're done
  if (offset === o2) {
    return offset
  }

  // If not, change the ts by the difference in the offset
  utcGuess -= o2 - offset

  // If that gives us the local time we want, we're done
  const o3 = calcOffset(new Date(utcGuess), timezoneString)
  if (o2 === o3) {
    return o2
  }

  // If it's different, we're in a hole time. The offset has changed, but we don't adjust the time
  return Math.max(o2, o3)
}

function validateTimezone(hours: number, minutes?: number | null) {
  return -23 <= hours && hours <= 23 && (minutes == null || (0 <= minutes && minutes <= 59))
}

const validIANATimezoneCache: Record<string, boolean> = {}

function isValidTimezoneIANAString(timeZoneString: string) {
  if (validIANATimezoneCache[timeZoneString]) return true
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timeZoneString })
    validIANATimezoneCache[timeZoneString] = true
    return true
  } catch (error) {
    return false
  }
}
